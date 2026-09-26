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
  // The paired Claude Design project — `list_files` / `render_preview` take
  // the id. Pairing is the user's act (SKILL.md, "Pairing"): the agent lists
  // the MCP's projects and the USER selects; the name is stored so every sync
  // can say which project the repo is paired to.
  project_id: null,
  project_name: null,
  // Where the mirrored design lives, relative to the root.
  design_dir: 'design',
  // A canvas: one HTML file of artboards, each an element with this attribute.
  canvas_ext: '.dc.html',
  board_attr: 'data-screen-label',
  // Every board declares the device it draws, on the same element.
  device_attr: 'data-device',
  // Each device's board width range in CSS px (`dc lint --measure` warns on a
  // board outside its declared device's range). The keys are the devices a
  // board may declare.
  device_widths: { phone: [240, 600], tablet: [600, 1366], desktop: [1024, 100000] },
  // Pixel scale a board is rendered at, by its device.
  device_scale: { phone: 2, tablet: 2, desktop: 1, default: 2 },
  // Project path → local path. First match wins; unmatched paths keep their
  // name. `$1` is a group; `{slug:1}` is that group kebab-cased.
  rename: [],
  // Project files not mirrored at all.
  skip: ['.thumbnail'],
  // A board's id, as its label or caption leads with it: "13C · WAITING…".
  // Group 1 is the id — letters, digits, dots and dashes with at least one
  // digit — followed by " · ". The design side is required to write ids this
  // way (SKILL.md). Null: boards are known by label only.
  board_id: '^((?=[A-Za-z0-9.-]*\\d)[A-Za-z0-9][A-Za-z0-9.-]{0,11}) · ',
  // Where to look for code that cites a board.
  code_roots: ['.'],
  code_ext: ['dart', 'py', 'html', 'mjs', 'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'swift', 'kt'],
  // Dependencies and build output only; a project's own folders to skip go in
  // its design-changes.json.
  skip_dirs: ['node_modules', '.git', '.venv', 'venv', 'build', 'dist', '.dart_tool',
    'screenshots', '.next', 'coverage', 'Pods', '.gradle'],
  // Screens in code, and the design-system rules a screen with no board must
  // keep. Each: { name, path (regex on the repo path), require: {column: regex},
  // forbid: {column: regex}, pass_path (regex: counts as meeting `require`) }.
  screens: [],
  // Code citing an id the design no longer has: { pattern (group 1 numeric), max }.
  orphan_ids: null,
  // The design side's notes file (in design_dir): what each session changed
  // and why. `dc lint` warns when a canvas changed and this did not.
  notes_file: 'NEXT.md',
  // The plan every board must appear in, and an optional stated count in it.
  plan_doc: null,
  plan_count: null,
  // Elements to mask in pictures (live map tiles and the like).
  mask: [],
  // What the app runs on — android, ios, desktop or web. `dc vet` says how to
  // take the app screenshot for it.
  platform: null,
  // A node_modules to borrow Playwright/pixelmatch/pngjs from, when the
  // skill's own is not installed. Relative to the root.
  node_modules_from: null,
};

// The two standing rules (SKILL.md, "Standing rules"), stamped into every
// command's output so they are re-read on every run, never remembered.
export const STANDING_RULES = [
  'A board is a static mockup at one width; the implementation is fluid at every width (a board built fluid: port its fluid rule, not its rendered width).',
  "A board's values are placeholders; every value in the implementation comes from real data — wired or left out, never ported.",
];
export const standingRules = (prefix = '⚑ ') => STANDING_RULES.map((r) => `${prefix}${r}`).join('\n');

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
export const HAS_CONFIG = existsSync(CONFIG_FILE);

// A repo may pair SEVERAL design projects, each mirrored to its own
// design_dir: `projects` is a list of pairings, each overriding the file's
// top-level keys (project_id, project_name, design_dir, and any other —
// rename, skip, screens…). No `projects` = the top level is the one pairing.
// With more than one, every command takes `--design <dir>` (or
// `--project <name>`) to say which; PAIRINGS lists them all for the caller
// that loops.
const { projects: extra, ...top } = own;
export const PAIRINGS = (Array.isArray(extra) && extra.length ? extra : [{}])
  .map((e) => ({ ...DEFAULTS, ...top, ...e }));

function pick() {
  if (PAIRINGS.length === 1) return PAIRINGS[0];
  const byDir = opt('--design');
  const byName = opt('--project');
  const hit = PAIRINGS.find((p) => (byDir && p.design_dir === byDir) || (byName && p.project_name === byName));
  if (hit) return hit;
  // help / version / init need no pairing; any of them takes the first.
  if ([undefined, 'help', '--help', 'version', '--version', 'init'].includes(process.argv[2])) return PAIRINGS[0];
  console.error(`${CONFIG_FILE} pairs ${PAIRINGS.length} design projects — say which:`);
  for (const p of PAIRINGS) console.error(`  --design ${p.design_dir}   (${p.project_name ?? 'unnamed'} ${p.project_id ?? 'unpaired'})`);
  process.exit(2);
}
export const CONFIG = pick();
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

/**
 * `git status --porcelain -z` output → [{state, path, from}]. With -z no path
 * is quoted, and a rename or copy is followed by the path it came from.
 */
export function parsePorcelainZ(out) {
  const parts = out.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const state = entry.slice(0, 2);
    const from = /[RC]/.test(state) ? parts[++i] : null;
    files.push({ state: state.trim(), path: entry.slice(3), from });
  }
  return files;
}

/** Every file git sees as changed or new under a path, one per file. */
export const changedPaths = (path) =>
  parsePorcelainZ(git('status', '--porcelain', '-z', '--untracked-files=all', '--', path));

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
