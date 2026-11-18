// The design as a claude.ai artifact (standalone Claude Design closes 14 Dec 2026; projects move to
// "Migrated Design" artifacts whose files are the artifact's published files under `project/`).
//
//   dc paths [--all]                  the artifact paths to read: every mirrored file (`--all`: every file
//                                     the manifest knows), as JSON, in chunks of 200 (one Artifact read each)
//   dc import --from <dir> [--write [--overwrite-local]]
//                                     <dir> is the `out_dir` the Artifact tool's read saved files into
//                                     (<dir>/project/…). Writes <dir>/listing.json — every file found, with
//                                     its size and `etag: "sha256:<hex>"` — for `dc compare` / `dc record`;
//                                     with --write, copies each mirrored file into design_dir, byte-exact,
//                                     holding back local copies edited since the last sync (--overwrite-local
//                                     replaces them once the design has what they had).
//
// The Artifact tool belongs to Claude Code, not to a script: Claude reads, the script compares and copies.
// An artifact serves its files as they were published — no injected script, no C2PA block — so nothing is
// stripped; a file is only ever copied as read. There are no etags: the content's own sha256 stands in for
// one, and `compare` matches it against the sha256 the manifest recorded for the local copy.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { CONFIG, DESIGN, localPath, opt, flag } from './lib/config.mjs';

export const ROOT_PREFIX = () => String(CONFIG.artifact_root ?? 'project/').replace(/^\/+/, '');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Every file under a folder, as forward-slash paths relative to it. */
export function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out.sort();
}

/** The listing `compare` and `record` read, from a folder the Artifact tool saved files into. */
export function listingFrom(dir) {
  const root = join(dir, ROOT_PREFIX());
  if (!existsSync(root)) return null;
  return walk(root).map((path) => {
    const abs = join(root, path);
    return { path, type: 'file', size: statSync(abs).size, etag: `sha256:${sha(abs)}` };
  });
}

/** Pages in the artifact's page list (project/compat.json) the manifest has never seen and the mirror would keep:
 *  new canvases to read. A page the project's rename/skip rules leave unmirrored (exports, uploads) is not one. */
export function unseenPages(compat, manifest, mirrored = localPath) {
  const pages = Array.isArray(compat?.pages) ? compat.pages.map((p) => String(p.path ?? '')) : [];
  return pages.filter((p) => p && !p.includes('..') && !p.startsWith('/') && !manifest.files?.[p] && mirrored(p));
}

export function paths() {
  const mf = join(DESIGN, 'manifest.json');
  const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { files: {} };
  const all = flag('--all');
  const list = Object.entries(manifest.files ?? {})
    .filter(([remote, v]) => all || v.local || localPath(remote))
    .map(([remote]) => `${ROOT_PREFIX()}${remote}`);
  list.unshift(`${ROOT_PREFIX()}compat.json`);
  const chunks = [];
  for (let i = 0; i < list.length; i += 200) chunks.push(list.slice(i, i + 200));
  console.log(`${list.length} paths in ${chunks.length} read(s) — pass each array as the Artifact tool's \`paths\`, out_dir the same folder:`);
  for (const c of chunks) console.log(JSON.stringify(c));
  return 0;
}

export default async function run() {
  const from = opt('--from');
  if (!from) { console.error('usage: dc import --from <out_dir of the Artifact read> [--write]'); return 2; }
  const listing = listingFrom(from);
  if (!listing) { console.error(`No ${ROOT_PREFIX()} folder under ${from}: read the artifact's files with out_dir = that folder first.`); return 2; }
  writeFileSync(join(from, 'listing.json'), `${JSON.stringify(listing, null, 2)}\n`);
  console.log(`listing: ${listing.length} files → ${join(from, 'listing.json')}`);

  const mf = join(DESIGN, 'manifest.json');
  const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { files: {} };
  const compatFile = join(from, ROOT_PREFIX(), 'compat.json');
  if (existsSync(compatFile)) {
    const fresh = unseenPages(JSON.parse(readFileSync(compatFile, 'utf8')), manifest)
      .filter((p) => !listing.some((f) => f.path === p));
    if (fresh.length) console.log(`NEW PAGES not read yet — read these too, then import again:\n${fresh.map((p) => `  ${ROOT_PREFIX()}${p}`).join('\n')}`);
  }
  if (!flag('--write')) return 0;

  let wrote = 0, same = 0;
  const held = [];
  for (const f of listing) {
    const local = localPath(f.path);
    if (!local) continue;
    const src = join(from, ROOT_PREFIX(), f.path);
    const dest = join(DESIGN, local);
    const now = existsSync(dest) ? sha(dest) : null;
    if (now && `sha256:${now}` === f.etag) { same += 1; continue; }
    // A local copy edited since the last sync (its sha is not the one recorded) is never overwritten silently:
    // diff it against the read copy, publish what the design lacks, then --overwrite-local.
    const was = manifest.files?.[f.path];
    if (now && was?.sha256 && now !== was.sha256 && !flag('--overwrite-local')) { held.push(local); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    if (`sha256:${sha(dest)}` !== f.etag) { console.log(`REFUSED ${local}: the copy does not match what was read`); return 1; }
    wrote += 1;
    console.log(`wrote   ${local}: ${f.size} B`);
  }
  console.log(`${wrote} written, ${same} unchanged`);
  if (held.length) {
    console.log(`HELD (local edits since the last sync — diff each against ${join(from, ROOT_PREFIX())}, publish to the artifact what it lacks, then --overwrite-local):\n${held.map((l) => `  ${l}`).join('\n')}`);
    return 1;
  }
  return 0;
}
