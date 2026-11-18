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
  // Moving a standalone project into its own artifact keeps project_id and adds artifact_url: not a re-pairing.
  // Two different artifacts are.
  if (manifest?.artifact_url && cfg.artifact_url && manifest.artifact_url !== cfg.artifact_url) return true;
  return Boolean(manifest?.project_id && cfg.project_id && manifest.project_id !== cfg.project_id);
}

/** A listing made by `dc import` from an artifact read: its etags are the content's sha256. */
export const fromArtifact = (listing) => listing.length > 0 && listing.every((f) => String(f.etag ?? '').startsWith('sha256:'));

/** Did a file stay as it was? An artifact etag is the content's sha256, compared with the sha256 recorded for the
 *  local copy (so the first artifact sync after an MCP-era manifest does not read every file as changed). */
export function sameFile(was, f) {
  const e = String(f.etag ?? '');
  if (e.startsWith('sha256:')) return was.etag === e || (was.sha256 != null && was.sha256 === e.slice(7));
  return was.etag === f.etag;
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
    // An artifact listing holds only the files that were read: files the manifest knows but this sync did not
    // read, and that are not mirrored, are kept as they were rather than dropped.
    if (fromArtifact(listing)) {
      for (const [k, v] of Object.entries(manifest.files ?? {})) if (!v.local) files[k] = v;
    }
    for (const f of listing) {
      const local = localPath(f.path);
      const abs = local && join(DESIGN, local);
      files[f.path] = { local, size: f.size, etag: f.etag, sha256: abs && existsSync(abs) ? sha(abs) : null };
    }
    writeFileSync(MANIFEST, `${JSON.stringify({ recorded: new Date().toISOString(), project_id: CONFIG.project_id, project_name: CONFIG.project_name,
      ...(CONFIG.artifact_url ? { artifact_url: CONFIG.artifact_url } : {}), files }, null, 2)}\n`);
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
  const artifact = fromArtifact(listing);
  for (const f of listing) {
    seen.add(f.path);
    const was = manifest.files[f.path];
    if (!was) { out.NEW.push(`${f.path} (${f.size} B)`); continue; }
    const abs = was.local && join(DESIGN, was.local);
    const localSha = abs && existsSync(abs) ? sha(abs) : null;
    // An artifact file whose content already equals the local copy is in step both ways: a local edit that was
    // published to the design (or a design change already pulled) — neither CHANGED nor LOCAL-EDIT.
    if (artifact && localSha && `sha256:${localSha}` === f.etag) continue;
    if (!sameFile(was, f)) out.CHANGED.push(`${f.path} → ${was.local ?? '(not mirrored)'} (${was.size} → ${f.size} B)`);
    if (was.local && was.sha256 && localSha !== was.sha256) out['LOCAL-EDIT'].push(was.local);
  }
  // An artifact read covers the mirrored files (and the page list): an unmirrored file it did not read is not gone.
  for (const [k, v] of Object.entries(manifest.files)) if (!seen.has(k) && !(artifact && !v.local)) out.GONE.push(k);
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
