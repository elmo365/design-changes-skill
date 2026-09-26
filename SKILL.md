---
name: design-changes
description: Mirror a Claude Design project into a repo, hold the design to the structure the skill requires (artboards, board ids, declared devices) and demand fixes from the design side through the claude-design MCP when it falls short, find exactly what changed — which files, which boards, which copy and style, how it looks (Playwright), and which code it affects — keep a generated board↔code map (SCREEN-CODE-MAP.md), and vet a built screen against its board (app screenshot beside the rendered artboard, copy checklist). Use at the start of any design-facing session, whenever the design is said to have moved, before building or ticking a screen against an artboard, after building one (mark it built against its board), and in UI testing to vet screens against the design. First run in a project sets it up through the claude-design MCP.
---

# design-changes — what moved in the design, and what it touches in code

Claude Design keeps **no version history of its own**, and edits reach a board
four ways (chat, inline comments, direct canvas edits, sliders), two of which
leave no trace except in the files. So **the files are the proof, git is the
history, and every resync is committed whole.**

The design belongs to the project. The skill does not guess around a design it
cannot read: it **requires** a structure of the design side, checks it on every
sync, and sends the design side a demand when it is missing.

The narrowing runs in layers; Playwright comes last because it brings vision,
not narrowing:

0. **Lint** — the design meets the requirements below (`dc lint`)
1. **Files** — which project files moved (the MCP's etags against `manifest.json`)
2. **Boards** — which artboards were added, removed or changed
3. **Inside** — copy added and removed; style changes paired old → new, minor ones set aside
4. **Picture** — only the changed boards, old against new, pixel regions
5. **Code** — the files that cite each changed board's id, and whether they were built against this version

Every command is one entry point, run from anywhere inside the project:

```
node "$HOME/.claude/skills/design-changes/scripts/dc.mjs" <command> …
```

Below, `dc` means that line. `dc help` lists every command; `dc version` says
which release is installed.

## The design project — the MCP, and only the MCP

Read the design **only** through the `claude-design` MCP (`list_projects`,
`list_files`, `render_preview`, `read_file`, `list_comments`); write to it only
as *Demands* below says. Its tools may be deferred: load them with ToolSearch
(`select:mcp__claude-design__list_files,…`). If they are missing entirely, the
server is not registered — run the skill's installer, or
`claude mcp add --transport http -s user claude-design https://api.anthropic.com/v1/design/mcp`,
then restart Claude Code.

A `render_preview` serve URL carries a project-scoped token. **Never write it
to a file, a message, or a commit** — pass it to `dc fetch` by environment
variable only.

## Required of the design side

Every canvas meets these. `dc lint` checks them on every sync; a **fail** stops
the build work that depends on that board until it is met.

| # | Requirement | Why | Lint |
|---|---|---|---|
| 1 | **Every screen is an artboard**: its outermost element carries `data-screen-label="<name>"` — a single-screen canvas too | Without one, the screen is invisible: no board diff, no picture, no code link | fail |
| 2 | **Every board has an id**: its caption (or label) leads with `<id> · ` (`13C · SETTINGS`); an id has a digit and is unique in the project | Code cites the id; labels are ordinary words | fail |
| 3 | **Labels are unique in a canvas and stable** — a rename is a new board | A renamed label reads as one board removed and another added | fail |
| 4 | **Balanced markup; boards never nest** | Otherwise a board is cut at the next board's opening, half read | fail |
| 5 | **Every board declares its device**: `data-device="phone\|tablet\|desktop"`, and its frame is that device's width (content inside may be fluid) | Rendering scale, vet layout and the width check come from it | fail (missing); warn with `--measure` (width off its device, frame follows the window) |
| 6 | **A notes file** (`NEXT.md`) says what each session changed and why | The intent a file diff cannot show | warn |

The rule names are the project's to tune in `design-changes.json`
(`board_attr`, `device_attr`, `device_widths`, `board_id`, `notes_file`); the
requirements themselves are not optional.

## Demands — how the skill drives the design

`dc lint --demand <scratch>/demand.md` writes every finding as an instruction,
per canvas. Each finding has a **kind**, and the kind decides how it reaches
the design:

**`attribute` — Claude Code writes it to the design itself.** An attribute or
caption text on an element that already exists: a missing
`data-screen-label` on a single-screen canvas's root, a `data-device`, an id
put at the front of an existing caption.

1. Render the board (`dc render`) and decide the exact edit — which element,
   which attribute, which value (the device from the board's real width, the id
   from the project's id scheme or the next free one).
2. **Show the user each edit (old → new opening tag or caption) and get a yes.**
   Nothing is written to the design without it.
3. `get_claude_design_prompt(project_id)` — required once before any write.
4. `read_file(project_id, <path>)` for the current bytes and etag. Change only
   the approved attributes or caption text; every other byte stays.
5. `write_files(project_id, files: [{path, data, if_match: <etag>}])`. The
   first write asks the user for a one-time project write grant. On a
   `conflict` nothing was written — someone edited the canvas meanwhile: resync
   from step 1 of the sync and decide again.
6. Resync (the etag has moved) and lint again.

**`structure` / `naming` — a demand posted to the design project.** How a
canvas is built or what things are called — splitting one element holding
several screens, unbalanced markup, which label or id a board should have —
is the design side's call, never rewritten from here.

1. `put_conversation(project_id, title: "design-changes — requirements not met <date>", messages: [{role: "user", content: <demand.md>, timestamp: <now, RFC 3339>}])`.
2. This posts a chat in the project's chat panel for whoever works on the
   design. It is **one-way**: Claude Design's own agent does not act on it by
   itself. Tell the user it is posted and that the design side must act on it
   (open the project and have it done).
3. The next sync's lint says whether it was met.

A board that fails lint is still diffed and mirrored — the history must not
stop — but code is not built or marked against it until it passes.

## Pairing — the user selects the project, always

A repo is **paired** to exactly one Claude Design project: `project_id` and
`project_name` in `design-changes.json`, committed. Pairing is the **user's
act**, never the agent's guess:

1. On first run (or whenever `project_id` is null), call the MCP's
   `list_projects` and put **every** project to the user by name — even when
   only one exists, or the evidence looks conclusive. Where an old mirror
   exists, say per project how well its files match (name and size); that
   evidence **annotates the choices, it never substitutes for the selection**.
2. The user selects. The selection may be **plain text** ("the kiosk one",
   "UI design goes with the app screens, the email design with the
   templates") — the agent, knowing the repo, resolves that text to the
   project(s) and the `design_dir` each points to. Whatever is not clear is
   **asked as an interactive question in the same turn** (the question
   prompt, with the projects as options) — never parked in a document, a
   posted chat, or a "let me know" at the end of a message.
3. Write `project_id` AND `project_name`.
3. `dc compare` / `fetch` / `record` refuse to run unpaired, and every run
   prints `project: <name> (<id>)` so a wrong pairing is seen, not suffered.
   A first sync has no manifest to scream GONE, so the printed name is the
   only guard there — read it back to the user before fetching.
4. Re-pairing (the design moved to a new project) is the same procedure; the
   next `dc compare` will list every file as CHANGED/GONE — expected, say so.

**Several designs in one repo.** A repo may pair more than one design project
— say a UI design and an email design — through the config's `projects` list:
one entry per pairing, each with its own `project_id`, `project_name` and
`design_dir` (and any other key it needs to override — `rename`, `skip`,
`screens`). **The user specifies what each design points to**: each entry is
its own pairing, selected by the user exactly as above. With more than one
entry, every command takes `--design <dir>` (or `--project <name>`), and a
full sync is the sync below run once per pairing.

```json
{ "code_roots": ["app/lib"],
  "projects": [
    { "project_id": "…", "project_name": "Dashboard UI", "design_dir": "design" },
    { "project_id": "…", "project_name": "Email templates", "design_dir": "design-email",
      "screens": [] } ] }
```

## First run in a project — set it up and build the map

When the project has no `design-changes.json` at its root:

1. `dc init`, then **pair** (above): `list_projects` → the user selects →
   set `project_id` and `project_name`.
2. Look at the code before filling the rest in, then set:
   - `design_dir` — where the mirror lives (default `design`);
   - `code_roots` — the folders that hold screens (e.g. `["app/lib", "backend"]`);
   - `platform` — what the app runs on (`android`, `ios`, `desktop`, `web`);
   - `rename` — only if canvas names should be shortened locally
     (`{"match": "^Acme DS - (\\d+) (.+)\\.dc\\.html$", "to": "acme-ds-$1-{slug:2}.dc.html"}`);
   - `screens` — each kind of screen in code and the design-system rules one
     with no board must keep (see *Config* below);
   - `plan_doc` — the build plan every board must appear in, if there is one;
   - `mask` — selectors to mask in pictures (live map iframes and the like).
3. Run the **full sync** below with `--missing` (everything is missing). Expect
   lint to fail on a design that predates these requirements: send the demands.
4. `dc map` has now written `<design_dir>/SCREEN-CODE-MAP.md`. Read it and tell
   the user: boards, boards no code cites, boards with no id, screens with no
   board and their verdicts, and the demands sent.
5. Commit `design-changes.json` and the whole `design_dir` in one commit.

## The sync — every step, every run

### 1. What moved (MCP)

1. `list_files(project_id, depth: -1)`. Save the result **exactly as returned**
   to the scratchpad as `listing.json`.
2. `dc compare listing.json` — CHANGED, NEW, GONE, and LOCAL-EDIT (a local copy
   someone edited by hand: resolve it before fetching, because a resync
   overwrites it).
3. If nothing moved, skip to step 6 — the map is still regenerated.

### 2. Fetch, byte-exact (MCP + script)

1. **One** `render_preview(project_id, <any path>)` — its token serves every file
   in the project for about an hour.
2. `DESIGN_SERVE_URL='<serve_url>' dc fetch --listing listing.json --changed --missing`
   - text: the preview server's injected style and script are stripped;
   - images: the C2PA provenance block the server adds to uploads and some JPGs
     is stripped; a truncated download is refused;
   - **nothing is written unless its final size equals the listed size.**
   In PowerShell: `$env:DESIGN_SERVE_URL='<serve_url>'; dc fetch …; Remove-Item Env:DESIGN_SERVE_URL`.

### 3. Lint — the design against the requirements

`dc lint --demand <scratch>/demand.md` (add `--measure` when boards were added
or resized). On failures, deliver the demands (*Demands* above) and tell the
user which boards are blocked. Continue the sync either way.

### 4. Look at the images (not only their bytes)

`dc images --sheet <scratch>/contact.png` — each changed image must decode;
where git has a previous version (a renamed image: its old file) the pixels must
be identical unless the design really changed the picture. **Then open the
contact sheet and look at every image.**

### 5. What changed, narrowed (script + vision)

`dc diff --shots <scratch>/diff --out <scratch>/design-changes.md`
(working tree against HEAD; `--from <ref> --to <ref>` for two commits).

Read the report **and open every picture it names** — `.old`, `.new`, `.diff`
per changed board, each rendered in a window sized to the board at its device's
scale. Tick changed boards element by element. Copy the report's headline into
the resync commit message.

### 6. The map — regenerated on every run, always

`dc diff` rewrites `SCREEN-CODE-MAP.md` on every run (`dc map` does only that):
per board, its id, the code that cites that id, and whether that code was built
against this version; the other way, **screens in code with no board**, each
checked against the project's `screens` rules. Never edit it by hand.

### 7. Record the sync

1. `dc record listing.json`
2. Commit `design_dir` whole — canvases, support files, images, `manifest.json`,
   `SCREEN-CODE-MAP.md` — in one commit, with the report's headline. An
   uncommitted resync loses the only "before" the next diff can have.
3. `dc plan` — when the project has a `plan_doc`, every board must be in it.

### 8. Act on it

- A **changed** board whose code was **built against an older version** is work
  owed: rebuild to the new drawing, then mark it.
- A **new** board cited by no code is unbuilt: place it in the plan.
- A board that **fails lint** is not built against until its demand is met.
- **The design is precedent on UI.** Where the project owner has ruled on
  function, the ruling wins; keep the look.
- **A board is one width; code is fluid.** Transcribe structure and type scale;
  pixel figures are minimums.

## Code cites the board id

Every screen built from a board names that board's **id** in its source — a
comment is enough (`// board 13C · SETTINGS`). The map finds code by id only; a
label ("Settings") is an ordinary word and is used only for a board that has no
id yet. A screen citing an id the design no longer has is listed (`orphan_ids`).

## Before building a screen

`dc lint` passes for its board, then `dc render <canvas> "<board label>"` and
**look at the picture** before writing code — never build from canvas markup
read by eye. `dc boards <canvas>` lists a canvas's labels and ids, and fails on
a canvas with no artboards.

## After building a screen

`dc mark "<canvas>::<board label>"` records that the code now matches that board
as it is (`built-against.json`). **Commit `built-against.json` with the build**:
the map names the commit in which the mark first appears, so the build commit is
the one it shows. The next resync then says exactly which built screens the
design has moved under — Figma's "changed since ready for dev".

## Vetting a screen against its board (UI testing)

1. Take the screenshot of the real app on real data, on what it runs on — `dc
   vet` without `--shot` prints the method for the project's `platform`:
   - android: `adb exec-out screencap -p > shot.png`
   - ios: `xcrun simctl io booted screenshot shot.png`
   - desktop: the app's own capture — a UI/widget test that saves the rendered
     window as PNG, or a window capture of the running app at its real size
   - web: `npx playwright screenshot --viewport-size=<board w>,<board h> <url> shot.png`
     (from the skill folder)
2. `dc vet <canvas> "<board label>" --shot shot.png`
3. Open `<label>.vet.png`. Nothing in it is sized for one kind of device: the
   app screenshot is scaled to the **board's own width**; a tall board (phone,
   tablet portrait) sits beside the app, a wide one (desktop, landscape) above
   it; 20 numbered bands run down each image, each 5 % of **that image's**
   height, so band n is the same relative height on both.
4. Fill in `<label>.vet.md`: every line of the board's copy, and then layout,
   spacing, type, colour and icons — **a verdict per element**: same, differs
   (how), or missing. A whole-screen glance is not a verdict.
5. It is **not a pixel gate**: fonts and widths differ by design. What fails is
   a missing or reworded element, a broken structure, a placeholder, a control
   that does nothing.

## Screens with no board

Not every screen has a mockup. **A screen without one is built from the
design's components and theme, keeping its standard.** The map checks each
against the project's `screens` rules; a ✗ is a screen that has left the design
system — fix it, do not allow-list it.

## Config — `design-changes.json`

| Key | Meaning |
|---|---|
| `project_id`, `project_name` | the paired Claude Design project — set by the user's selection (*Pairing*), never by the agent alone |
| `projects` | several pairings in one repo: a list of entries, each overriding the top-level keys (own `project_id`, `project_name`, `design_dir`, …); commands then take `--design <dir>` / `--project <name>` |
| `design_dir` | the mirror, relative to the root (`design`) |
| `canvas_ext`, `board_attr` | a canvas file and its board attribute (`.dc.html`, `data-screen-label`) |
| `device_attr` | the attribute a board declares its device in (`data-device`) |
| `device_widths` | per device, the CSS px width range of its board (`{"phone": [240, 600], "tablet": [600, 1366], "desktop": [1024, 100000]}`); its keys are the devices a board may declare |
| `device_scale` | pixel scale a board renders at, by device (`{"phone": 2, "tablet": 2, "desktop": 1, "default": 2}`) |
| `platform` | what the app runs on — `android`, `ios`, `desktop`, `web`; `dc vet` gives the capture method |
| `notes_file` | the design side's notes file in `design_dir` (`NEXT.md`); `null` = not checked |
| `rename` | project path → local path: `[{match, to}]`, `$1` a group, `{slug:1}` kebab-cased; `to: null` = not mirrored |
| `skip` | project paths never mirrored |
| `board_id` | regex, group 1 = the id a label or caption leads with; default: letters, digits, dots, dashes with a digit, then ` · `; `null` = labels only |
| `code_roots`, `code_ext`, `skip_dirs` | where code that cites boards is looked for (`skip_dirs` defaults to dependency and build folders only) |
| `screens` | `[{name, path, require: {column: regex}, forbid: {column: regex}, pass_path}]` |
| `orphan_ids` | `{pattern, max}` — code citing an id the design no longer has |
| `plan_doc`, `plan_count` | the plan every board must be in; a stated count to check |
| `mask` | selectors masked in pictures |
| `node_modules_from` | a project folder to borrow Playwright from, if the skill's own is missing |

A Flutter screen rule, for example:

```json
{ "name": "Flutter screens", "path": "^app/lib/ui/screens/.+_screen\\.dart$",
  "require": { "Components": "import '[^']*ui/components/", "Theme": "import '[^']*theme/" },
  "forbid": { "Hard-coded colours": "Color\\(0x[0-9A-Fa-f]+\\)|Colors\\.(?!transparent)\\w+" } }
```

## Versions

Releases are git tags (`vX.Y.Z`, see `CHANGELOG.md`); the installer installs
one. `dc version` prints the installed release. A project that needs a
behaviour from an older release pins it by installing that tag
(`DESIGN_CHANGES_REF`). `FIXES.md` lists what v2.0.0 fixed.
