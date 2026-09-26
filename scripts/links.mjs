// The board ↔ code map, as verified links — never as comments.
//
//   dc link "<canvas>::<board label>" --status built|partial|absent
//           [--code <file>#<Symbol>[,<file>#<Symbol>…]] [--reached "<how a person gets there>"]
//           --evidence "<what was searched and read>"
//   dc links [--check]
//
// A link is made by DISCOVERY, by the agent, following the code-discovery skill:
// `search_code` on what the board draws, `codegraph_explore` / Serena to confirm
// the symbol is bound and reached (a route, a sheet opened by a reached screen),
// and a read of the code to confirm it renders the board's elements. The script
// cannot do any of that and does not try: it stores what the agent verified and,
// on every run, checks it mechanically — the file exists, the symbol is still
// declared in it, and the board has not changed since the link was checked.
//
// A comment naming a board id is a hypothesis, never a link (code-discovery §3).
// Ids get reassigned, boards get retired, and a comment keeps pointing wherever
// the id now lands without anything noticing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DESIGN, ROOT, opt } from './lib/config.mjs';
import { boards, boardId, sha, BETWEEN } from './lib/canvas.mjs';

export const LINKS = join(DESIGN, 'SCREEN-LINKS.json');
export const STATUSES = ['built', 'partial', 'absent'];

export const loadLinks = () => (existsSync(LINKS) ? JSON.parse(readFileSync(LINKS, 'utf8')) : {});
const saveLinks = (links) => writeFileSync(LINKS, `${JSON.stringify(Object.fromEntries(Object.entries(links).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);

/** `file#Symbol` → {file, symbol}. */
export const parseCode = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
  const [file, symbol = null] = x.split('#');
  return { file: file.replace(/\\/g, '/'), symbol };
});

/**
 * Is `symbol` **declared** in `text` — not merely used there? An exact-name
 * check in one known file, for the declaration forms only: a class, mixin,
 * enum, extension or typedef; a Python `def` or `class`; a Dart function,
 * method or constructor signature (`Type name(`); a getter. A call such as
 * `return Foo(…)` is not a declaration and does not count.
 */
export function declares(text, symbol) {
  const s = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = [
    `^\\s*(?:(?:abstract|final|base|sealed|interface)\\s+)*(?:class|mixin|enum|extension|typedef)\\s+${s}\\b`,
    `^\\s*(?:async\\s+)?(?:def|class)\\s+${s}\\b`,
    `^\\s*(?!return\\b|await\\b|throw\\b|final\\b|var\\b|const\\b|if\\b|else\\b|case\\b|yield\\b|new\\b)(?:(?:static|external|factory)\\s+)*[\\w<>?,.\\[\\] ]+?\\s+${s}\\s*(?:<[^>]*>)?\\(`,
    `\\bget\\s+${s}\\b`,
  ];
  return forms.some((f) => new RegExp(f, 'm').test(text));
}

/** Problems with one link against the tree and the board as it is now. */
export function checkLink(link, block, read = (f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : null)) {
  const problems = [];
  if (block == null) return ['the board is gone from the design'];
  if (link.board_hash && link.board_hash !== sha(block)) problems.push('the board changed since this link was checked');
  for (const c of link.code ?? []) {
    const text = read(c.file);
    if (text == null) { problems.push(`${c.file} no longer exists`); continue; }
    if (c.symbol && !declares(text, c.symbol)) problems.push(`${c.symbol} is no longer declared in ${c.file}`);
  }
  if (link.status !== 'absent' && !(link.code ?? []).length) problems.push(`status ${link.status} with no code`);
  return problems;
}

function currentBlock(key) {
  const [canvas, label] = key.split('::');
  const p = join(DESIGN, canvas);
  if (!existsSync(p)) return null;
  return boards(readFileSync(p, 'utf8')).get(label) ?? null;
}

/**
 * `dc link --from <batch.json>` — many links at once, each held to exactly the
 * checks a single link gets. The batch is `[{board: "<canvas>::<label>",
 * status, code: "f#Sym,…", reached, evidence}]`. An entry that fails its
 * checks is reported and not written; the rest are.
 */
export function linkBatch(path) {
  const batch = JSON.parse(readFileSync(path, 'utf8'));
  const links = loadLinks();
  const sha1 = (() => { try { return execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } })();
  let written = 0, refused = 0;
  for (const b of batch) {
    const block = currentBlock(b.board);
    if (block == null) { console.error(`REFUSED ${b.board} — no such board`); refused += 1; continue; }
    if (!STATUSES.includes(b.status) || !b.evidence) { console.error(`REFUSED ${b.board} — status and evidence are required`); refused += 1; continue; }
    const entry = {
      id: boardId(b.board.split('::')[1], block), status: b.status, code: parseCode(b.code ?? ''),
      reached: b.reached ?? null, evidence: b.evidence, checked: new Date().toISOString().slice(0, 10), commit: sha1, board_hash: sha(block),
    };
    const problems = checkLink(entry, block);
    if (problems.length) { console.error(`REFUSED ${b.board} — ${problems.join('; ')}`); refused += 1; continue; }
    links[b.board] = entry;
    written += 1;
  }
  saveLinks(links);
  console.log(`${written} linked, ${refused} refused`);
  return refused ? 1 : 0;
}

export function link(key) {
  if (opt('--from')) return linkBatch(opt('--from'));
  if (!key || !key.includes('::')) { console.error('usage: dc link "<canvas>::<board label>" --status built|partial|absent [--code file#Symbol,…] [--reached "…"] --evidence "…"'); return 2; }
  const block = currentBlock(key);
  if (block == null) { console.error(`No board ${key} in ${DESIGN}.`); return 1; }
  const status = opt('--status');
  const evidence = opt('--evidence');
  if (!STATUSES.includes(status)) { console.error(`--status must be one of ${STATUSES.join(', ')}`); return 2; }
  if (!evidence) { console.error('--evidence is required: what was searched (search_code / codegraph / Serena) and what was read. A link without it is a guess.'); return 2; }
  const entry = {
    id: boardId(key.split('::')[1], block),
    status,
    code: parseCode(opt('--code') ?? ''),
    reached: opt('--reached') ?? null,
    evidence,
    checked: new Date().toISOString().slice(0, 10),
    commit: (() => { try { return execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } })(),
    board_hash: sha(block),
  };
  const problems = checkLink(entry, block);
  if (problems.length) { console.error(`Not linked — ${problems.join('; ')}.`); return 1; }
  const links = loadLinks();
  links[key] = entry;
  saveLinks(links);
  console.log(`linked ${key} (${entry.id ?? 'no id'}) — ${status}${entry.code.length ? `: ${entry.code.map((c) => `${c.file}${c.symbol ? `#${c.symbol}` : ''}`).join(', ')}` : ''}`);
  return 0;
}

/** Every link checked, plus the boards with none. */
export function audit(canvasFiles) {
  const links = loadLinks();
  const rows = [];
  const seen = new Set();
  for (const file of canvasFiles) {
    for (const [label, block] of boards(readFileSync(join(DESIGN, file), 'utf8'))) {
      if (label === BETWEEN) continue;
      const key = `${file}::${label}`;
      seen.add(key);
      const l = links[key];
      rows.push({ key, file, label, id: boardId(label, block), link: l ?? null, problems: l ? checkLink(l, block) : [] });
    }
  }
  const stale = Object.keys(links).filter((k) => !seen.has(k));
  return { rows, stale };
}

export function linksCommand(canvasFiles) {
  const { rows, stale } = audit(canvasFiles);
  const n = (s) => rows.filter((r) => r.link?.status === s).length;
  const broken = rows.filter((r) => r.problems.length);
  console.log(`${rows.length} boards · ${n('built')} built · ${n('partial')} partial · ${n('absent')} absent · ${rows.filter((r) => !r.link).length} not yet linked · ${broken.length} links to recheck · ${stale.length} links to boards the design no longer has`);
  for (const r of broken) console.log(`RECHECK  ${r.id ?? '—'}  ${r.key} — ${r.problems.join('; ')}`);
  for (const k of stale) console.log(`GONE     ${k}`);
  return broken.length || stale.length ? 1 : 0;
}
