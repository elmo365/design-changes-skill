// The standing rules travel in every command's output — the stamp exists and
// says all three things: static board / fluid code, placeholder values / real
// data, and the owner's rulings over a board that may lag them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDING_RULES, standingRules } from '../scripts/lib/config.mjs';

test('three standing rules: fluid implementation, real data, rulings outrank boards', () => {
  assert.equal(STANDING_RULES.length, 3);
  assert.match(STANDING_RULES[0], /static mockup/);
  assert.match(STANDING_RULES[0], /fluid at every width/);
  assert.match(STANDING_RULES[1], /placeholders/);
  assert.match(STANDING_RULES[1], /real data/);
  assert.match(STANDING_RULES[2], /rulings outrank a board/);
  assert.match(STANDING_RULES[2], /share of the screen/);
  assert.match(STANDING_RULES[2], /never port a pixel height/);
});

test('the stamp prefixes every line, markdown-quote style included', () => {
  const plain = standingRules();
  // The skill's own checkout lists no rulings, so the stamp is the rules alone.
  assert.equal(plain.split('\n').length, 3);
  for (const line of plain.split('\n')) assert.ok(line.startsWith('⚑ '));
  for (const line of standingRules('> ⚑ ').split('\n')) assert.ok(line.startsWith('> ⚑ '));
});
