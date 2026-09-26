// Pairing: the server-facing commands refuse to run unpaired, and say which
// project they run against when paired.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const DC = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'dc.mjs');
const run = (root, ...args) => {
  const r = spawnSync(process.execPath, [DC, ...args, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const repo = (config) => {
  const d = mkdtempSync(join(tmpdir(), 'dc-pair-'));
  writeFileSync(join(d, 'design-changes.json'), JSON.stringify(config));
  mkdirSync(join(d, 'design'), { recursive: true });
  writeFileSync(join(d, 'listing.json'), '[]');
  return d;
};

test('compare refuses to run with no project_id', () => {
  const d = repo({ project_id: null });
  const r = run(d, 'compare', join(d, 'listing.json'));
  assert.equal(r.code, 2);
  assert.match(r.out, /Not paired/);
  assert.match(r.out, /USER select/);
});

test('a v1-style placeholder id also counts as unpaired', () => {
  const d = repo({ project_id: '<claude design project id>' });
  assert.equal(run(d, 'compare', join(d, 'listing.json')).code, 2);
});

test('paired, compare names the project and runs', () => {
  const d = repo({ project_id: '96e0afea-0fec-4a69-885b-c662671b2b19', project_name: 'Example project' });
  const r = run(d, 'compare', join(d, 'listing.json'));
  assert.equal(r.code, 0);
  assert.match(r.out, /project: Example project \(96e0afea/);
});

test('several pairings: a command must say which design', () => {
  const d = repo({
    projects: [
      { project_id: '96e0afea-0fec-4a69-885b-c662671b2b19', project_name: 'UI', design_dir: 'design' },
      { project_id: 'a05e80e7-d9ef-4306-ba94-31f6910f5d9c', project_name: 'Email', design_dir: 'design-email' },
    ],
  });
  const bare = run(d, 'compare', join(d, 'listing.json'));
  assert.equal(bare.code, 2);
  assert.match(bare.out, /pairs 2 design projects/);
  assert.match(bare.out, /--design design-email/);
  const picked = run(d, 'compare', join(d, 'listing.json'), '--project', 'Email');
  assert.equal(picked.code, 0);
  assert.match(picked.out, /project: Email \(a05e80e7/);
});

test('several pairings: an entry overrides the top level, and help needs no pick', () => {
  const d = repo({
    code_ext: ['dart'],
    projects: [
      { project_id: '96e0afea-0fec-4a69-885b-c662671b2b19', project_name: 'UI', design_dir: 'design' },
      { project_id: null, project_name: 'Email', design_dir: 'design-email' },
    ],
  });
  assert.equal(run(d, 'help').code, 0);
  const unpaired = run(d, 'compare', join(d, 'listing.json'), '--design', 'design-email');
  assert.equal(unpaired.code, 2);
  assert.match(unpaired.out, /Not paired/);
});

test('local commands still work unpaired', () => {
  const d = repo({ project_id: null });
  writeFileSync(join(d, 'design', 'c.dc.html'), '<div data-screen-label="A" data-device="phone"><p>1A · A</p></div>');
  const r = run(d, 'boards', 'c.dc.html');
  assert.equal(r.code, 0);
  assert.match(r.out, /1 boards cut/);
});
