# Changelog

Releases are git tags; `dc version` prints the installed one. Versions follow
semver: a change to what the skill requires of a design, or to how a config is
read, is a major version.

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
