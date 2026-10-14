// dc diff stages old/new canvases beside the mirror to render them; a failure
// while rendering must never leave a .diff-* copy in design_dir (v4.3.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withStaged } from '../scripts/diff.mjs';

test('a staged copy is removed after the render', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'dc-staged-')), '.diff-old-a.dc.html');
  const seen = await withStaged(file, '<x-dc></x-dc>', (f) => readFileSync(f, 'utf8'));
  assert.equal(seen, '<x-dc></x-dc>');
  assert.equal(existsSync(file), false);
});

test('a staged copy is removed when the render throws', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'dc-staged-')), '.diff-new-b.dc.html');
  await assert.rejects(withStaged(file, 'x', () => { throw new Error('browser crashed'); }), /browser crashed/);
  assert.equal(existsSync(file), false);
});
