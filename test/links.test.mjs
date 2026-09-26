// The map is verified links, never comments: what a link must survive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declares, checkLink, parseCode } from '../scripts/links.mjs';
import { sha } from '../scripts/lib/canvas.mjs';

const dart = `
class HomeScreen extends StatelessWidget {}
Future<bool> requireAccount(BuildContext context) async => true;
Widget build(BuildContext c) => HomeScreen();
String get title => 'x';
`;
const py = `
def queue_board(request):
    return render(request, 'x.html')

class SafetyAlertAdmin(admin.ModelAdmin):
    pass
`;

test('declares finds classes, functions, getters and Python defs', () => {
  assert.ok(declares(dart, 'HomeScreen'));
  assert.ok(declares(dart, 'requireAccount'));
  assert.ok(declares(dart, 'title'));
  assert.ok(declares(py, 'queue_board'));
  assert.ok(declares(py, 'SafetyAlertAdmin'));
});

test('a call is not a declaration', () => {
  assert.equal(declares('final x = SplashScreen();\nreturn SplashScreen();', 'SplashScreen'), false);
  assert.equal(declares(dart, 'NoSuchScreen'), false);
});

test('a link is re-checked against the tree and the board as they are now', () => {
  const block = '<div data-screen-label="Home">1 · HOME</div>';
  const files = { 'app/home.dart': dart };
  const read = (f) => files[f] ?? null;
  const link = { status: 'built', code: parseCode('app/home.dart#HomeScreen'), board_hash: sha(block) };
  assert.deepEqual(checkLink(link, block, read), []);
  assert.deepEqual(checkLink(link, block.replace('HOME', 'HOME!'), read), ['the board changed since this link was checked']);
  assert.deepEqual(checkLink({ ...link, code: parseCode('app/gone.dart#HomeScreen') }, block, read), ['app/gone.dart no longer exists']);
  assert.deepEqual(checkLink({ ...link, code: parseCode('app/home.dart#Renamed') }, block, read), ['Renamed is no longer declared in app/home.dart']);
  assert.deepEqual(checkLink(link, null, read), ['the board is gone from the design']);
});

test('built or partial needs code; absent needs none', () => {
  const block = '<div data-screen-label="X"></div>';
  assert.deepEqual(checkLink({ status: 'built', code: [], board_hash: sha(block) }, block, () => null), ['status built with no code']);
  assert.deepEqual(checkLink({ status: 'absent', code: [], board_hash: sha(block) }, block, () => null), []);
});
