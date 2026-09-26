// Hold the design to what the skill requires of it, before anything is
// diffed or mapped. The rules are SKILL.md's "Required of the design side".
//
//   dc lint [--demand <out.md>] [--measure]
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
//
// Each finding has a kind, which decides how the demand reaches the design:
//   attribute — an attribute or caption text on an existing element; Claude
//               Code can write it to the design itself (write_files), once
//               the user approves the exact edit;
//   structure / naming — how the canvas is built or what things are called;
//               a demand posted to the design project (put_conversation) for
//               the design side to act on.
// --demand writes every finding as that instruction, per canvas.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, DESIGN, opt, flag, changedPaths } from './lib/config.mjs';
import { boards, boardTags, boardId, BETWEEN } from './lib/canvas.mjs';
import { launch, measure } from './lib/shoot.mjs';

const devices = () => Object.keys(CONFIG.device_widths);

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

/** Findings across the project: every canvas, plus ids used more than once. */
export function lintProject(canvases /* [{canvas, html}] */) {
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

export function demandText(findings, date = new Date().toISOString().slice(0, 10)) {
  const byCanvas = new Map();
  for (const f of findings) {
    if (!byCanvas.has(f.canvas)) byCanvas.set(f.canvas, []);
    byCanvas.get(f.canvas).push(f);
  }
  return [
    `# Design requirements not met — ${date}`,
    '',
    'The code is built and checked against this design by the design-changes skill. It needs every canvas to follow the rules below; the next sync checks again. Please fix each item.',
    '',
    ...[...byCanvas].flatMap(([canvas, list]) => [
      `## ${canvas}`,
      '',
      ...list.map((f) => `- ${f.level === 'fail' ? '**Required**' : 'Asked'} · ${f.board ? `board "${f.board}"` : 'whole canvas'} — ${f.rule}. ${f.fix}`),
      '',
    ]),
  ].join('\n');
}

export default async function run() {
  if (!existsSync(DESIGN)) { console.error(`No ${CONFIG.design_dir}/ — nothing mirrored yet.`); return 2; }
  const canvases = readdirSync(DESIGN).filter((f) => f.endsWith(CONFIG.canvas_ext)).sort()
    .map((canvas) => ({ canvas, html: readFileSync(join(DESIGN, canvas), 'utf8') }));
  const found = [...lintProject(canvases), ...notesWarnings(), ...(flag('--measure') ? await measured(canvases) : [])];
  for (const f of found) {
    console.log(`${f.level === 'fail' ? 'FAIL' : 'warn'}  [${f.kind}]  ${f.canvas}${f.board ? ` :: ${f.board}` : ''} — ${f.rule}`);
  }
  const fails = found.filter((f) => f.level === 'fail').length;
  console.log(`${canvases.length} canvases · ${fails} failing · ${found.length - fails} warnings`);
  const out = opt('--demand');
  if (out && found.length) { writeFileSync(out, `${demandText(found)}\n`); console.log(`demand: ${out}`); }
  return fails ? 1 : 0;
}
