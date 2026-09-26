// Look at the design images a sync changed — not only their bytes.
//
//   dc images [--sheet <out.png>]
//
// For every image under design_dir that git shows as changed or new:
//   1. it must decode (a truncated or mangled file fails here, whatever its size);
//   2. where git has a previous version, both are decoded and compared pixel by
//      pixel — stripping C2PA is metadata only, so the picture must be
//      identical; a changed picture reports its share of pixels changed;
//   3. a contact sheet of them all is written, to be looked at image by image.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, ROOT, gitRaw, pkg, opt, changedPaths } from './lib/config.mjs';

export default async function run() {
  const sheetAt = opt('--sheet');
  const all = changedPaths(CONFIG.design_dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f.path) && !f.path.includes('/screenshots/'));
  for (const f of all.filter((x) => x.state.includes('D'))) console.log(`${'deleted'.padEnd(42)}    ${f.path}`);
  const changed = all.filter((f) => !f.state.includes('D'));
  if (!changed.length) { console.log('No changed images.'); return 0; }

  const { chromium } = pkg('@playwright/test');
  const mime = (p) => (/\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body style="margin:0;background:#fff"></body></html>');
  let problems = 0;
  const tiles = [];
  for (const f of changed) {
    const now = readFileSync(join(ROOT, f.path)).toString('base64');
    let before = null;
    // A renamed image is compared with the file it was renamed from.
    if (f.state !== '??' && f.state !== 'A') { try { before = gitRaw('show', `HEAD:${f.from ?? f.path}`).toString('base64'); } catch { before = null; } }
    const r = await page.evaluate(async ({ a, b, type }) => {
      const load = (d) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = `data:${type};base64,${d}`; });
      const ia = await load(a);
      if (!ia) return { decodes: false };
      const px = (img) => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
      let diff = null;
      if (b) {
        const ib = await load(b);
        if (ib && ib.naturalWidth === ia.naturalWidth && ib.naturalHeight === ia.naturalHeight) {
          const pa = px(ia), pb = px(ib); let n = 0;
          for (let i = 0; i < pa.length; i += 4) if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2]) n++;
          diff = n / (pa.length / 4);
        } else diff = ib ? 'size changed' : 'old did not decode';
      }
      return { decodes: true, w: ia.naturalWidth, h: ia.naturalHeight, diff };
    }, { a: now, b: before, type: mime(f.path) });
    const verdict = !r.decodes ? 'DOES NOT DECODE'
      : r.diff === null ? 'new — decodes'
      : typeof r.diff === 'string' ? r.diff
      : r.diff === 0 ? 'pixel-identical to the previous version'
      : `${(r.diff * 100).toFixed(2)}% of pixels changed`;
    if (!r.decodes || (typeof r.diff === 'number' && r.diff > 0) || r.diff === 'old did not decode') problems += 1;
    console.log(`${verdict.padEnd(42)} ${r.decodes ? `${r.w}×${r.h}` : ''}  ${f.path}`);
    if (r.decodes) tiles.push({ path: f.path, data: now, type: mime(f.path) });
  }
  if (sheetAt) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.setContent(`<html><body style="margin:0;padding:12px;background:#f4f6f8;font:11px system-ui;display:flex;flex-wrap:wrap;gap:10px">${
      tiles.map((t) => `<figure style="margin:0;width:200px"><img src="data:${t.type};base64,${t.data}" style="width:200px;height:200px;object-fit:contain;background:#fff;border:1px solid #ccd"><figcaption style="word-break:break-all">${t.path}</figcaption></figure>`).join('')
    }</body></html>`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: sheetAt, fullPage: true });
    console.log(`contact sheet: ${sheetAt}`);
  }
  await browser.close();
  return problems ? 1 : 0;
}
