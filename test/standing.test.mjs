// The standing rules travel in every command's output — the stamp exists and
// says both things: static board / fluid code, placeholder values / real data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDING_RULES, standingRules } from '../scripts/lib/config.mjs';

test('two standing rules: fluid implementation, real data', () => {
  assert.equal(STANDING_RULES.length, 2);
  assert.match(STANDING_RULES[0], /static mockup/);
  assert.match(STANDING_RULES[0], /fluid at every width/);
  assert.match(STANDING_RULES[1], /placeholders/);
  assert.match(STANDING_RULES[1], /real data/);
});

test('the stamp prefixes every line, markdown-quote style included', () => {
  const plain = standingRules();
  assert.equal(plain.split('\n').length, 2);
  for (const line of plain.split('\n')) assert.ok(line.startsWith('⚑ '));
  for (const line of standingRules('> ⚑ ').split('\n')) assert.ok(line.startsWith('> ⚑ '));
});
