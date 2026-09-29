# Changelog

Releases are git tags; `dc version` prints the installed one. Versions follow
semver: a change to what the skill requires of a design, or to how a config is
read, is a major version.

## v4.3.1 — 2026-09-29

**`dc boards` no longer reports an entity label LOST.** The source labels were
compared raw (`Users &amp; Accounts`) against decoded cut labels, so every
label holding an entity was printed LOST and the command exited 1 though the
board was cut. `lostLabels` compares both sides decoded; tested.

## v4.3.0 — 2026-09-29

**`--width` on `dc render` and `dc vet`.** A board built fluid with no fixed
frame follows the window, so it could only ever be drawn at the shooting
window's default width. `--width <css px>` opens the canvas at that width and
keeps it, and the board is re-measured after the resize — so a shop header
captured live at 726 is compared with the board drawn at 726. `viewportFor`
is the pure helper behind it, tested.

## v4.2.0 — 2026-09-28

**Component canvases, and boards a browser does not draw.**

- A canvas that another canvas imports as its frame (`<dc-import name="X">`,
  X its name without the extension) is a **component**, not a screen: it is
  mirrored (the screens need it to render) but lint no longer demands
  artboards of it, and `dc frames` says what it is. A design that moved
  every screen state into its own artboard and kept the interactive frame in
  a sibling `<Name> Frame.dc.html` was being demanded artboards in the frame.
- `dc lint --measure` now fails, as structure, a board the source declares
  that **no element carries once the canvas runs** — one mounted only when a
  state switcher selects it. Such a board cannot be pictured, diffed or
  vetted; the fix asked for is to draw it side by side with the others,
  always in the page.

## v4.1.0 — 2026-09-28

**`id_map`: ids chosen board by board.** A project that numbers its boards by
hand (the page numbers of a site audit: 01A, 14B, H1, M2) could not tell lint
so; `id_scheme` only counts. `id_map` in `design-changes.json` names the id
per board (`"<canvas>::<label>": "14A"`) and, for a canvas with no artboards
yet, the label its root element gets (`"<canvas>": "06 · Product Page"`).
Lint proposes these first and the scheme for the rest; `DECIDE NOW` for
`id_scheme` is raised only while an unnamed board has neither.

## v4.0.0 — 2026-09-27

**Breaking: the board ↔ code map is verified links made by discovery. Code
comments are no longer the map.**

The map used to be "every file whose text contains the board's id" — comments,
in practice. That is exactly what the code-discovery skill forbids (§3: *a
comment is a hypothesis to check against the code, never evidence*), and on
the first real id reassignment it failed silently: 251 comments went on
"citing" boards that had moved, third-party docs "cited" boards, and bare
numbers matched.

- **`design/SCREEN-LINKS.json`**, one verified link per board: the code that
  implements it (`file#Symbol`), how a person reaches it, status `built` /
  `partial` / `absent`, the evidence (what was searched and read), the board's
  hash and the commit it was checked at.
- **`dc link`** records a link — made by the agent following `code-discovery`:
  `search_code` on what the board draws, callers/routes to confirm it is
  reached, a read to confirm it draws the board. `dc link --from <batch>` for
  many. **`dc links`** re-checks every one: file exists, each symbol still
  **declared** there (a class, def, function or getter — a call does not
  count), board unchanged since checked. A failing link is `recheck`, never
  re-pointed.
- **`dc map` / `dc diff`** draw from links only: implemented by, reached, link
  status, built-against; *not yet linked* for a new board. "Screens with no
  board" is now "screens in code no link points at". `orphan_ids` and the id
  scan are gone; `dc cites` stays, for comment hygiene only.
- SKILL.md: *The map is links made by discovery — never comments*; the sync,
  *Act on it* and *After building a screen* rewritten around links.
- First real map (Ipelegeng, 206 boards): 143 built, 22 partial, 41 absent —
  and discovery corrected two conclusions the comments had produced (an auth
  gate nearly called absent; a fare rule said to be the retired one).
- 6 tests (61).

## v3.1.0 — 2026-09-27

- **`dc cites <id>…`** — every code line citing a board id, as `file:line`,
  matched exactly as the map matches it. Built for the day the design
  reassigns ids: a citation of an id that moved now points at another board
  and nothing flags it — not the map, not `orphan_ids` — because the id still
  exists. On the first real reassignment (58 ids) it listed 548 lines, each
  then decided by what its code is about. 2 tests (57).
- SKILL.md: *When the design reassigns ids*.

## v3.0.2 — 2026-09-27

- v3.0.1 was tagged with `package.json` still at 3.0.0 and the installers
  still pinning v3.0.0 (the version bump failed and the release went ahead
  without it). This release carries v3.0.1's fix with the numbers right; use
  it, not v3.0.1.

## v3.0.1 — 2026-09-27

- **A board's id is read from its caption, not from the screen it draws.**
  `boardId` took the first line shaped `<id> · ` anywhere in the board, so a
  styles screen's hair-type chip (`4C · 4B`, then `3C · 4A`) was read as the
  board's id instead of its caption `20C · STYLES I CAN DO` — and the design
  side rewrote its own chip to get past it. Text inside the device frame
  (`<x-import>…</x-import>`) is now looked at only when nothing outside it
  carries an id. 1 test (55).

## v3.0.0 — 2026-09-26

What the first real demand against a 206-board design showed: most of what
was demanded was already there, the pictures were wrong, and the demand never
reached the design agent.

**Breaking**
- **A device frame states the device.** Requirement 5 is met by a board drawn
  in a device frame — an imported component with a width (`AndroidDevice`
  380×760) — read as the device whose `device_widths` range holds it, or by
  `data-device` as before (the attribute wins). On the real project 173 of 206
  boards were framed and had been demanded a `data-device` anyway. One
  resolver, `devicesOf()`, now decides the device for lint, render, diff and
  vet. The width is the mockup's: it sets the render scale, never a size for
  code (standing rule 1).
- **Demands go as a file in the design project.** `DEMAND-<repo>.md` written
  through `finalize_plan` → `write_files`, and the user sends the design agent
  one line: "Read DEMAND-<repo>.md and apply it." A chat posted with
  `put_conversation` is read-only in Claude Design and unseen by its agent;
  `write_files` needs a plan token and takes content inline only, so whole
  large canvases cannot be patched from here. `demand_mode` is now `"file"` or
  `"write"`; `"post"` is read as `"file"`.

**Fixed**
- **Renders drew no device frame.** Canvases were opened as `file://`, where
  Chromium refuses `fetch()`, so the design runtime could not load
  `./android-frame.jsx`: every render, diff picture and vet sheet showed a
  frameless screen at whatever width was free (678 px for a 380 px phone
  board). Canvases are now served from a local HTTP server
  (`lib/shoot.mjs`, `urlFor`).
- The installers and README still pinned v2.1.1 through v2.2.0 and v2.3.0; they
  now name this release.

**Added**
- `dc frames [<canvas>]` — per board, from the source: the frame it is drawn
  in, a fixed-width box, or none; with totals and the standing rules.
- SKILL.md: test a requirement against the design's source before demanding
  it; the source says what a board is, a render only how it looks;
  requirement 5 (design, static) and standing rule 1 (code, fluid) do not
  conflict. *Demands* rewritten around the file route.
- 8 tests (54): frames, devices, the no-device fix text, the HTTP server.

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
