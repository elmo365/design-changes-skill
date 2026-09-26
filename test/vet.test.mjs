// Vet's sheet is shaped by the board, never by a fixed device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetLayout, pngSize, CAPTURE } from '../scripts/vet.mjs';

test('a tall board sits beside the app, at its own width', () => {
  assert.deepEqual(sheetLayout(390, 844), { wide: false, column: 390, direction: 'row' });
});

test('a wide board is stacked above the app, at its own width', () => {
  assert.deepEqual(sheetLayout(1440, 900), { wide: true, column: 1440, direction: 'column' });
});

test('a PNG header gives its size; anything else is refused', () => {
  const head = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71]).copy(head, 0);
  head.writeUInt32BE(1080, 16);
  head.writeUInt32BE(2340, 20);
  assert.deepEqual(pngSize(head), { w: 1080, h: 2340 });
  assert.equal(pngSize(Buffer.from([0xff, 0xd8, 0xff])), null);
});

test('every platform has a capture method', () => {
  assert.deepEqual(Object.keys(CAPTURE).sort(), ['android', 'desktop', 'ios', 'web']);
});
