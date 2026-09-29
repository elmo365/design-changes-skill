// Canvases are served over HTTP: the design runtime fetch()es its imports
// (the device frame), and Chromium refuses fetch() on file://.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { urlFor, viewportFor } from '../scripts/lib/shoot.mjs';

const dir = mkdtempSync(join(tmpdir(), 'dc-serve-'));
writeFileSync(join(dir, 'My canvas.dc.html'), '<x-import from="./frame.jsx"></x-import>');
writeFileSync(join(dir, 'frame.jsx'), 'window.Frame = 1;');

test('a canvas opens over http, and its relative imports resolve beside it', async () => {
  const url = await urlFor(join(dir, 'My canvas.dc.html'));
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/My%20canvas\.dc\.html$/);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const frame = await fetch(new URL('./frame.jsx', url));
  assert.equal(frame.status, 200);
  assert.equal(await frame.text(), 'window.Frame = 1;');
});

test('the server serves nothing outside the canvas folder', async () => {
  const url = await urlFor(join(dir, 'My canvas.dc.html'));
  const base = new URL(url).origin;
  assert.equal((await fetch(`${base}/missing.jsx`)).status, 404);
  assert.notEqual((await fetch(`${base}/..%2f..%2fwindows/win.ini`)).status, 200);
});

test('the shooting window holds the largest board, or is exactly the stated width for fluid boards', () => {
  const found = [{ w: 1200, h: 107 }, { w: 380, h: 760 }];
  assert.deepEqual(viewportFor(found), { width: 1264, height: 824 });
  assert.deepEqual(viewportFor(found, 726), { width: 726, height: 824 });
  assert.deepEqual(viewportFor([{ w: 100, h: 100 }]), { width: 320, height: 320 });
});
