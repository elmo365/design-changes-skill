---
name: design-changes
description: Mirror a Claude Design project into a repo and find exactly what changed — which files, which boards, which copy and style, how it looks (Playwright), and which code it affects — keep a generated board↔code map (SCREEN-CODE-MAP.md), and vet a built screen against its board (app screenshot beside the rendered artboard, copy checklist). Use at the start of any design-facing session, whenever the design is said to have moved, before building or ticking a screen against an artboard, after building one (mark it built against its board), and in UI testing to vet screens against the design. First run in a project sets it up through the claude-design MCP.
---

# design-changes — what moved in the design, and what it touches in code

Claude Design keeps **no version history of its own**, and edits reach a board
four ways (chat, inline comments, direct canvas edits, sliders), two of which
leave no trace except in the files. So **the files are the proof, git is the
history, and every resync is committed whole.**

The narrowing runs in layers; Playwright comes last because it brings vision,
not narrowing:

1. **Files** — which project files moved (the MCP's etags against `manifest.json`)
2. **Boards** — which artboards were added, removed or changed
3. **Inside** — copy added and removed; style changes paired old → new, minor ones set aside
4. **Picture** — only the changed boards, old against new, pixel regions
5. **Code** — the files that cite each changed board, and whether they were built against this version

Every command is one entry point, run from anywhere inside the project:

```
node "$HOME/.claude/skills/design-changes/scripts/dc.mjs" <command> …
```

Below, `dc` means that line. `dc help` lists every command.

## The design project — the MCP, and only the MCP

Read the design **only** through the `claude-design` MCP (`list_projects`,
`list_files`, `render_preview`, `read_file`, `list_comments`). Its tools may be
deferred: load them with ToolSearch (`select:mcp__claude-design__list_files,…`).
If they are missing entirely, the server is not registered — run the skill's
installer, or `claude mcp add --transport http -s user claude-design https://api.anthropic.com/v1/design/mcp`,
then restart Claude Code.

A `render_preview` serve URL carries a project-scoped token. **Never write it
to a file, a message, or a commit** — pass it to `dc fetch` by environment
variable only.

## First run in a project — set it up and build the map

When the project has no `design-changes.json` at its root:

1. `list_projects` → find the project (ask the user if more than one could be
   it). `dc init` writes a starter `design-changes.json`; set `project_id`.
2. Look at the code before filling the rest in, then set:
   - `design_dir` — where the mirror lives (default `design`);
   - `code_roots` — the folders that hold screens (e.g. `["app/lib", "backend"]`);
   - `rename` — only if canvas names should be shortened locally
     (`{"match": "^Acme DS - (\\d+) (.+)\\.dc\\.html$", "to": "acme-ds-$1-{slug:2}.dc.html"}`);
   - `screens` — each kind of screen in code and the design-system rules one
     with no board must keep (see *Config* below);
   - `plan_doc` — the build plan every board must appear in, if there is one;
   - `mask` — selectors to mask in pictures (live map iframes and the like).
3. Run the **full sync** below with `--missing` (everything is missing).
4. `dc map` has now written `<design_dir>/SCREEN-CODE-MAP.md`. Read it and tell
   the user: boards, boards no code cites, screens with no board and their
   verdicts.
5. Commit `design-changes.json` and the whole `design_dir` in one commit.

## The sync — every step, every run

### 1. What moved (MCP)

1. `list_files(project_id, depth: -1)`. Save the result **exactly as returned**
   to the scratchpad as `listing.json`.
2. `dc compare listing.json` — CHANGED, NEW, GONE, and LOCAL-EDIT (a local copy
   someone edited by hand: resolve it before fetching, because a resync
   overwrites it).
3. If nothing moved, skip to step 5 — the map is still regenerated.

### 2. Fetch, byte-exact (MCP + script)

1. **One** `render_preview(project_id, <any path>)` — its token serves every file
   in the project for about an hour.
2. `DESIGN_SERVE_URL='<serve_url>' dc fetch --listing listing.json --changed --missing`
   - text: the preview server's injected style and script are stripped;
   - images: the C2PA provenance block the server adds to uploads and some JPGs
     is stripped;
   - **nothing is written unless its final size equals the listed size.**
   In PowerShell: `$env:DESIGN_SERVE_URL='<serve_url>'; dc fetch …; Remove-Item Env:DESIGN_SERVE_URL`.

### 3. Look at the images (not only their bytes)

`dc images --sheet <scratch>/contact.png` — each changed image must decode;
where git has a previous version the pixels must be identical unless the design
really changed the picture. **Then open the contact sheet and look at every
image.**

### 4. What changed, narrowed (script + vision)

`dc diff --shots <scratch>/diff --out <scratch>/design-changes.md`
(working tree against HEAD; `--from <ref> --to <ref>` for two commits).

Read the report **and open every picture it names** — `.old`, `.new`, `.diff`
per changed board. Tick changed boards element by element. Copy the report's
headline into the resync commit message.

### 5. The map — regenerated on every run, always

`dc diff` rewrites `SCREEN-CODE-MAP.md` on every run (`dc map` does only that):
per board, its id, the code that cites it, and whether that code was built
against this version; the other way, **screens in code with no board**, each
checked against the project's `screens` rules. Never edit it by hand.

### 6. Record the sync

1. `dc record listing.json`
2. Commit `design_dir` whole — canvases, support files, images, `manifest.json`,
   `SCREEN-CODE-MAP.md` — in one commit, with the report's headline. An
   uncommitted resync loses the only "before" the next diff can have.
3. `dc plan` — when the project has a `plan_doc`, every board must be in it.

### 7. Act on it

- A **changed** board whose code was **built against an older version** is work
  owed: rebuild to the new drawing, then mark it.
- A **new** board cited by no code is unbuilt: place it in the plan.
- **The design is precedent on UI.** Where the project owner has ruled on
  function, the ruling wins; keep the look.
- **A board is one width; code is fluid.** Transcribe structure and type scale;
  pixel figures are minimums.

## Before building a screen

`dc render <canvas> "<board label>"` and **look at the picture** before writing
code — never build from canvas markup read by eye. `dc boards <canvas>` lists a
canvas's labels.

## After building a screen

`dc mark "<canvas>::<board label>"` records that the code now matches that board
as it is (`built-against.json`). The next resync then says exactly which built
screens the design has moved under — Figma's "changed since ready for dev".

## Vetting a screen against its board (UI testing)

1. Take the screenshot on a real device or emulator, of the real app on real
   data (`adb exec-out screencap -p > shot.png`, or the test driver's own).
2. `dc vet <canvas> "<board label>" --shot shot.png`
3. Open `<label>.vet.png`: the board and the app side by side at one width,
   a numbered band every 60 px on both.
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
| `project_id` | the Claude Design project |
| `design_dir` | the mirror, relative to the root (`design`) |
| `canvas_ext`, `board_attr` | a canvas file and its board attribute (`.dc.html`, `data-screen-label`) |
| `rename` | project path → local path: `[{match, to}]`, `$1` a group, `{slug:1}` kebab-cased; `to: null` = not mirrored |
| `skip` | project paths never mirrored |
| `board_id` | regex, group 1 = the id a label or caption leads with (`"13C · …"`); `null` = labels only |
| `code_roots`, `code_ext`, `skip_dirs` | where code that cites boards is looked for |
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

## Asking the design side

Nothing is required of the design side. Conventions that sharpen the narrowing:

- **Board labels stay unique and stable** — a renamed label reads as one board
  removed and another added.
- **Captions start with the board id** (`9A1 · WAITING FOR A REQUEST`) — that id
  is how code is found.
- **Balanced markup inside a board.**
- **A notes file** (`NEXT.md`) saying what a session changed and why — the
  intent a file diff cannot show.
