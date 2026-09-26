#!/usr/bin/env node
// design-changes — one entry point for every command.
//
//   node <skill>/scripts/dc.mjs <command> [args] [--root <project>]
//
// Runs against the git work tree of the current directory (or --root), whose
// `design-changes.json` describes the project. `dc init` writes one.
import { existsSync, writeFileSync } from 'node:fs';
import { CONFIG_FILE, DEFAULTS, HAS_CONFIG, ROOT } from './lib/config.mjs';

const HELP = `design-changes — what moved in the design, and what it touches in code

  init                         write design-changes.json for this project
  compare <listing.json>       which project files moved (etags vs manifest)
  fetch --listing <l.json> [--changed] [--missing] [--only <path>…]
                               byte-exact fetch (DESIGN_SERVE_URL in the env)
  fetch --listing <l.json> --fix-local
                               strip C2PA from local images
  images [--sheet <out.png>]   changed images: decode, pixel-compare, contact sheet
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

  --root <dir>                 the project (default: the current git work tree)
`;

const [cmd, ...args] = process.argv.slice(2).filter((a, i, all) => a !== '--root' && all[i - 1] !== '--root');

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(HELP); return 0; }
  if (cmd === 'init') {
    if (HAS_CONFIG) { console.log(`${CONFIG_FILE} already exists.`); return 0; }
    const { node_modules_from, ...starter } = DEFAULTS;
    writeFileSync(CONFIG_FILE, `${JSON.stringify({ ...starter, project_id: '<claude design project id>' }, null, 2)}\n`);
    console.log(`Wrote ${CONFIG_FILE}. Set project_id, design_dir, code_roots and screens.`);
    return 0;
  }
  if (!HAS_CONFIG) console.error(`(no design-changes.json in ${ROOT} — using defaults; \`dc init\` writes one)`);
  switch (cmd) {
    case 'compare': case 'record': return (await import('./manifest.mjs')).default(cmd, args[0]);
    case 'fetch': return (await import('./fetch.mjs')).default();
    case 'images': return (await import('./images.mjs')).default();
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
