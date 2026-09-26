// Where code cites a board id — file, line and the line itself.
//
//   dc cites <id> [<id>…]
//
// The same matching the map uses (lib/canvas.mjs idPattern) over the same code
// (code_roots, code_ext, skip_dirs), printed line by line so each citation can
// be read in context. Used after the design reassigns ids: a citation of an id
// that moved to another board now points at the wrong board, and only its
// context says which board it meant.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CONFIG, ROOT, DESIGN } from './lib/config.mjs';
import { idPattern } from './lib/canvas.mjs';

function codeFiles() {
  const out = [];
  const ext = new RegExp(`\\.(${CONFIG.code_ext.join('|')})$`);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (CONFIG.skip_dirs.includes(name)) continue;
      const p = join(dir, name);
      if (p === DESIGN) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (ext.test(name)) out.push(p);
    }
  };
  for (const root of CONFIG.code_roots) {
    try { walk(join(ROOT, root)); } catch { /* a root that does not exist */ }
  }
  return out;
}

/** Every line of `files` ([{path, lines}]) citing `id`, as the map matches it: [{path, line, text}]. */
export function citingLines(files, id) {
  const re = idPattern(id);
  const hits = [];
  for (const f of files) f.lines.forEach((text, i) => { if (re.test(text)) hits.push({ path: f.path, line: i + 1, text }); });
  return hits;
}

export default function cites(ids) {
  if (!ids.length) { console.error('usage: dc cites <id> [<id>…]'); return 2; }
  const files = codeFiles().map((p) => ({ path: relative(ROOT, p).replace(/\\/g, '/'), lines: readFileSync(p, 'utf8').split(/\r?\n/) }));
  let total = 0;
  for (const id of ids) {
    const hits = citingLines(files, id).map((h) => `  ${h.path}:${h.line}: ${h.text.trim().slice(0, 200)}`);
    total += hits.length;
    console.log(`${id} — ${hits.length} line${hits.length === 1 ? '' : 's'}`);
    if (hits.length) console.log(hits.join('\n'));
  }
  return total ? 0 : 1;
}
