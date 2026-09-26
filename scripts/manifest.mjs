// Which design files moved since the last sync — decided from the Claude
// Design MCP's own etags, before anything is downloaded.
//
//   dc compare <listing.json>   what to fetch
//   dc record  <listing.json>   after a resync
//
// <listing.json> is `list_files(project_id, depth: -1)`, saved as returned.
// <design_dir>/manifest.json keeps the project the sync came from and, per
// project file: its local path, size, etag at the last sync, and the sha-256
// of the local copy.
//
// `compare` reports CHANGED (etag moved — fetch it), NEW, GONE, and LOCAL-EDIT
// (the local copy no longer matches the checksum recorded at the sync: someone
// edited it by hand, and a resync would silently overwrite that). A size match
// is never proof: only the etag says a file moved, only bytes say it arrived.
//
// Re-pairing: when the config's project_id is not the one the manifest was
// recorded from, `compare` says so up front (every file will read CHANGED or
// GONE — expected), and `record` retires what described the old project:
// built-against.json is set aside as a .bak and SCREEN-CODE-MAP.md is
// regenerated, so no mark or map from the old design survives into the new.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, DESIGN, localPath } from './lib/config.mjs';

const MANIFEST = join(DESIGN, 'manifest.json');

/** Was the manifest recorded from a different project than the config pairs now? */
export function rePaired(manifest, cfg = CONFIG) {
  return Boolean(manifest?.project_id && cfg.project_id && manifest.project_id !== cfg.project_id);
}

export const rePairNotice = (manifest, cfg = CONFIG) =>
  `RE-PAIRED: manifest.json was recorded from ${manifest.project_name ?? '?'} (${manifest.project_id}); the config now pairs ${cfg.project_name ?? '?'} (${cfg.project_id}). Every file reads CHANGED or GONE — expected. built-against.json and SCREEN-CODE-MAP.md describe the OLD project until \`dc record\` retires them.`;

export default async function run(mode, listingPath) {
  if (!['compare', 'record'].includes(mode) || !listingPath) {
    console.error('usage: dc compare|record <listing.json>');
    return 2;
  }
  const listing = JSON.parse(readFileSync(listingPath, 'utf8')).filter((f) => f.type === 'file');
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { files: {} };
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const moved = rePaired(manifest);

  if (mode === 'record') {
    if (moved) {
      const reg = join(DESIGN, 'built-against.json');
      if (existsSync(reg)) {
        const bak = join(DESIGN, `built-against.${manifest.project_id.slice(0, 8)}.bak.json`);
        renameSync(reg, bak);
        console.log(`re-paired: built-against.json set aside as ${bak.split(/[\\/]/).pop()} — its marks were against ${manifest.project_name ?? manifest.project_id}, not this project.`);
      }
    }
    const files = {};
    for (const f of listing) {
      const local = localPath(f.path);
      const abs = local && join(DESIGN, local);
      files[f.path] = { local, size: f.size, etag: f.etag, sha256: abs && existsSync(abs) ? sha(abs) : null };
    }
    writeFileSync(MANIFEST, `${JSON.stringify({ recorded: new Date().toISOString(), project_id: CONFIG.project_id, project_name: CONFIG.project_name, files }, null, 2)}\n`);
    const absent = Object.entries(files).filter(([, v]) => v.local && !v.sha256).map(([k]) => k);
    console.log(`manifest.json: ${Object.keys(files).length} files recorded${absent.length ? `; NOT LOCAL: ${absent.join(', ')}` : ''}`);
    if (moved) {
      const { writeMap } = await import('./diff.mjs');
      console.log(`re-paired: ${writeMap()}`);
    }
    return absent.length ? 1 : 0;
  }

  if (moved) console.log(rePairNotice(manifest));
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
