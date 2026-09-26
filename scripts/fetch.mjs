// Fetch files from the Claude Design project into design_dir, byte-exact.
//
//   DESIGN_SERVE_URL='<serve_url>' dc fetch --listing <listing.json> [--changed] [--missing] [--only <path> …]
//   dc fetch --listing <listing.json> --fix-local
//
// Found against a live project (2026-09-25):
// - One `render_preview` token serves every file in the project for about an
//   hour, so one call (on any path) covers a whole sync.
// - Text comes back with the preview server's injected style and script
//   (`data-omelette-injected`) plus a blank line; those are stripped.
// - Images: uploads and some JPGs come back with a C2PA provenance block added
//   (a JPEG APP11 segment, or a PNG `caBX` chunk). Removing it gives the listed
//   size exactly.
// - Nothing is written unless its final size equals the size `list_files`
//   reports.
//
// `--fix-local` repairs local images committed with the C2PA block still in.
// The serve URL carries a token: environment only, never saved, never printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DESIGN, localPath, opt, flag } from './lib/config.mjs';

const TEXT = ['.html', '.md', '.js', '.jsx', '.css', '.json', '.txt', '.svg'];
const IMAGE = ['.png', '.jpg', '.jpeg', '.webp'];
const ends = (s, list) => list.some((e) => s.toLowerCase().endsWith(e));

const stripText = (b) =>
  Buffer.from(b.toString('latin1')
    .replace(/<(style|script)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>(\n\n)?/g, ''), 'latin1');

function stripJpeg(b) {
  const out = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { out.push(b.subarray(i)); break; }
    const marker = b[i + 1];
    if (marker === 0xda) { out.push(b.subarray(i)); break; } // start of scan: image data
    const len = b.readUInt16BE(i + 2);
    if (marker !== 0xeb) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(out);
}

function stripPng(b) {
  const out = [b.subarray(0, 8)];
  let i = 8;
  while (i < b.length) {
    const n = b.readUInt32BE(i);
    if (b.toString('latin1', i + 4, i + 8) !== 'caBX') out.push(b.subarray(i, i + 12 + n));
    i += 12 + n;
  }
  return Buffer.concat(out);
}

function clean(remote, b) {
  const low = remote.toLowerCase();
  if (ends(low, TEXT)) return stripText(b);
  if (/\.jpe?g$/.test(low) && b[0] === 0xff && b[1] === 0xd8) return stripJpeg(b);
  if (low.endsWith('.png') && b.toString('latin1', 1, 4) === 'PNG') return stripPng(b);
  return b;
}

export default async function run() {
  const listingPath = opt('--listing');
  if (!listingPath) { console.error('usage: dc fetch --listing <listing.json> [--changed] [--missing] [--only …] | --fix-local'); return 2; }
  const listing = new Map(JSON.parse(readFileSync(listingPath, 'utf8')).filter((f) => f.type === 'file').map((f) => [f.path, f]));

  if (flag('--fix-local')) {
    let fixed = 0, bad = 0;
    for (const [remote, f] of listing) {
      const local = localPath(remote);
      if (!local || !ends(remote, IMAGE)) continue;
      const p = join(DESIGN, local);
      if (!existsSync(p) || statSync(p).size === f.size) continue;
      const s = clean(remote, readFileSync(p));
      if (s.length === f.size) { writeFileSync(p, s); fixed += 1; console.log(`fixed   ${local}: ${s.length} B (C2PA removed)`); }
      else { bad += 1; console.log(`CANNOT  ${local}: stripped ${s.length}, listed ${f.size} — refetch it`); }
    }
    console.log(`${fixed} repaired, ${bad} still wrong`);
    return bad ? 1 : 0;
  }

  const serve = process.env.DESIGN_SERVE_URL;
  if (!serve) { console.error('Set DESIGN_SERVE_URL to the serve_url of one render_preview call.'); return 2; }
  const u = new URL(serve);
  const token = u.searchParams.get('t');
  const base = `${u.origin}${u.pathname.split('/serve/')[0]}/serve/`;

  const onlyAt = process.argv.indexOf('--only');
  const wanted = onlyAt >= 0 ? process.argv.slice(onlyAt + 1).filter((a) => !a.startsWith('--')) : [];
  if (flag('--changed') || flag('--missing')) {
    const mf = join(DESIGN, 'manifest.json');
    const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')).files : {};
    for (const [remote, f] of listing) {
      const local = localPath(remote);
      if (!local) continue;
      const was = manifest[remote];
      if (flag('--changed') && (!was || was.etag !== f.etag)) wanted.push(remote);
      if (flag('--missing') && !existsSync(join(DESIGN, local))) wanted.push(remote);
    }
  }

  let ok = 0, failed = 0;
  for (const remote of [...new Set(wanted)]) {
    const f = listing.get(remote), local = localPath(remote);
    if (!f || !local) { console.log(`skip    ${remote} (not listed, or not mirrored)`); continue; }
    const url = `${base}${remote.split('/').map(encodeURIComponent).join('/')}?${new URLSearchParams({ t: token, direct: '1' })}`;
    let raw;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'curl/8.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      failed += 1; console.log(`FAILED  ${remote}: ${e.message}`); continue;
    }
    const data = clean(remote, raw);
    if (data.length !== f.size) {
      failed += 1;
      console.log(`REFUSED ${remote}: ${raw.length} B served, ${data.length} after cleaning, ${f.size} listed — not written`);
      continue;
    }
    const dest = join(DESIGN, local);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
    ok += 1;
    console.log(`wrote   ${local}: ${data.length} B${raw.length !== data.length ? ` (${raw.length - data.length} B injected, removed)` : ''}`);
  }
  console.log(`${ok} written, ${failed} refused`);
  return failed ? 1 : 0;
}
