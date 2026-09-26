// The one place a project is described to the skill.
//
// Every command runs from inside a project (the git work tree the shell is in,
// or --root). It reads `design-changes.json` at that root; anything the file
// leaves out takes the default below. Nothing about any one project lives in
// the skill itself.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULTS = {
  // Claude Design project id — `list_files` / `render_preview` take it.
  project_id: null,
  // Where the mirrored design lives, relative to the root.
  design_dir: 'design',
  // A canvas: one HTML file of artboards, each an element with this attribute.
  canvas_ext: '.dc.html',
  board_attr: 'data-screen-label',
  // Project path → local path. First match wins; unmatched paths keep their
  // name. `$1` is a group; `{slug:1}` is that group kebab-cased.
  rename: [],
  // Project files not mirrored at all.
  skip: ['.thumbnail'],
  // A board's id, as its label or caption leads with it ("9A1 · WAITING…",
  // "A8 EFT proofs"). Group 1 is the id. Null: boards are known by label only.
  board_id: '^(A\\d+[a-z]?|\\d{1,2}[A-Z]{0,2}\\d?)\\b',
  // Where to look for code that cites a board.
  code_roots: ['.'],
  code_ext: ['dart', 'py', 'html', 'mjs', 'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'swift', 'kt'],
  skip_dirs: ['node_modules', '.git', '.venv', 'venv', 'build', 'dist', '.dart_tool', 'migrations',
    'staticfiles', 'screenshots', '.next', 'coverage', 'Pods', '.gradle'],
  // Screens in code, and the design-system rules a screen with no board must
  // keep. Each: { name, path (regex on the repo path), require: {column: regex},
  // forbid: {column: regex}, pass_path (regex: counts as meeting `require`) }.
  screens: [],
  // Code citing an id the design no longer has: { pattern (group 1 numeric), max }.
  orphan_ids: null,
  // The plan every board must appear in, and an optional stated count in it.
  plan_doc: null,
  plan_count: null,
  // Elements to mask in pictures (live map tiles and the like).
  mask: [],
  // A node_modules to borrow Playwright/pixelmatch/pngjs from, when the
  // skill's own is not installed. Relative to the root.
  node_modules_from: null,
};

const argv = process.argv.slice(2);
export const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
export const flag = (name) => argv.includes(name);

function findRoot() {
  const given = opt('--root');
  if (given) return resolve(given);
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

export const ROOT = findRoot();
export const CONFIG_FILE = join(ROOT, 'design-changes.json');
const own = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
export const CONFIG = { ...DEFAULTS, ...own };
export const HAS_CONFIG = existsSync(CONFIG_FILE);
export const DESIGN = join(ROOT, CONFIG.design_dir);

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A project path → its path under design_dir, or null when not mirrored. */
export function localPath(remote) {
  if (CONFIG.skip.includes(remote)) return null;
  for (const rule of CONFIG.rename) {
    const m = new RegExp(rule.match).exec(remote);
    if (!m) continue;
    if (rule.to === null) return null;
    return rule.to
      .replace(/\{slug:(\d+)\}/g, (_, n) => slug(m[+n] ?? ''))
      .replace(/\$(\d+)/g, (_, n) => m[+n] ?? '');
  }
  return remote;
}

export const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
export const gitRaw = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 << 20 });

function bases() {
  const b = [join(SKILL, 'package.json')];
  if (CONFIG.node_modules_from) b.push(join(ROOT, CONFIG.node_modules_from, 'package.json'));
  b.push(join(ROOT, 'package.json'));
  return b;
}

const missing = (name) => {
  console.error(`Cannot find "${name}". Run the skill's install (npm install in ${SKILL}).`);
  process.exit(2);
};

/** Require a CommonJS npm package: the skill's own install first, then the project's. */
export function pkg(name) {
  for (const base of bases()) {
    try { return createRequire(base)(name); } catch { /* next */ }
  }
  return missing(name);
}

/** Import an ES-module npm package (pixelmatch is ESM-only). */
export async function esm(name) {
  for (const base of bases()) {
    let at;
    try { at = createRequire(base).resolve(name); } catch { continue; }
    return (await import(pathToFileURL(at).href)).default;
  }
  return missing(name);
}
