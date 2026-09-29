// Vet a built screen against its board: the app's screenshot beside the
// rendered artboard, at the board's own width, with numbered bands down both
// — plus the board's copy as a checklist, so every element gets its own
// verdict.
//
//   dc vet <canvas> "<board label>" --shot <app screenshot.png> [--out <dir>]
//
// Writes <out>/<label>.vet.png (the sheet) and <out>/<label>.vet.md (the
// checklist). Default out: <design_dir>/screenshots/vet.
//
// Nothing here is sized for one kind of device. The board is measured: the
// app screenshot is scaled to the board's width, a tall board (phone, tablet
// portrait) sits beside the app and a wide one (desktop, landscape) sits
// above it, and the bands are fractions of each image's own height, so band
// n is the same relative height on both.
//
// **Not a pixel gate.** An app renders with its own fonts at its own width
// and a board is one width of HTML, so pixels always differ. The sheet is for
// looking: element by element, the board beside what the device drew.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG, DESIGN, opt, standingRules } from './lib/config.mjs';
import { boards, devicesOf, copyLines, boardId } from './lib/canvas.mjs';
import { launch } from './lib/shoot.mjs';
import { renderBoards, canvasPath, fileFor } from './render.mjs';

/** How the app screenshot is taken, by the project's `platform`. */
export const CAPTURE = {
  android: 'adb exec-out screencap -p > shot.png   (a device or emulator, the real app on real data)',
  ios: 'xcrun simctl io booted screenshot shot.png   (or the device\'s own screenshot)',
  desktop: 'the app\'s own capture: a UI/widget test that saves the rendered window as PNG, or a window capture of the running app at its real size',
  web: 'from the skill folder: npx playwright screenshot --viewport-size=<board width>,<board height> <app url> shot.png',
};

export const BANDS = 20;

/** A board's shape decides the sheet: wide boards stack, tall ones sit side by side. */
export function sheetLayout(boardW, boardH) {
  const wide = boardW > boardH;
  return { wide, column: boardW, direction: wide ? 'column' : 'row' };
}

/** PNG width and height from its header, or null when it is not a PNG. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const captureHint = () => (CONFIG.platform && CAPTURE[CONFIG.platform]
  ? `capture on ${CONFIG.platform}: ${CAPTURE[CONFIG.platform]}`
  : `set "platform" in design-changes.json (${Object.keys(CAPTURE).join(', ')}) to be told how to capture`);

export default async function run(canvas, label) {
  const shot = opt('--shot');
  if (!canvas || !label || !shot) {
    console.error(`usage: dc vet <canvas> "<board label>" --shot <screenshot.png> [--out <dir>] [--width <css px>]\n${captureHint()}`);
    return 2;
  }
  if (!existsSync(resolve(shot))) { console.error(`No screenshot at ${shot}.\n${captureHint()}`); return 2; }
  const appPng = readFileSync(resolve(shot));
  const app = pngSize(appPng);
  if (!app) { console.error(`${shot} is not a PNG.`); return 2; }
  const out = opt('--out') ?? join(DESIGN, 'screenshots', 'vet');
  mkdirSync(out, { recursive: true });

  const html = readFileSync(canvasPath(canvas), 'utf8');
  const block = boards(html).get(label);
  if (!block) { console.error(`No board "${label}" in ${canvas}.`); return 1; }
  const device = devicesOf(html).get(label)?.device ?? null;
  const width = opt('--width') ? +opt('--width') : null;
  if (opt('--width') && !(width > 0)) { console.error('--width takes a CSS pixel width, e.g. --width 726'); return 2; }
  const board = (await renderBoards(canvas, [label], out, null, width))[label];
  if (!board) { console.error(`Board "${label}" did not draw in a browser.`); return 1; }

  const layout = sheetLayout(board.w, board.h);
  const W = layout.column;
  const bands = Array.from({ length: BANDS }, (_, i) =>
    `<div style="position:absolute;left:0;right:0;top:${(i * 100) / BANDS}%;border-top:1px dashed rgba(200,0,80,.45);font:10px monospace;color:#c00050">${i + 1}</div>`).join('');
  const column = (name, png) => `
      <figure style="margin:0;width:${W + 30}px">
        <figcaption style="font-weight:700;margin-bottom:6px">${name}</figcaption>
        <div style="position:relative;padding-left:30px">
          <img src="data:image/png;base64,${png.toString('base64')}" style="width:${W}px;display:block;background:#fff">
          <div style="position:absolute;left:0;right:0;top:0;bottom:0">${bands}</div>
        </div>
      </figure>`;
  const gap = 24, pad = 16;
  const sheetW = layout.wide ? W + 30 + 2 * pad : 2 * (W + 30) + gap + 2 * pad;

  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: sheetW, height: 900 }, deviceScaleFactor: board.scale });
  await page.setContent(`<html><body style="margin:0;padding:${pad}px;background:#e9edf2;font:12px system-ui">
    <div style="display:flex;flex-direction:${layout.direction};gap:${gap}px;align-items:flex-start">
      ${column(`BOARD · ${device ?? 'no device declared'}`, readFileSync(board.path))}${column('APP', appPng)}
    </div></body></html>`);
  await page.waitForTimeout(400);
  const sheet = join(out, `${fileFor(label).replace(/\.png$/, '')}.vet.png`);
  await page.screenshot({ path: sheet, fullPage: true });
  await browser.close();

  const lines = copyLines(block);
  const id = boardId(label, block);
  const md = [
    `# Vet · ${label}`,
    '',
    `Board ${board.w}×${board.h} CSS px (${device ?? 'no device declared'}, rendered at ${board.scale}×${width ? ` in a ${width}px window` : ''}), app ${app.w}×${app.h} px scaled to the board's width — ${layout.wide ? 'stacked, board above app' : 'side by side'} in \`${sheet.replace(/\\/g, '/')}\`. ${BANDS} bands down each image, each ${100 / BANDS}% of that image's own height: band n is the same relative height on both.`,
    '',
    'Open the sheet. For every element, a verdict: **same**, **differs** (say how), or **missing**. Copy first, then layout, spacing, type, colour, icons. The board is one width; the app must hold its structure at every width, not its pixels.',
    '',
    standingRules('> ⚑ '),
    '',
    '| # | On the board | In the app | Verdict |',
    '|---|---|---|---|',
    ...lines.map((l, i) => `| ${i + 1} | ${l.replace(/\|/g, '\\|')} |  |  |`),
    '',
    'Also check what copy cannot show: controls that do nothing, placeholder values, anything under system bars or window chrome.',
    '',
  ].join('\n');
  const mdPath = join(out, `${fileFor(label).replace(/\.png$/, '')}.vet.md`);
  writeFileSync(mdPath, md);
  console.log(`sheet:     ${sheet}`);
  console.log(`checklist: ${mdPath} (${lines.length} lines of copy${id ? `, board ${id}` : ''})`);
  console.log(standingRules());
  return 0;
}
