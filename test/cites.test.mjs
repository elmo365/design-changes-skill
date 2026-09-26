// dc cites: every code line citing a board id, matched the way the map matches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citingLines } from '../scripts/cites.mjs';

const files = [
  { path: 'app/safety.dart', lines: ['/// The kit — `13A`, `13B` and `13C`.', 'final x = 13;', '// 13 · SETTINGS'] },
  { path: 'app/wallet.dart', lines: ['/// `13C EFT proof not accepted`', '// x13C2 is not an id'] },
];

test('cites lists file and line for each citation of an id', () => {
  assert.deepEqual(citingLines(files, '13C').map((h) => `${h.path}:${h.line}`), ['app/safety.dart:1', 'app/wallet.dart:1']);
});

test('a bare number is a citation only in backticks or as a caption', () => {
  assert.deepEqual(citingLines(files, '13').map((h) => h.line), [3]);
});
