// Reading git status: one entry per file, never quoted, renames with their source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePorcelainZ } from '../scripts/lib/config.mjs';

test('renames carry the path they came from; names with spaces stay whole', () => {
  const out = 'R  design/new name.png\0design/old name.png\0 M design/a.dc.html\0?? design/sub/fresh one.png\0D  design/gone.png\0';
  assert.deepEqual(parsePorcelainZ(out), [
    { state: 'R', path: 'design/new name.png', from: 'design/old name.png' },
    { state: 'M', path: 'design/a.dc.html', from: null },
    { state: '??', path: 'design/sub/fresh one.png', from: null },
    { state: 'D', path: 'design/gone.png', from: null },
  ]);
});

test('empty status is no files', () => {
  assert.deepEqual(parsePorcelainZ(''), []);
});
