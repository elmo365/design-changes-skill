// Fetch: argument parsing and the byte-exact image cleaning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlyArgs, stripPng, stripJpeg } from '../scripts/fetch.mjs';

const chunk = (type, len) => {
  const b = Buffer.alloc(12 + len);
  b.writeUInt32BE(len, 0);
  b.write(type, 4, 'latin1');
  return b;
};
const png = (...chunks) => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
const seg = (marker, len) => {
  const b = Buffer.alloc(4 + len);
  b[0] = 0xff; b[1] = marker; b.writeUInt16BE(len + 2, 2);
  return b;
};
const jpeg = (...segs) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...segs, Buffer.from([0xff, 0xda, 1, 2, 3])]);

test('--only takes paths up to the next option', () => {
  assert.deepEqual(onlyArgs(['node', 'dc', 'fetch', '--only', 'a.html', 'img/b c.png', '--listing', 'l.json']), ['a.html', 'img/b c.png']);
  assert.deepEqual(onlyArgs(['node', 'dc', 'fetch', '--listing', 'l.json']), []);
});

test('a PNG loses only its caBX (C2PA) chunk', () => {
  const clean = png(chunk('IHDR', 13), chunk('IEND', 0));
  const served = png(chunk('IHDR', 13), chunk('caBX', 40), chunk('IEND', 0));
  assert.deepEqual(stripPng(served), clean);
});

test('a truncated PNG is refused, not thrown on', () => {
  const served = png(chunk('IHDR', 13), chunk('caBX', 40), chunk('IEND', 0));
  assert.equal(stripPng(served.subarray(0, served.length - 20)), null);
  assert.equal(stripPng(served.subarray(0, 10)), null);
});

test('a JPEG loses only its APP11 (C2PA) segment', () => {
  assert.deepEqual(stripJpeg(jpeg(seg(0xe0, 14), seg(0xeb, 30))), jpeg(seg(0xe0, 14)));
});

test('a truncated JPEG is refused, not thrown on', () => {
  const served = jpeg(seg(0xe0, 14), seg(0xeb, 30));
  assert.equal(stripJpeg(served.subarray(0, 30)), null);
  assert.equal(stripJpeg(served.subarray(0, 3)), null);
});
