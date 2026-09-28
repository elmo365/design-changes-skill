// What the skill requires of the design side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintCanvas, lintProject, demandText, demandable, decisions, foreignFiles } from '../scripts/lint.mjs';

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

test('a board drawn in a device frame needs no device attribute', () => {
  const html = `<div data-screen-label="Home"><x-import component-from-global-scope="AndroidDevice" width="{{ 380 }}" height="{{ 760 }}"><div>x</div></x-import><div>1A · HOME</div></div>`;
  assert.deepEqual(lintCanvas('c', html), []);
});

test('a board with no frame and no attribute is told both ways to say its device', () => {
  const [f] = lintCanvas('c', '<div data-screen-label="Home"><p>1A · HOME</p></div>');
  assert.equal(f.rule, 'no device');
  assert.match(f.fix, /device frame/);
  assert.match(f.fix, /data-device=/);
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

test('the demand names the repo, groups findings per canvas and marks what is required', () => {
  const text = demandText(lintCanvas('one.dc.html', '<main></main>'), '2026-01-01', 'kiosk');
  assert.match(text, /^# Design requirements not met — kiosk — 2026-01-01/);
  assert.match(text, /## one\.dc\.html\n\n- \*\*Required\*\* · whole canvas — no artboards\./);
});

test('with an id scheme, every board without an id is told the id it gets, skipping taken ones', () => {
  const html = `<div data-screen-label="Home" data-device="phone"><p>K1 · HOME</p></div>
<div data-screen-label="Cart" data-device="phone"><p>Cart</p></div>
<div data-screen-label="Pay" data-device="phone"><p>Pay</p></div>`;
  const found = lintProject([{ canvas: 'k.dc.html', html }], { prefix: 'K', start: 1 });
  assert.deepEqual(found.map((f) => [f.board, f.proposed]), [['Cart', 'K2'], ['Pay', 'K3']]);
  assert.match(found[0].fix, /"K2 · CART"/);
});

test('with an id map, a board gets the id the project chose; the scheme covers the rest; a bare canvas key names a root label', () => {
  const html = `<div data-screen-label="Home" data-device="phone"><p>Home</p></div>
<div data-screen-label="Cart" data-device="phone"><p>Cart</p></div>`;
  const map = { 'k.dc.html::Home': '01A', 'one.dc.html': '06 · Product Page' };
  const found = lintProject([{ canvas: 'k.dc.html', html }, { canvas: 'one.dc.html', html: '<main></main>' }], { prefix: 'K', start: 1 }, map);
  const ids = found.filter((f) => f.rule === 'no board id').map((f) => [f.board, f.proposed]);
  assert.deepEqual(ids, [['Home', '01A'], ['Cart', 'K1']]);
  assert.match(found.find((f) => f.board === 'Home').fix, /"01A · HOME"/);
  const root = found.find((f) => f.rule === 'no artboards');
  assert.equal(root.proposed, '06');
  assert.match(root.fix, /data-screen-label="06 · Product Page"/);
  // every unnamed board mapped: no scheme needed, nothing to decide
  const all = lintProject([{ canvas: 'k.dc.html', html }], null, { 'k.dc.html::Home': '01A', 'k.dc.html::Cart': '08' });
  assert.deepEqual(decisions(all, { demand_mode: 'file', id_scheme: null }), []);
});

test('reference and repo-side findings never enter the demand', () => {
  const found = [
    { canvas: 'mine.dc.html', board: 'A', rule: 'no device', level: 'fail', kind: 'attribute', fix: 'x' },
    { canvas: 'theirs.dc.html', board: 'B', rule: 'no device', level: 'ref', kind: 'attribute', fix: 'x' },
    { canvas: 'old-doc.md', board: null, rule: 'foreign file', level: 'warn', kind: 'repo', side: 'repo', fix: 'x' },
  ];
  assert.deepEqual(demandable(found).map((f) => f.canvas), ['mine.dc.html']);
  assert.doesNotMatch(demandText(found, '2026-01-01', 'r'), /theirs|old-doc/);
});

test('undecided demand_mode and id_scheme are said out loud while anything is owed', () => {
  const owed = [{ canvas: 'a.dc.html', board: 'A', rule: 'no board id', level: 'fail', kind: 'attribute', fix: 'x' }];
  const asks = decisions(owed, { demand_mode: null, id_scheme: null });
  assert.equal(asks.length, 2);
  assert.match(asks[0], /^DECIDE NOW {2}demand_mode/);
  assert.match(asks[1], /^DECIDE NOW {2}id_scheme/);
  assert.deepEqual(decisions(owed, { demand_mode: 'post', id_scheme: { prefix: 'K' } }), []);
  assert.deepEqual(decisions([{ ...owed[0], level: 'ref' }], { demand_mode: null, id_scheme: null }), []);
});

test('a file in design_dir that is neither mirrored, the skill\'s nor kept is foreign', () => {
  const present = ['home.dc.html', 'manifest.json', 'built-against.json', 'built-against.0123abcd.bak.json',
    'SCREEN-CODE-MAP.md', 'DEMAND.md', 'design-project-sync.md', 'docs/notes.md', 'img/a.png'];
  const mirrored = new Set(['home.dc.html', 'img/a.png']);
  const found = foreignFiles(present, mirrored, { design_dir: 'design', keep: ['docs/*'] });
  assert.deepEqual(found.map((f) => f.canvas), ['design-project-sync.md']);
  assert.equal(found[0].side, 'repo');
  assert.equal(found[0].level, 'warn');
});
