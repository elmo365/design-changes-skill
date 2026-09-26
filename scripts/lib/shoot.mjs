// Boards to PNG, sized by the board itself — one helper for render, diff,
// vet and lint.
//
// No viewport is fixed. A canvas is opened, the boards asked for are
// measured, and the viewport is set to hold the largest of them, so a desktop
// board is never clipped and a phone board never squeezed. The pixel scale
// comes from the board's declared device (`device_scale`).
import { pathToFileURL } from 'node:url';
import { CONFIG, pkg } from './config.mjs';

export const boardSelector = (label) => `[${CONFIG.board_attr}="${label.replace(/"/g, '\\"')}"]`;
export const scaleFor = (device) => CONFIG.device_scale[device] ?? CONFIG.device_scale.default ?? 2;

export async function launch() {
  const { chromium } = pkg('@playwright/test');
  return chromium.launch();
}

const MARGIN = 64;
const MAX_H = 16000;

async function open(page, file) {
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
}

/** Each board's own layout size in CSS px, at a given window width: [{label, w, h}]. */
export async function measure(browser, file, windowWidth = 1280) {
  const context = await browser.newContext({ viewport: { width: windowWidth, height: 800 } });
  const page = await context.newPage();
  await open(page, file);
  const sizes = await page.$$eval(`[${CONFIG.board_attr}]`, (els, attr) =>
    els.map((e) => ({ label: e.getAttribute(attr), w: e.offsetWidth, h: e.offsetHeight })), CONFIG.board_attr);
  await context.close();
  return sizes;
}

/**
 * Shoot boards from one canvas file at one scale.
 * items: [{label, dest}] → {label: {path, w, h} | null}, w/h in CSS px.
 */
export async function shoot(browser, file, items, scale) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await open(page, file);
  const sizes = {};
  for (const { label } of items) {
    const el = page.locator(boardSelector(label)).first();
    sizes[label] = (await el.count()) ? await el.evaluate((e) => ({ w: e.offsetWidth, h: e.offsetHeight })) : null;
  }
  const found = Object.values(sizes).filter(Boolean);
  if (found.length) {
    const width = Math.max(320, ...found.map((s) => s.w + MARGIN));
    const height = Math.min(MAX_H, Math.max(320, ...found.map((s) => s.h + MARGIN)));
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
  }
  const result = {};
  for (const { label, dest } of items) {
    if (!sizes[label]) { result[label] = null; continue; }
    const el = page.locator(boardSelector(label)).first();
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: dest, mask: CONFIG.mask.map((m) => el.locator(m)) });
    result[label] = { path: dest, ...sizes[label] };
  }
  await context.close();
  return result;
}
