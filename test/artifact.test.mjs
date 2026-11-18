// The design as a claude.ai artifact: the listing made from an Artifact read, sha-aware compare, migration notice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { listingFrom, unseenPages, walk } from '../scripts/import.mjs';
import { fromArtifact, rePaired, sameFile } from '../scripts/manifest.mjs';
import { onStandalone, migrationNotice, STEPS } from '../scripts/migrate.mjs';

const hex = (s) => createHash('sha256').update(s).digest('hex');

test('an Artifact read folder becomes a listing with sha256 etags, paths relative to project/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dc-art-'));
  mkdirSync(join(dir, 'project', 'assets'), { recursive: true });
  writeFileSync(join(dir, 'project', 'A.dc.html'), '<b>a</b>');
  writeFileSync(join(dir, 'project', 'assets', 'logo.png'), 'PNGBYTES');
  assert.deepEqual(walk(join(dir, 'project')), ['A.dc.html', 'assets/logo.png']);
  const l = listingFrom(dir);
  assert.deepEqual(l.map((f) => f.path), ['A.dc.html', 'assets/logo.png']);
  assert.equal(l[0].etag, `sha256:${hex('<b>a</b>')}`);
  assert.equal(l[0].size, 8);
  assert.equal(listingFrom(mkdtempSync(join(tmpdir(), 'dc-none-'))), null);
});

test('a file is the same when its content sha matches the recorded local copy, even across the MCP-era etag', () => {
  const s = hex('x');
  assert.equal(sameFile({ etag: '"mcp-etag"', sha256: s }, { etag: `sha256:${s}` }), true);
  assert.equal(sameFile({ etag: '"mcp-etag"', sha256: hex('y') }, { etag: `sha256:${s}` }), false);
  assert.equal(sameFile({ etag: '"e1"' }, { etag: '"e1"' }), true);
  assert.equal(fromArtifact([{ etag: `sha256:${s}` }]), true);
  assert.equal(fromArtifact([{ etag: '"e1"' }]), false);
});

test('pages in the page list the manifest has never seen are new canvases to read', () => {
  const compat = { pages: [{ path: 'A.dc.html' }, { path: 'New.dc.html' }, { path: '../x.html' }, { path: 'export/Deck.html' }] };
  const mirrored = (p) => (p.startsWith('export/') ? null : p);
  assert.deepEqual(unseenPages(compat, { files: { 'A.dc.html': {} } }, mirrored), ['New.dc.html']);
});

test('moving a project into its artifact is not a re-pairing; another artifact is', () => {
  const was = { project_id: 'p1' };
  assert.equal(rePaired(was, { project_id: 'p1', artifact_url: 'https://claude.ai/artifact/A' }), false);
  assert.equal(rePaired({ ...was, artifact_url: 'https://claude.ai/artifact/A' }, { project_id: 'p1', artifact_url: 'https://claude.ai/artifact/B' }), true);
  assert.equal(rePaired({ artifact_url: 'https://claude.ai/artifact/A' }, { artifact_url: 'https://claude.ai/artifact/A' }), false);
});

test('a pairing still on standalone Claude Design is told to migrate; a migrated one is not', () => {
  assert.equal(onStandalone({ project_id: 'a05e80e7-d9ef', artifact_url: null }), true);
  assert.equal(onStandalone({ project_id: 'a05e80e7-d9ef', artifact_url: 'https://claude.ai/artifact/X' }), false);
  assert.equal(onStandalone({ project_id: null, artifact_url: null }), false);
  assert.match(migrationNotice({ project_name: 'Kiosk', project_id: 'p' }), /2026-12-14.*dc migrate/);
  assert.ok(STEPS({ project_name: 'Kiosk', project_id: 'p' }).some((l) => l.includes('Move all projects')));
});
