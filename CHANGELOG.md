# Changelog

Releases are git tags; `dc version` prints the installed one. Versions follow
semver: a change to what the skill requires of a design, or to how a config is
read, is a major version.

## v2.3.0 — 2026-09-26

What the first two real syncs (dashboard, kiosk) showed the skill still let
happen — each closed in code, not only in the doc.

- **Demands live in the repo.** `dc lint` always writes
  `<design_dir>/DEMAND.md` when anything is owed (and removes it when nothing
  is), committed with the sync; `--demand` now only writes a copy. A demand
  in a scratchpad died with the session — twice.
- **Decisions are forced, not parked.** New config `demand_mode`
  (`post` | `write`) and `id_scheme` (`{prefix, start, pad}`); while unset,
  lint prints `DECIDE NOW … ask the user THIS TURN` on every run. With a
  scheme set, lint names the exact id each unnamed board gets (`→ K7`), in
  the console and in the demand.
- **One design project, several repos.** New config `owns` (globs on local
  canvas names this repo builds) and `repo_name`. Other mirrored canvases are
  reference: lint lists their findings as `ref` (never failing, never in this
  repo's demand), the map draws them in their own section and does not count
  them unbuilt, `dc diff` labels them, `dc mark` refuses them. Demands and
  chat titles carry the repo name so the design side knows which repo asks.
- **Skill edits and re-pairing.** Every `dc` run warns while the skill's own
  checkout has uncommitted edits (v2.1.2 was lost in a scratchpad). The
  manifest now records the project it came from: `dc compare` opens with
  `RE-PAIRED` when the config points elsewhere, and `dc record` sets
  `built-against.json` aside as a `.bak` and regenerates the map — the lost
  v2.1.2, remade.
- **Foreign files.** Lint warns on any file under `design_dir` that is
  neither mirrored nor the skill's nor in the new `keep` list — an old scheme
  doc left in place is exactly what the next session would follow.
- SKILL.md: *Required of the repo side*, *One design project, several repos*,
  *Changing the skill*; the Demands and sync steps rewritten around DEMAND.md
  and the two decisions. 9 new tests (46).

## v2.2.0 — 2026-09-26

Standing rules, stamped so they cannot fade from context (owner's ruling,
2026-09-26): (1) a board is a static mockup at one width — the implementation
is fluid at every width, unless the board itself is built fluid, then its
fluid rule is ported, not its rendered width; (2) a board's values are
placeholders — every value in the implementation comes from real data, wired
or left out, never ported.

- SKILL.md: a *Standing rules* section at the top, and the two rules in the
  frontmatter description, so every invocation of the skill re-reads them.
- Stamped in every command output that leads to building or judging a screen:
  `dc render` (before a screen is built), the `dc diff` report header,
  `SCREEN-CODE-MAP.md`, the `dc vet` checklist and its console output —
  via one shared `standingRules()` (lib/config.mjs).

## v2.1.1 — 2026-09-26

- Pairing: the user may specify in plain text what each design points to;
  the agent resolves it against the repo, and asks anything unclear as an
  interactive question in the same turn — never parked in a doc or chat.

## v2.1.0 — 2026-09-26

Pairing (owner's ruling, 2026-09-26): the user selects the design project —
the agent never pins one from evidence alone.

- SKILL.md *Pairing*: on first run the agent lists the claude-design MCP's
  projects and puts every one to the user by name, even a single one; where
  an old mirror exists, match evidence annotates the choices but never
  substitutes for the selection. The selection writes `project_id` AND the
  new `project_name`.
- `dc compare` / `fetch` / `record` refuse to run unpaired (a null or
  v1-placeholder `project_id`), and when paired print
  `project: <name> (<id>)` on every run, so a wrong pairing is seen — the
  first sync has no manifest to catch it otherwise.
- `dc init` writes `project_id: null` + `project_name: null` and says to pair
  first. Local commands (`boards`, `render`, `lint`, `map`, `vet`, `diff`)
  still work unpaired.
- Several designs in one repo: the config's `projects` list pairs each design
  project to its own `design_dir` (each entry overrides the top-level keys),
  the user specifying what each points to; commands take `--design <dir>` /
  `--project <name>` when more than one is paired.
- 6 pairing tests (35 total).

## v2.0.0 — 2026-09-26

The design side is held to a structure, and told when it falls short.
`FIXES.md` has every defect, its fix and its commit.

**Breaking**
- The default `board_id` needs the id written `<id> · ` with a digit in it; the
  v1 rule can be set in `design-changes.json` (see `FIXES.md`, *Upgrading*).
- A board with an id is matched to code by its id only, never its label.
- `dc boards` fails on a canvas with no artboards.
- `built-against.json` entries no longer store a commit; it is read from git.

**Added**
- `dc lint` — the design against the skill's requirements (artboards, ids,
  unique labels, balanced markup, declared devices, notes), with `--demand` to
  write the instructions for the design side and `--measure` to check widths.
- SKILL.md *Required of the design side* and *Demands*: attribute fixes written
  through the claude-design MCP after approval; structure and naming fixes
  posted to the design project.
- Config: `device_attr`, `device_widths`, `device_scale`, `platform`,
  `notes_file`.
- `dc version`; `npm test` (29 tests); MIT license.

**Fixed**
- Render, diff and vet are sized by the board and scaled by its device — no
  fixed window, no phone-only vet sheet.
- Vet's capture method follows the project's platform.
- Renamed, deleted and newly-foldered images; paths git would quote.
- `fetch --only` swallowing option values; truncated images crashing a fetch.
- A mark naming the commit before the build.
- The "screens with no board" table when a screen kind has no rules.
- Defaults free of any one project's conventions.
- The installer installs a tagged release, not whatever `main` holds.

## v1.0.0

The skill as first published: mirror, compare, fetch, images, diff, map,
boards, record, plan, render, vet, mark.
