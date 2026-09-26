// Render artboards to PNG, so a screen is built and ticked against what the
// design draws rather than against its markup read by eye.
//
//   dc render <canvas> "<label>" [more labels…] [--out <dir>] [--scale <n>]
//
// <canvas> is a path, or a file name under design_dir. Writes
// <out>/<label>.png, one per artboard, cropped to its board element, at the
// scale its declared device sets (`device_scale`; --scale overrides it).
// The window is sized to the board (lib/shoot.mjs), never a fixed size.
// Default out: <design_dir>/screenshots/render (keep it gitignored).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DESIGN, opt, standingRules } from './lib/config.mjs';
import { boardTags } from './lib/canvas.mjs';
import { launch, shoot, scaleFor } from './lib/shoot.mjs';

export const canvasPath = (c) => (existsSync(resolve(c)) ? resolve(c) : join(DESIGN, c));
export const fileFor = (label) => `${label.replace(/[^A-Za-z0-9-]+/g, '_')}.png`;

/** Render labels from one canvas; returns { label: {path, w, h, scale} | null }. */
export async function renderBoards(canvas, labels, out, scaleOverride = null) {
  mkdirSync(out, { recursive: true });
  const file = canvasPath(canvas);
  const device = new Map(boardTags(readFileSync(file, 'utf8')).map((t) => [t.label, t.device]));
  const byScale = new Map();
  for (const label of labels) {
    const scale = scaleOverride ?? scaleFor(device.get(label));
    if (!byScale.has(scale)) byScale.set(scale, []);
    byScale.get(scale).push({ label, dest: join(out, fileFor(label)) });
  }
  const browser = await launch();
  const result = {};
  for (const [scale, items] of byScale) {
    for (const [label, shot] of Object.entries(await shoot(browser, file, items, scale))) {
      result[label] = shot && { ...shot, scale };
    }
  }
  await browser.close();
  return result;
}

export default async function run(canvas, ...rest) {
  const labels = rest.filter((a, i) => !a.startsWith('--') && !['--out', '--scale', '--root'].includes(rest[i - 1]));
  if (!canvas || !labels.length) { console.error('usage: dc render <canvas> "<label>" … [--out <dir>] [--scale <n>]'); return 2; }
  const out = opt('--out') ?? join(DESIGN, 'screenshots', 'render');
  const done = await renderBoards(canvas, labels, out, opt('--scale') ? +opt('--scale') : null);
  let missing = 0;
  for (const [label, shot] of Object.entries(done)) {
    if (shot) console.log(`${shot.path}  (${shot.w}×${shot.h} CSS px at ${shot.scale}×)`);
    else { console.error(`no artboard labelled "${label}"`); missing += 1; }
  }
  console.log(standingRules());
  return missing ? 1 : 0;
}
