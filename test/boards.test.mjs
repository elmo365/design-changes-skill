// dc boards — a label holding an HTML entity is cut, never reported LOST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lostLabels } from '../scripts/diff.mjs';
import { boards, boardTags, holeValue, BETWEEN } from '../scripts/lib/canvas.mjs';

test('a label with &amp; is matched decoded: not LOST', () => {
  const html = '<div data-screen-label="A18 · Users &amp; Accounts" data-device="desktop"><div>x</div></div>'
    + '<div data-screen-label="A19 · Roles" data-device="desktop"><div>y</div></div>';
  const cut = [...boards(html).keys()].filter((k) => k !== BETWEEN);
  assert.ok(cut.includes('A18 · Users & Accounts'));
  const { raw, lost } = lostLabels(html, cut, 'data-screen-label');
  assert.equal(raw.length, 2);
  assert.deepEqual(lost, []);
});

test('a label written as a template hole resolves to its standalone value', () => {
  const html = '<x-dc><div data-screen-label="{{ k9Label }}" data-device="{{ k9Dev }}"><div>x</div></div></x-dc>'
    + '<script type="text/x-dc" data-dc-script>class Component extends DCLogic { renderVals() { return {\n'
    + "  k9Label: this.props.embed ? null : 'K9 · Home — portrait',\n"
    + "  k9Dev: this.props.embed ? null : 'tablet',\n"
    + '}; } }</script>';
  const cut = [...boards(html).keys()].filter((k) => k !== BETWEEN);
  assert.deepEqual(cut, ['K9 · Home — portrait']);
  assert.equal(boardTags(html)[0].device, 'tablet');
  assert.deepEqual(lostLabels(html, cut, 'data-screen-label').lost, []);
  assert.equal(holeValue(html, '{{ missing }}'), '{{ missing }}');
});
