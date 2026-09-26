// Reading a canvas as source: cutting boards, their ids, their style changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boards, boardTags, boardId, idPattern, styleChanges, copyLines, BETWEEN } from '../scripts/lib/canvas.mjs';

const canvas = `<html><body>
<div data-screen-label="Home" data-device="phone"><div class="a"><p>Welcome</p></div></div>
<div class="cap">12F · HOME</div>
<section data-screen-label="Orders list" data-device="desktop"><section><h2>Orders</h2></section></section>
<p>loose note</p>
</body></html>`;

test('boards are cut whole, nested same-tag elements included', () => {
  const b = boards(canvas);
  assert.deepEqual([...b.keys()].filter((k) => k !== BETWEEN), ['Home', 'Orders list']);
  assert.match(b.get('Orders list'), /<\/section><\/section>$/);
  assert.equal(b.unclosed.size, 0);
});

test('a caption leading with the board\'s id belongs to the board; other text stays between', () => {
  const b = boards(canvas.replace('data-screen-label="Home"', 'data-screen-label="12F · Home"'));
  assert.match(b.get('12F · Home'), /12F · HOME/);
  assert.match(b.get(BETWEEN), /loose note/);
});

test('a board whose markup runs into the next one is cut there and reported', () => {
  const b = boards('<div data-screen-label="A"><div>x</div><div data-screen-label="B"><p>y</p></div>');
  assert.deepEqual([...b.unclosed], ['A']);
  assert.ok(!b.get('A').includes('data-screen-label="B"'));
});

test('boardTags lists labels and declared devices in source order', () => {
  assert.deepEqual(boardTags(canvas).map((t) => [t.label, t.device]), [['Home', 'phone'], ['Orders list', 'desktop']]);
  assert.equal(boardTags('<div data-screen-label="X">').at(0).device, null);
});

test('an id is read from the label or a caption written "<id> · "', () => {
  assert.equal(boardId('13C · WAITING', ''), '13C');
  assert.equal(boardId('Home', '<div>9A1 · HOME</div>'), '9A1');
  assert.equal(boardId('Release', '<div>2.1 · RELEASE</div>'), '2.1');
});

test('no id without a digit, or without the " · "', () => {
  assert.equal(boardId('Settings', '<div>NOTE · draft</div>'), null);
  assert.equal(boardId('A8 EFT proofs', ''), null);
});

test('idPattern: a bare number counts only in backticks or as a caption', () => {
  const re = idPattern('13');
  assert.ok(re.test('see `13`'));
  assert.ok(re.test('// 13 · SETTINGS'));
  assert.ok(!re.test('padding: 13'));
  assert.ok(!re.test('// B13 · other project'));
});

test('idPattern: an id is not matched inside a longer word', () => {
  const re = idPattern('4B');
  assert.ok(re.test('// board 4B'));
  assert.ok(!re.test('x14B2'));
});

test('style changes pair old → new per property; tiny ones are minor', () => {
  const lines = styleChanges('<p style="padding:12px;color:#333333">', '<p style="padding:13px;color:#cc0000">');
  const by = Object.fromEntries(lines.map((l) => [l.p, l]));
  assert.equal(by.padding.minor, true);
  assert.equal(by.color.minor, false);
  assert.equal(by.color.to, '#cc0000');
});

test('copy lines drop markup, scripts and template bindings', () => {
  assert.deepEqual(copyLines('<div>Hello <b>there</b></div><script>x()</script><p>{{name}}</p><p>Bye &amp; thanks</p>'),
    ['Hello there', 'Bye & thanks']);
});
