// What the skill requires of the design side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintCanvas, lintProject, demandText } from '../scripts/lint.mjs';

const good = `<div data-screen-label="Home" data-device="phone"><div>1A · HOME</div></div>
<div data-screen-label="Orders" data-device="desktop"><div>1B · ORDERS</div></div>`;
const rules = (found) => found.map((f) => `${f.board ?? '*'}: ${f.rule}`);

test('a canvas that follows every rule passes', () => {
  assert.deepEqual(lintCanvas('c.dc.html', good), []);
});

test('a canvas with no artboards fails, as an attribute fix', () => {
  const [f] = lintCanvas('one.dc.html', '<main><h1>Quotations</h1></main>');
  assert.equal(f.rule, 'no artboards');
  assert.equal(f.level, 'fail');
  assert.equal(f.kind, 'attribute');
});

test('a board with no id or no device fails', () => {
  assert.deepEqual(rules(lintCanvas('c', '<div data-screen-label="Home"><p>hi</p></div>')), ['Home: no board id', 'Home: no device']);
});

test('an unknown device fails', () => {
  assert.deepEqual(rules(lintCanvas('c', '<div data-screen-label="Home" data-device="watch"><p>1A · HOME</p></div>')), ['Home: unknown device "watch"']);
});

test('a duplicate label fails once, as naming', () => {
  const found = lintCanvas('c', good + good.split('\n')[0]);
  assert.deepEqual(rules(found), ['Home: duplicate label']);
  assert.equal(found[0].kind, 'naming');
});

test('markup running into the next board fails, as structure', () => {
  const found = lintCanvas('c', '<div data-screen-label="A" data-device="phone"><p>1A · A</p><div data-screen-label="B" data-device="phone"><p>1B · B</p></div>');
  assert.deepEqual(found.map((f) => [f.board, f.kind]), [['A', 'structure']]);
});

test('an id used on two canvases fails across the project', () => {
  const found = lintProject([{ canvas: 'a.dc.html', html: good }, { canvas: 'b.dc.html', html: good.split('\n')[1] }]);
  assert.deepEqual(found.map((f) => f.rule), ['id 1B used 2 times']);
});

test('the demand groups findings per canvas and marks what is required', () => {
  const text = demandText(lintCanvas('one.dc.html', '<main></main>'), '2026-01-01');
  assert.match(text, /^# Design requirements not met — 2026-01-01/);
  assert.match(text, /## one\.dc\.html\n\n- \*\*Required\*\* · whole canvas — no artboards\./);
});
