// One design project, several repos: what a repo owns, what it keeps, how ids
// are handed out, and how a re-pair is noticed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globRe, owns, kept, nextIds } from '../scripts/lib/config.mjs';
import { rePaired, rePairNotice } from '../scripts/manifest.mjs';

test('a glob matches within a segment, ** across segments', () => {
  assert.ok(globRe('kiosk-*.dc.html').test('kiosk-home.dc.html'));
  assert.ok(!globRe('kiosk-*.dc.html').test('dashboard-lobby.dc.html'));
  assert.ok(!globRe('docs/*.md').test('docs/deep/a.md'));
  assert.ok(globRe('docs/**').test('docs/deep/a.md'));
});

test('with owns unset a repo owns every canvas; with it set, only the matching ones', () => {
  assert.ok(owns('anything.dc.html', { owns: null }));
  const cfg = { owns: ['kiosk-*.dc.html', 'lobby.dc.html'] };
  assert.ok(owns('kiosk-home.dc.html', cfg));
  assert.ok(owns('design/kiosk-home.dc.html', cfg));
  assert.ok(owns('lobby.dc.html', cfg));
  assert.ok(!owns('dashboard-lobby-calls.dc.html', cfg));
});

test('kept paths are the project\'s allow-list under design_dir', () => {
  assert.ok(kept('docs/DEVICE-METRICS.md', { keep: ['docs/*.md'] }));
  assert.ok(!kept('design-project-sync.md', { keep: ['docs/*.md'] }));
  assert.ok(!kept('x.md', {}));
});

test('next ids follow the scheme and skip the ids already taken', () => {
  assert.deepEqual(nextIds({ prefix: 'K', start: 1 }, ['K1', 'K3'], 3), ['K2', 'K4', 'K5']);
  assert.deepEqual(nextIds({ prefix: 'D', start: 10, pad: 3 }, [], 2), ['D010', 'D011']);
  assert.deepEqual(nextIds({}, ['1'], 1), ['2']);
});

test('a manifest recorded from another project is a re-pair; an old manifest with no project is not', () => {
  const cfg = { project_id: 'new-id', project_name: 'New' };
  assert.ok(rePaired({ project_id: 'old-id', project_name: 'Old', files: {} }, cfg));
  assert.ok(!rePaired({ project_id: 'new-id', files: {} }, cfg));
  assert.ok(!rePaired({ files: {} }, cfg));
  assert.ok(!rePaired(null, cfg));
  assert.match(rePairNotice({ project_id: 'old-id', project_name: 'Old' }, cfg), /^RE-PAIRED: .*Old \(old-id\).*New \(new-id\)/);
});
