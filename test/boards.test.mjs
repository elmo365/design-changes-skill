// dc boards — a label holding an HTML entity is cut, never reported LOST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lostLabels } from '../scripts/diff.mjs';
import { boards, BETWEEN } from '../scripts/lib/canvas.mjs';

test('a label with &amp; is matched decoded: not LOST', () => {
  const html = '<div data-screen-label="A18 · Users &amp; Accounts" data-device="desktop"><div>x</div></div>'
    + '<div data-screen-label="A19 · Roles" data-device="desktop"><div>y</div></div>';
  const cut = [...boards(html).keys()].filter((k) => k !== BETWEEN);
  assert.ok(cut.includes('A18 · Users & Accounts'));
  const { raw, lost } = lostLabels(html, cut, 'data-screen-label');
  assert.equal(raw.length, 2);
  assert.deepEqual(lost, []);
});
