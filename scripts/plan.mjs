// Fails when a board in the design is not named in the project's plan.
//
//   dc plan
//
// A board that exists in the design and appears nowhere in the plan is work
// nobody has scheduled. Shorthand ("nine KYC screens") counts as unmapped on
// purpose: a board you cannot find by its own label is one you cannot open
// before building it. Needs `plan_doc` in design-changes.json; `plan_count`
// (a regex, group 1 a number) checks a count the plan states.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, ROOT, DESIGN } from './lib/config.mjs';

export default function run() {
  if (!CONFIG.plan_doc) { console.log('No plan_doc set in design-changes.json — nothing to check.'); return 0; }
  const planPath = join(ROOT, CONFIG.plan_doc);
  if (!existsSync(planPath)) { console.error(`plan_doc ${CONFIG.plan_doc} does not exist.`); return 1; }
  const plan = readFileSync(planPath, 'utf8');
  const screens = [];
  const attr = new RegExp(`${CONFIG.board_attr}="([^"]*)"`, 'g');
  for (const file of readdirSync(DESIGN).filter((f) => f.endsWith(CONFIG.canvas_ext))) {
    for (const m of readFileSync(join(DESIGN, file), 'utf8').matchAll(attr)) screens.push({ label: m[1], file });
  }
  if (!screens.length) { console.error(`No boards in ${CONFIG.design_dir}/*${CONFIG.canvas_ext}.`); return 1; }
  const unmapped = screens.filter((s) => !plan.includes(s.label));
  const stated = CONFIG.plan_count ? plan.match(new RegExp(CONFIG.plan_count)) : null;
  const countDrift = stated && Number(stated[1]) !== screens.length;
  console.log(`design boards : ${screens.length}`);
  console.log(`in the plan   : ${screens.length - unmapped.length}`);
  console.log(`not in it     : ${unmapped.length}`);
  if (unmapped.length) {
    console.error(`\nNot named in ${CONFIG.plan_doc}:`);
    for (const s of unmapped) console.error(`  ${s.label}  [${s.file}]`);
  }
  if (countDrift) console.error(`\n${CONFIG.plan_doc} says ${stated[1]} but the design has ${screens.length}.`);
  return unmapped.length || countDrift ? 1 : 0;
}
