// Vet a built screen against its board: the app's screenshot beside the
// rendered artboard, at one width, with a numbered ruler down both — plus the
// board's copy as a checklist, so every element gets its own verdict.
//
//   dc vet <canvas> "<board label>" --shot <app screenshot.png> [--out <dir>]
//
// Writes <out>/<label>.vet.png (side by side) and <out>/<label>.vet.md (the
// checklist). Default out: <design_dir>/screenshots/vet.
//
// **Not a pixel gate.** An app renders with its own fonts at its own width
// and a board is one width of HTML, so pixels always differ. The sheet is for
// looking: element by element, the board beside what the phone drew. The
// checklist lists the copy the board shows, so a missing or reworded line is
// found by reading, not by guessing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG, DESIGN, pkg, opt } from './lib/config.mjs';
import { boards, copyLines, boardId } from './lib/canvas.mjs';
import { renderBoards, canvasPath, fileFor } from './render.mjs';

export default async function run(canvas, label) {
  const shot = opt('--shot');
  if (!canvas || !label || !shot) { console.error('usage: dc vet <canvas> "<board label>" --shot <screenshot.png> [--out <dir>]'); return 2; }
  if (!existsSync(resolve(shot))) { console.error(`No screenshot at ${shot}.`); return 2; }
  const out = opt('--out') ?? join(DESIGN, 'screenshots', 'vet');
  mkdirSync(out, { recursive: true });

  const block = boards(readFileSync(canvasPath(canvas), 'utf8')).get(label);
  if (!block) { console.error(`No board "${label}" in ${canvas}.`); return 1; }
  const rendered = (await renderBoards(canvas, [label], out, 2))[label]?.path;

  const { chromium } = pkg('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  const b64 = (p) => readFileSync(p).toString('base64');
  const W = 420; // each column's width; both images are scaled to it
  await page.setContent(`<html><body style="margin:0;padding:16px;background:#e9edf2;font:12px system-ui">
    <div style="display:flex;gap:24px;align-items:flex-start">
      ${[['BOARD', rendered], ['APP', resolve(shot)]].map(([name, p]) => `
      <figure style="margin:0;width:${W + 30}px">
        <figcaption style="font-weight:700;margin-bottom:6px">${name}</figcaption>
        <div class="col" style="position:relative;padding-left:30px">
          <img src="data:image/png;base64,${b64(p)}" style="width:${W}px;display:block;background:#fff">
        </div>
      </figure>`).join('')}
    </div>
    <script>
      // A band every 60 px of the scaled width, numbered on both columns, so
      // "band 7" names the same height on each side.
      for (const col of document.querySelectorAll('.col')) {
        const img = col.querySelector('img');
        const draw = () => {
          for (let y = 0, n = 1; y < img.height; y += 60, n++) {
            const line = document.createElement('div');
            line.style.cssText = 'position:absolute;left:0;right:0;top:' + y + 'px;border-top:1px dashed rgba(200,0,80,.45);font:10px monospace;color:#c00050';
            line.textContent = n;
            col.appendChild(line);
          }
        };
        img.complete ? draw() : img.onload = draw;
      }
    </script></body></html>`);
  await page.waitForTimeout(400);
  const sheet = join(out, `${fileFor(label).replace(/\.png$/, '')}.vet.png`);
  await page.screenshot({ path: sheet, fullPage: true });
  const dims = await page.$$eval('img', (imgs) => imgs.map((i) => `${i.naturalWidth}×${i.naturalHeight}`));
  await browser.close();

  const lines = copyLines(block);
  const id = boardId(label, block);
  const md = [
    `# Vet · ${label}`,
    '',
    `Board ${dims[0]} px (rendered at 2×), app ${dims[1]} px — both scaled to ${W} px in \`${sheet.replace(/\\/g, '/')}\`.`,
    '',
    'Open the sheet. For every element, a verdict: **same**, **differs** (say how), or **missing**. Copy first, then layout, spacing, type, colour, icons. The board is one width; the app must hold its structure at every width, not its pixels.',
    '',
    '| # | On the board | On the phone | Verdict |',
    '|---|---|---|---|',
    ...lines.map((l, i) => `| ${i + 1} | ${l.replace(/\|/g, '\\|')} |  |  |`),
    '',
    'Also check what copy cannot show: controls that do nothing, placeholder values, anything under the status bar.',
    '',
  ].join('\n');
  const mdPath = join(out, `${fileFor(label).replace(/\.png$/, '')}.vet.md`);
  writeFileSync(mdPath, md);
  console.log(`sheet:     ${sheet}`);
  console.log(`checklist: ${mdPath} (${lines.length} lines of copy${id ? `, board ${id}` : ''})`);
  return 0;
}
