// What each board says it is drawn in — read from the canvas source.
//
//   dc frames [<canvas>]
//
// Per board: the device frame component it is drawn in, or a fixed width on
// the board's own box, or none (a fluid board); with the device it declares,
// if any. Then totals, so a requirement can be judged against the design as
// it is.
//
// The size printed is the width the MOCKUP was drawn at — it says which kind
// of device and what scale to render the picture at, never a size for code.
// Code is fluid at every width (standing rule 1).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, DESIGN, owns, standingRules } from './lib/config.mjs';
import { boards, boardTags, frameOf, BETWEEN } from './lib/canvas.mjs';

const describe = (f) => (f.kind === 'component'
  ? `${f.name ?? '(unnamed component)'} frame, mockup ${f.width}×${f.height ?? '?'}`
  : f.kind === 'style' ? `plain box, mockup ${f.width} wide` : 'fluid — no frame, no width');

export default function frames(only) {
  const files = readdirSync(DESIGN).filter((f) => f.endsWith(CONFIG.canvas_ext) && (!only || f === only)).sort();
  if (!files.length) { console.error(only ? `No canvas ${only} in ${DESIGN}.` : `No canvases in ${DESIGN}.`); return 2; }
  const totals = new Map();
  let all = 0;
  for (const file of files) {
    const html = readFileSync(join(DESIGN, file), 'utf8');
    const cut = boards(html);
    const declared = new Map(boardTags(html).map((t) => [t.label, t.device]));
    const labels = [...cut.keys()].filter((l) => l !== BETWEEN);
    console.log(`\n${file}${owns(file) ? '' : '  (reference)'} — ${labels.length} boards`);
    for (const label of labels) {
      const f = frameOf(cut.get(label));
      const key = describe(f);
      totals.set(key, (totals.get(key) || 0) + 1);
      all += 1;
      const dev = declared.get(label);
      console.log(`  ${key.padEnd(28)} ${dev ? `[${CONFIG.device_attr}=${dev}] ` : ''}${label}`);
    }
  }
  console.log(`\n${all} boards:`);
  for (const [k, n] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log(standingRules());
  return 0;
}
