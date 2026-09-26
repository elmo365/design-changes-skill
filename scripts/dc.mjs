#!/usr/bin/env node
// design-changes — one entry point for every command.
//
//   node <skill>/scripts/dc.mjs <command> [args] [--root <project>]
//
// Runs against the git work tree of the current directory (or --root), whose
// `design-changes.json` describes the project. `dc init` writes one.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, CONFIG_FILE, DEFAULTS, HAS_CONFIG, ROOT, SKILL } from './lib/config.mjs';

const HELP = `design-changes — what moved in the design, and what it touches in code

  init                         write design-changes.json for this project
  compare <listing.json>       which project files moved (etags vs manifest)
  fetch --listing <l.json> [--changed] [--missing] [--only <path>…]
                               byte-exact fetch (DESIGN_SERVE_URL in the env)
  fetch --listing <l.json> --fix-local
                               strip C2PA from local images
  images [--sheet <out.png>]   changed images: decode, pixel-compare, contact sheet
  lint [--demand <copy.md>] [--measure]
                               the design against what the skill requires of it;
                               writes <design_dir>/DEMAND.md (commit it), and
                               says what to decide before it can be delivered
  diff [--from <ref>] [--to <ref>] [--shots <dir>] [--out <report.md>]
                               boards added/removed/changed, copy, style, pictures, code
  map                          regenerate SCREEN-CODE-MAP.md
  boards <canvas>              list a canvas's boards; fail if one is lost
  record <listing.json>        record the sync in manifest.json
  plan                         every board named in the plan doc
  render <canvas> "<label>"…   artboards to PNG
  vet <canvas> "<label>" --shot <app.png>
                               app screenshot beside its board + copy checklist
  mark "<canvas>::<label>"     record code as built against the board as it is
  version                      the installed skill's version

  --root <dir>                 the project (default: the current git work tree)
  --design <dir> | --project <name>
                               which pairing, when design-changes.json pairs
                               several design projects (its \`projects\` list)
`;

/** The package version, and the git tag the checkout sits on (or how far past it). */
function version() {
  const { version: v } = JSON.parse(readFileSync(join(SKILL, 'package.json'), 'utf8'));
  let at = '';
  try { at = execFileSync('git', ['-C', SKILL, 'describe', '--tags', '--always', '--dirty'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a checkout */ }
  return `design-changes ${v}${at && at !== `v${v}` ? ` (checkout at ${at})` : ''}`;
}

/** Uncommitted edits in the skill's own checkout — work that dies with the session unless committed, tagged and pushed. */
function checkoutDirty() {
  try {
    return execFileSync('git', ['-C', SKILL, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0;
  } catch { return false; }
}

const GLOBAL = ['--root', '--design', '--project'];
const [cmd, ...args] = process.argv.slice(2).filter((a, i, all) => !GLOBAL.includes(a) && !GLOBAL.includes(all[i - 1]));

async function main() {
  if (checkoutDirty()) console.error(`⚠ the skill checkout at ${SKILL} has uncommitted edits — a skill change lives in that repo only: test, bump, CHANGELOG, commit, tag, \`git push origin HEAD:main --tags\` (SKILL.md, "Changing the skill"). Never in a scratchpad.`);
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(`${version()}\n\n${HELP}`); return 0; }
  if (cmd === 'version' || cmd === '--version') { console.log(version()); return 0; }
  if (cmd === 'init') {
    if (HAS_CONFIG) { console.log(`${CONFIG_FILE} already exists.`); return 0; }
    const { node_modules_from, ...starter } = DEFAULTS;
    writeFileSync(CONFIG_FILE, `${JSON.stringify({ ...starter, project_id: null, project_name: null }, null, 2)}\n`);
    console.log(`Wrote ${CONFIG_FILE}. Pair it first: list the claude-design MCP's projects, have the user SELECT one, then set project_id and project_name. Then set design_dir, code_roots and screens.`);
    return 0;
  }
  if (!HAS_CONFIG) console.error(`(no design-changes.json in ${ROOT} — using defaults; \`dc init\` writes one)`);
  // The commands that talk about the server refuse to run unpaired. Pairing is
  // the user's act: the agent lists the MCP's projects and the user selects —
  // never pinned from evidence alone (SKILL.md, "Pairing").
  const paired = typeof CONFIG.project_id === 'string' && /^[0-9a-f-]{16,}$/i.test(CONFIG.project_id);
  if (['compare', 'record', 'fetch'].includes(cmd)) {
    if (!paired) {
      console.error(`Not paired: project_id in ${CONFIG_FILE} is ${JSON.stringify(CONFIG.project_id)}.`);
      console.error('First run: list the projects through the claude-design MCP, have the USER select one, write project_id and project_name, then run this again.');
      return 2;
    }
    console.error(`project: ${CONFIG.project_name ?? '(unnamed — set project_name)'} (${CONFIG.project_id})`);
  }
  switch (cmd) {
    case 'compare': case 'record': return (await import('./manifest.mjs')).default(cmd, args[0]);
    case 'fetch': return (await import('./fetch.mjs')).default();
    case 'images': return (await import('./images.mjs')).default();
    case 'lint': return (await import('./lint.mjs')).default();
    case 'diff': return (await import('./diff.mjs')).default();
    case 'map': { const { writeMap } = await import('./diff.mjs'); console.log(writeMap()); return 0; }
    case 'boards': { const { listBoards } = await import('./diff.mjs'); return listBoards(args[0]); }
    case 'mark': { const { markBuilt } = await import('./diff.mjs'); return markBuilt(args[0]); }
    case 'plan': return (await import('./plan.mjs')).default();
    case 'render': return (await import('./render.mjs')).default(...args);
    case 'vet': return (await import('./vet.mjs')).default(args[0], args[1]);
    default: console.error(`Unknown command "${cmd}".\n\n${HELP}`); return 2;
  }
}

process.exit(await main());
