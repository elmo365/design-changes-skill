// Boards to PNG, sized by the board itself — one helper for render, diff,
// vet and lint.
//
// No viewport is fixed. A canvas is opened, the boards asked for are
// measured, and the viewport is set to hold the largest of them, so a desktop
// board is never clipped and a phone board never squeezed. The pixel scale
// comes from the board's device (`device_scale`): declared, else its frame.
//
// **Canvases are served over HTTP, never opened as file://.** The design
// runtime fetches what a canvas imports (`<x-import from="./android-frame.jsx">`),
// and Chromium refuses fetch() on a file:// URL — so the device frame failed
// to load, the screen spread to whatever width was free, and every render,
// diff picture and vet sheet showed a frameless board at the wrong width.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { CONFIG, pkg } from './config.mjs';

export const boardSelector = (label) => `[${CONFIG.board_attr}="${label.replace(/"/g, '\\"')}"]`;
export const scaleFor = (device) => CONFIG.device_scale[device] ?? CONFIG.device_scale.default ?? 2;

export async function launch() {
  const { chromium } = pkg('@playwright/test');
  return chromium.launch();
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.jsx': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};
const servers = new Map();

/** A static server over one folder, on a free local port; one per folder per process. */
async function serve(dir) {
  if (servers.has(dir)) return servers.get(dir);
  const root = dir.endsWith(sep) ? dir : dir + sep;
  const server = createServer(async (req, res) => {
    const path = normalize(join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  server.unref(); // never keeps the command alive
  const base = `http://127.0.0.1:${server.address().port}/`;
  servers.set(dir, base);
  return base;
}

/** The URL a canvas file is opened at: its own folder served, so relative imports resolve. */
export async function urlFor(file) {
  const abs = resolve(file);
  return `${await serve(dirname(abs))}${encodeURIComponent(basename(abs))}`;
}

const MARGIN = 64;
const MAX_H = 16000;

async function open(page, file) {
  await page.goto(await urlFor(file), { waitUntil: 'networkidle' });
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
 * The window to shoot in: wide enough to hold the largest board (plus a
 * margin), tall enough for the tallest — unless a window width is stated,
 * in which case the width is exactly that: a board that follows the window
 * (no fixed frame) is then drawn at the width the app capture was made at.
 */
export function viewportFor(found /* [{w, h}] */, windowWidth = null) {
  const width = windowWidth ?? Math.max(320, ...found.map((s) => s.w + MARGIN));
  const height = Math.min(MAX_H, Math.max(320, ...found.map((s) => s.h + MARGIN)));
  return { width, height };
}

/**
 * Shoot boards from one canvas file at one scale.
 * items: [{label, dest}] → {label: {path, w, h} | null}, w/h in CSS px.
 * windowWidth: open the canvas at this width and keep it (fluid boards).
 */
export async function shoot(browser, file, items, scale, windowWidth = null) {
  const context = await browser.newContext({ viewport: { width: windowWidth ?? 1280, height: 800 }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await open(page, file);
  const sizes = {};
  for (const { label } of items) {
    const el = page.locator(boardSelector(label)).first();
    sizes[label] = (await el.count()) ? await el.evaluate((e) => ({ w: e.offsetWidth, h: e.offsetHeight })) : null;
  }
  const found = Object.values(sizes).filter(Boolean);
  if (found.length) {
    await page.setViewportSize(viewportFor(found, windowWidth));
    await page.waitForTimeout(300);
    // A fluid board re-flows with the window: measure again after the resize.
    for (const { label } of items) {
      if (!sizes[label]) continue;
      sizes[label] = await page.locator(boardSelector(label)).first().evaluate((e) => ({ w: e.offsetWidth, h: e.offsetHeight }));
    }
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
