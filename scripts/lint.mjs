// Hold the design to what the skill requires of it, before anything is
// diffed or mapped. The rules are SKILL.md's "Required of the design side".
//
//   dc lint [--demand <copy.md>] [--measure]
//
// Fails (exit 1) when a canvas breaks a rule:
//   1. no artboards        — every screen is an element with board_attr
//   2. no board id         — its label or caption leads with "<id> · ";
//                            ids unique across the project
//   3. duplicate label     — labels unique within a canvas
//   4. unclosed markup     — a board closes before the next board opens
//   5. no / unknown device — every board declares device_attr, one of
//                            device_widths' keys
// Warns:
//   5. with --measure: a board whose rendered width is outside its declared
//      device's range, or whose width follows the window (no fixed frame)
//   6. a canvas changed since HEAD with no change to the notes file
//   7. a foreign file in design_dir — not mirrored, not the skill's, not in
//      `keep`: an old doc the next session would follow (repo side, never
//      demanded of the design)
//
// A finding on a canvas this repo does not own (`owns`) is reported as `ref`:
// listed, never failing here and never in this repo's demand — the repo that
// builds it demands it.
//
// Each finding has a kind, which decides how the demand reaches the design:
//   attribute — an attribute or caption text on an existing element; Claude
//               Code can write it to the design itself (write_files), once
//               the user approves the exact edit;
//   structure / naming — how the canvas is built or what things are called;
//               a demand posted to the design project (put_conversation) for
//               the design side to act on.
// The demand is ALWAYS written to <design_dir>/DEMAND.md when there is one
// (and removed when there is none), so it is committed with the sync and
// never lives in a scratchpad. --demand <path> writes a copy as well.
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CONFIG, DESIGN, REPO, opt, flag, changedPaths, owns, kept, nextIds } from './lib/config.mjs';
import { boards, boardTags, boardId, BETWEEN } from './lib/canvas.mjs';
import { launch, measure } from './lib/shoot.mjs';

const devices = () => Object.keys(CONFIG.device_widths);
export const DEMAND_FILE = 'DEMAND.md';
/** Files the skill itself keeps in design_dir. */
const SKILL_OWN = /^(manifest\.json|built-against(\.[0-9a-f]+\.bak)?\.json|SCREEN-CODE-MAP\.md|DEMAND\.md|\.diff-.*|screenshots(\/.*)?)$/;

/** Findings in one canvas's source: [{canvas, board, rule, level, kind, fix}]. */
export function lintCanvas(canvas, html) {
  const found = [];
  const add = (board, rule, kind, fix, level = 'fail') => found.push({ canvas, board, rule, level, kind, fix });
  const tags = boardTags(html);
  if (!tags.length) {
    add(null, 'no artboards', 'attribute',
      `Make every screen in this canvas an artboard: on each screen's outermost element set ${CONFIG.board_attr}="<screen name>" and ${CONFIG.device_attr}="<${devices().join('|')}>", and lead its caption with its id ("<id> · <SCREEN NAME>"). A canvas holding several screens in one element is split into one element per screen.`);
    return found;
  }
  const count = new Map();
  for (const t of tags) count.set(t.label, (count.get(t.label) ?? 0) + 1);
  for (const [label, n] of count) {
    if (n > 1) add(label, 'duplicate label', 'naming', `${n} boards are labelled "${label}". Give each its own label; keep labels stable once code cites them.`);
  }
  const cut = boards(html);
  for (const t of tags) {
    if (count.get(t.label) > 1 && tags.find((x) => x.label === t.label) !== t) continue;
    const block = cut.get(t.label) ?? '';
    if (cut.unclosed.has(t.label)) {
      add(t.label, 'markup runs into the next board', 'structure', 'Close this board\'s element before the next board opens: balanced markup, and boards never nest.');
    }
    if (CONFIG.board_id && !boardId(t.label, block)) {
      add(t.label, 'no board id', 'attribute', `Lead this board's caption (or its label) with its id: "<id> · ${t.label.toUpperCase()}". An id has at least one digit and is unique in the project.`);
    }
    if (!t.device) add(t.label, 'no device', 'attribute', `Add ${CONFIG.device_attr}="<${devices().join('|')}>" to this board's element.`);
    else if (!devices().includes(t.device)) add(t.label, `unknown device "${t.device}"`, 'attribute', `Declare one of: ${devices().join(', ')}.`);
  }
  return found;
}

/**
 * Findings across the project: every canvas, plus ids used more than once.
 * With an id scheme, every "no board id" finding carries the id it should get
 * (`proposed`), so the demand — or the approved write — names it exactly.
 */
export function lintProject(canvases /* [{canvas, html}] */, scheme = CONFIG.id_scheme) {
  const found = canvases.flatMap(({ canvas, html }) => lintCanvas(canvas, html));
  const ids = new Map();
  for (const { canvas, html } of canvases) {
    for (const [label, block] of boards(html)) {
      if (label === BETWEEN) continue;
      const id = boardId(label, block);
      if (!id) continue;
      if (!ids.has(id)) ids.set(id, []);
      ids.get(id).push(`${canvas} :: ${label}`);
    }
  }
  for (const [id, where] of ids) {
    if (where.length > 1) {
      found.push({ canvas: where[0].split(' :: ')[0], board: null, rule: `id ${id} used ${where.length} times`, level: 'fail', kind: 'naming',
        fix: `Board ids are unique across the project; ${id} is on ${where.join(', ')}. Give each board its own id.` });
    }
  }
  if (scheme) {
    const unnamed = found.filter((f) => f.rule === 'no board id');
    const fresh = nextIds(scheme, [...ids.keys()], unnamed.length);
    unnamed.forEach((f, i) => {
      f.proposed = fresh[i];
      f.fix = `Lead this board's caption (or its label) with "${fresh[i]} · ${f.board.toUpperCase()}" — ${fresh[i]} is its id under the project's scheme.`;
    });
  }
  return found;
}

/** Warnings from rendering: a board's width against its device, and fixed frames. */
async function measured(canvases) {
  const found = [];
  const browser = await launch();
  for (const { canvas } of canvases) {
    const file = join(DESIGN, canvas);
    const device = new Map(boardTags(readFileSync(file, 'utf8')).map((t) => [t.label, t.device]));
    const narrow = await measure(browser, file, 1280);
    const wide = new Map((await measure(browser, file, 1920)).map((s) => [s.label, s.w]));
    for (const s of narrow) {
      const range = CONFIG.device_widths[device.get(s.label)];
      if (wide.get(s.label) !== s.w) {
        found.push({ canvas, board: s.label, rule: `frame width follows the window (${s.w} px at 1280, ${wide.get(s.label)} px at 1920)`, level: 'warn', kind: 'structure',
          fix: 'Give the artboard\'s frame a fixed width — the device\'s width. What is inside may be fluid; the frame is one width.' });
      } else if (range && (s.w < range[0] || s.w > range[1])) {
        found.push({ canvas, board: s.label, rule: `${s.w} px wide, declared ${device.get(s.label)} (${range[0]}–${range[1]} px)`, level: 'warn', kind: 'attribute',
          fix: 'Declare the device this board draws, or size the board to its device. (A dialog board may be narrow on purpose: then say so in the notes file.)' });
      }
    }
  }
  await browser.close();
  return found;
}

/** A canvas that changed with no word in the notes file about it. */
function notesWarnings() {
  if (!CONFIG.notes_file) return [];
  const notes = join(CONFIG.design_dir, CONFIG.notes_file).replace(/\\/g, '/');
  let changed;
  try { changed = changedPaths(CONFIG.design_dir); } catch { return []; }
  const canvases = changed.filter((f) => f.path.endsWith(CONFIG.canvas_ext) && !f.state.includes('D'));
  if (!canvases.length || changed.some((f) => f.path === notes)) return [];
  const why = existsSync(join(DESIGN, CONFIG.notes_file)) ? 'did not change' : 'does not exist';
  return canvases.map((f) => ({ canvas: f.path.split('/').pop(), board: null, rule: `changed, and ${CONFIG.notes_file} ${why}`, level: 'warn', kind: 'naming',
    fix: `Say in ${CONFIG.notes_file} what this session changed in this canvas and why — the intent a file diff cannot show.` }));
}

/**
 * Files under design_dir that are neither mirrored (the manifest's local
 * paths) nor the skill's own nor kept by the project — an old doc, a stray
 * export. Repo side: fixed here, never demanded of the design.
 */
export function foreignFiles(present /* rel paths under design_dir */, mirrored /* Set */, cfg = CONFIG) {
  return present
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !mirrored.has(p) && !SKILL_OWN.test(p) && !kept(p, cfg))
    .map((p) => ({ canvas: p, board: null, rule: 'foreign file — not from the design, not the skill\'s', level: 'warn', kind: 'repo', side: 'repo',
      fix: `Not mirrored from the design project and not written by the skill. An old doc or scheme the next session would follow? Move it out of ${cfg.design_dir}/ or delete it; if it belongs here, list it in "keep" in design-changes.json.` }));
}

function listDesignDir() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'screenshots') walk(p); continue; }
      out.push(relative(DESIGN, p));
    }
  };
  walk(DESIGN);
  return out;
}

/** The design-side findings this repo demands: owned canvases, design side only. */
export const demandable = (findings) => findings.filter((f) => f.level !== 'ref' && f.side !== 'repo');

export function demandText(findings, date = new Date().toISOString().slice(0, 10), repo = REPO) {
  const byCanvas = new Map();
  for (const f of demandable(findings)) {
    if (!byCanvas.has(f.canvas)) byCanvas.set(f.canvas, []);
    byCanvas.get(f.canvas).push(f);
  }
  return [
    `# Design requirements not met — ${repo} — ${date}`,
    '',
    `The code in \`${repo}\` is built and checked against this design by the design-changes skill. It needs every canvas below to follow the rules; the next sync checks again. Please fix each item.`,
    '',
    ...[...byCanvas].flatMap(([canvas, list]) => [
      `## ${canvas}`,
      '',
      ...list.map((f) => `- ${f.level === 'fail' ? '**Required**' : 'Asked'} · ${f.board ? `board "${f.board}"` : 'whole canvas'} — ${f.rule}. ${f.fix}`),
      '',
    ]),
  ].join('\n');
}

/**
 * What the agent must settle before the demand can move — printed on every
 * run while unsettled, so it is asked THIS turn, never parked in a handoff.
 */
export function decisions(findings, cfg = CONFIG) {
  const out = [];
  const owed = demandable(findings);
  if (owed.length && !cfg.demand_mode) {
    out.push('DECIDE NOW  demand_mode is unset in design-changes.json — ask the user THIS TURN (an interactive question, not a note): "post" (a chat in the design project, the design side acts) or "write" (attribute fixes written to the design after each edit is approved; structure and naming still posted). Write the answer to the config, then deliver DEMAND.md. Never park it in a handoff.');
  }
  if (owed.some((f) => f.rule === 'no board id') && !cfg.id_scheme) {
    out.push('DECIDE NOW  id_scheme is unset and boards have no id — ask the user THIS TURN for the scheme ({"prefix": "K", "start": 1, "pad": 0} → K1, K2…), write it to the config, run lint again: every board then gets its proposed id in the demand.');
  }
  return out;
}

export default async function run() {
  if (!existsSync(DESIGN)) { console.error(`No ${CONFIG.design_dir}/ — nothing mirrored yet.`); return 2; }
  const canvases = readdirSync(DESIGN).filter((f) => f.endsWith(CONFIG.canvas_ext)).sort()
    .map((canvas) => ({ canvas, html: readFileSync(join(DESIGN, canvas), 'utf8') }));
  const manifestPath = join(DESIGN, 'manifest.json');
  const mirrored = new Set(existsSync(manifestPath)
    ? Object.values(JSON.parse(readFileSync(manifestPath, 'utf8')).files ?? {}).map((f) => f.local).filter(Boolean)
    : []);
  const found = [
    ...lintProject(canvases),
    ...notesWarnings(),
    ...(flag('--measure') ? await measured(canvases) : []),
    ...(mirrored.size ? foreignFiles(listDesignDir(), mirrored) : []),
  ].map((f) => (f.side === 'repo' || owns(f.canvas) ? f : { ...f, level: 'ref' }));
  for (const f of found) {
    const tag = { fail: 'FAIL', warn: 'warn', ref: 'ref ' }[f.level];
    console.log(`${tag}  [${f.kind}]  ${f.canvas}${f.board ? ` :: ${f.board}` : ''} — ${f.rule}${f.proposed ? ` → ${f.proposed}` : ''}`);
  }
  const fails = found.filter((f) => f.level === 'fail').length;
  const refs = found.filter((f) => f.level === 'ref').length;
  const owned = canvases.filter((c) => owns(c.canvas)).length;
  console.log(`${canvases.length} canvases (${owned} owned by ${REPO}) · ${fails} failing · ${found.length - fails - refs} warnings${refs ? ` · ${refs} on reference canvases (another repo demands those)` : ''}`);

  const demandPath = join(DESIGN, DEMAND_FILE);
  const owed = demandable(found);
  if (owed.length) {
    const text = `${demandText(found)}\n`;
    writeFileSync(demandPath, text);
    console.log(`demand: ${CONFIG.design_dir}/${DEMAND_FILE} (${owed.length} items) — commit it with the sync; deliver it as demand_mode says${CONFIG.demand_mode ? ` (${CONFIG.demand_mode})` : ''}.`);
    const copy = opt('--demand');
    if (copy) { writeFileSync(copy, text); console.log(`copy:   ${copy}`); }
  } else if (existsSync(demandPath)) {
    unlinkSync(demandPath);
    console.log(`demand: none — ${CONFIG.design_dir}/${DEMAND_FILE} removed.`);
  }
  for (const d of decisions(found)) console.log(d);
  return fails ? 1 : 0;
}
