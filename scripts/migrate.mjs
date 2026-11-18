// Standalone Claude Design (claude.ai/design) closes on 14 December 2026. A repo paired to a project there
// (project_id set, artifact_url not) must move it to claude.ai, where it becomes a "Migrated Design" artifact.
//
//   dc migrate      the steps, for this repo's pairing
//
// The move is done in the user's browser (there is no API or MCP route): the official path is Anthropic's
// "Move from standalone Claude Design to Claude" (support.claude.com, article 17440474), found and carried out
// on 18 Nov 2026 for b2b-desktop. Every sync command prints the short notice until artifact_url is set.
import { CONFIG, CONFIG_FILE } from './lib/config.mjs';

export const DEADLINE = '2026-12-14';

/** Still on standalone Claude Design: paired by project_id, no artifact recorded. */
export const onStandalone = (cfg = CONFIG) =>
  typeof cfg.project_id === 'string' && cfg.project_id.length > 0 && !cfg.artifact_url;

export const migrationNotice = (cfg = CONFIG) =>
  `⚠ MIGRATE: ${cfg.project_name ?? cfg.project_id} is still on standalone Claude Design, which closes on ${DEADLINE}`
  + ' (the claude-design MCP stops with it). Move it to claude.ai before syncing again: `dc migrate` lists the steps.';

export const STEPS = (cfg = CONFIG) => [
  `Move "${cfg.project_name ?? cfg.project_id}" (project ${cfg.project_id}) from standalone Claude Design to claude.ai — before ${DEADLINE}.`,
  '',
  'Done in the user\'s own signed-in Chrome (Claude in Chrome; load its tools in ONE ToolSearch call, call tabs_context_mcp first,',
  'work in a new tab, close it after). The move is the user\'s request: ask once in this turn if it was not asked for.',
  '',
  '1. Open https://claude.ai/design. The banner reads "Claude Design is moving on December 14" with Download and Move all projects.',
  '2. Projects tab: rows already moved say "Moved <date> · Open in Claude". Design systems tab: custom systems move too',
  '   (built-in starter themes and empty systems do not).',
  '3. Move all projects → the review lists what moves (deselect any to leave) → Move all projects → confirm.',
  '   Only the owner can move a project. The standalone copy becomes READ-ONLY for everyone and that cannot be undone;',
  '   chats and comments do NOT move (deleted when the site closes); public links stop working. A single project',
  '   can instead be moved from the banner inside it, or downloaded first: Share › Project HTML › Project archive › Export.',
  '4. Wait for "All N moved" (it keeps going if the tab closes). Anything listed as not moved: download it before the deadline.',
  '5. Find the artifact: the Artifact tool, action "list" — the project keeps its name. Check it: action "read",',
  '   path "project/compat.json" (the page list; its `report` lists what the move could not carry, e.g. an image',
  '   hotlinked from another site, which artifacts block — publish the image into the artifact and point the page at it).',
  `6. Write "artifact_url": "<https://claude.ai/artifact/…>" (and keep project_id, project_name) in ${CONFIG_FILE}; commit.`,
  '7. Sync the new way: `dc paths` → Artifact read (paths, out_dir) → `dc import --from <out_dir>` → `dc compare` →',
  '   `dc import --write` → lint/diff → `dc record <out_dir>/listing.json`. The first sync should report nothing moved',
  '   if the mirror was current.',
];

export default function run() {
  if (!onStandalone()) {
    console.log(CONFIG.artifact_url
      ? `Already on claude.ai: ${CONFIG.artifact_url} — sync with \`dc paths\` / \`dc import\`.`
      : `Not paired (no project_id or artifact_url in ${CONFIG_FILE}).`);
    return 0;
  }
  console.log(STEPS().join('\n'));
  return 0;
}
