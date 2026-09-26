// Render artboards to PNG, so a screen is built and ticked against what the
// design draws rather than against its markup read by eye.
//
//   dc render <canvas> "<label>" [more labels…] [--out <dir>] [--scale 2]
//
// <canvas> is a path, or a file name under design_dir. Writes
// <out>/<label>.png, one per artboard, cropped to its board element.
// Default out: <design_dir>/screenshots/render (keep it gitignored).
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG, DESIGN, pkg, opt } from './lib/config.mjs';

export const canvasPath = (c) => (existsSync(resolve(c)) ? resolve(c) : join(DESIGN, c));
export const boardSelector = (label) => `[${CONFIG.board_attr}="${label.replace(/"/g, '\\"')}"]`;
export const fileFor = (label) => `${label.replace(/[^A-Za-z0-9-]+/g, '_')}.png`;

/** Render labels from one canvas; returns { label: path | null }. */
export async function renderBoards(canvas, labels, out, scale = 2) {
  const { chromium } = pkg('@playwright/test');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(canvasPath(canvas)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const result = {};
  for (const label of labels) {
    const el = page.locator(boardSelector(label)).first();
    if (!(await el.count())) { result[label] = null; continue; }
    await el.scrollIntoViewIfNeeded();
    const file = join(out, fileFor(label));
    await el.screenshot({ path: file, mask: CONFIG.mask.map((m) => el.locator(m)) });
    result[label] = file;
  }
  await browser.close();
  return result;
}

export default async function run(canvas, ...rest) {
  const labels = rest.filter((a, i) => !a.startsWith('--') && !['--out', '--scale'].includes(rest[i - 1]));
  if (!canvas || !labels.length) { console.error('usage: dc render <canvas> "<label>" … [--out <dir>] [--scale 2]'); return 2; }
  const out = opt('--out') ?? join(DESIGN, 'screenshots', 'render');
  const done = await renderBoards(canvas, labels, out, +(opt('--scale') ?? 2));
  let missing = 0;
  for (const [label, file] of Object.entries(done)) {
    if (file) console.log(file);
    else { console.error(`no artboard labelled "${label}"`); missing += 1; }
  }
  return missing ? 1 : 0;
}
