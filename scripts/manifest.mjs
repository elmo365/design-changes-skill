// Which design files moved since the last sync — decided from the Claude
// Design MCP's own etags, before anything is downloaded.
//
//   dc compare <listing.json>   what to fetch
//   dc record  <listing.json>   after a resync
//
// <listing.json> is `list_files(project_id, depth: -1)`, saved as returned.
// <design_dir>/manifest.json keeps, per project file: its local path, size,
// etag at the last sync, and the sha-256 of the local copy.
//
// `compare` reports CHANGED (etag moved — fetch it), NEW, GONE, and LOCAL-EDIT
// (the local copy no longer matches the checksum recorded at the sync: someone
// edited it by hand, and a resync would silently overwrite that). A size match
// is never proof: only the etag says a file moved, only bytes say it arrived.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESIGN, localPath } from './lib/config.mjs';

const MANIFEST = join(DESIGN, 'manifest.json');

export default function run(mode, listingPath) {
  if (!['compare', 'record'].includes(mode) || !listingPath) {
    console.error('usage: dc compare|record <listing.json>');
    return 2;
  }
  const listing = JSON.parse(readFileSync(listingPath, 'utf8')).filter((f) => f.type === 'file');
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { files: {} };
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

  if (mode === 'record') {
    const files = {};
    for (const f of listing) {
      const local = localPath(f.path);
      const abs = local && join(DESIGN, local);
      files[f.path] = { local, size: f.size, etag: f.etag, sha256: abs && existsSync(abs) ? sha(abs) : null };
    }
    writeFileSync(MANIFEST, `${JSON.stringify({ recorded: new Date().toISOString(), files }, null, 2)}\n`);
    const absent = Object.entries(files).filter(([, v]) => v.local && !v.sha256).map(([k]) => k);
    console.log(`manifest.json: ${Object.keys(files).length} files recorded${absent.length ? `; NOT LOCAL: ${absent.join(', ')}` : ''}`);
    return absent.length ? 1 : 0;
  }

  const out = { CHANGED: [], NEW: [], GONE: [], 'LOCAL-EDIT': [] };
  const seen = new Set();
  for (const f of listing) {
    seen.add(f.path);
    const was = manifest.files[f.path];
    if (!was) { out.NEW.push(`${f.path} (${f.size} B)`); continue; }
    if (was.etag !== f.etag) out.CHANGED.push(`${f.path} → ${was.local ?? '(not mirrored)'} (${was.size} → ${f.size} B)`);
    if (was.local && was.sha256) {
      const abs = join(DESIGN, was.local);
      if (!existsSync(abs) || sha(abs) !== was.sha256) out['LOCAL-EDIT'].push(was.local);
    }
  }
  for (const k of Object.keys(manifest.files)) if (!seen.has(k)) out.GONE.push(k);
  let total = 0;
  for (const [kind, list] of Object.entries(out)) {
    if (!list.length) continue;
    total += list.length;
    console.log(`${kind} (${list.length})`);
    for (const l of list) console.log(`  ${l}`);
  }
  if (!total) console.log(`Nothing moved since the sync recorded ${manifest.recorded ?? '(never)'}.`);
  return 0;
}
