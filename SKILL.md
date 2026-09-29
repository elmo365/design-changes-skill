---
name: design-changes
description: Mirror a Claude Design project into a repo, hold the design to the structure the skill requires (artboards, board ids, a device per board — its frame or a declared one) and demand fixes from the design side as a file written into the design project through the claude-design MCP when it falls short, find exactly what changed — which files, which boards, which copy and style, how it looks (Playwright), and which code it affects — keep a board↔code map made by discovery with the code-discovery skill and claude-context (verified links in SCREEN-LINKS.json, re-checked every run; code comments are never the map), and vet a built screen against its board (app screenshot beside the rendered artboard, copy checklist). Standing rules travel with every use — a board is a static mockup, code is fluid at every width (unless the board itself is fluid, then port its fluid rules); board values are placeholders, code shows real data only. Use at the start of any design-facing session, whenever the design is said to have moved, before building or ticking a screen against an artboard, after building one (mark it built against its board), and in UI testing to vet screens against the design. First run in a project sets it up through the claude-design MCP.
---

# design-changes — what moved in the design, and what it touches in code

Claude Design keeps **no version history of its own**, and edits reach a board
four ways (chat, inline comments, direct canvas edits, sliders), two of which
leave no trace except in the files. So **the files are the proof, git is the
history, and every resync is committed whole.**

The design belongs to the project. The skill does not guess around a design it
cannot read: it **requires** a structure of the design side, checks it on every
sync, and sends the design side a demand when it is missing.

## Standing rules — every invocation, every screen

These two rules apply to **every** board read, screen built and screen vetted
through this skill, on every run. They are not context that fades; re-apply
them each time. The commands repeat them in their own output so they cannot be
skimmed past.

1. **A board is a static mockup at one width; the implementation is always
   fluid.** Code must hold the board's structure, spacing rhythm and type
   scale at **every** width the app can run at — pixel figures are minimums,
   never fixed sizes, and a layout is never keyed to one window width.
   *Exception:* when the board itself is built fluid (flex, wrap, minmax
   inside its frame), do not freeze its rendered width — port the fluid rule
   itself.

2. **A board's values are placeholders; the implementation's data is real.**
   Every name, number, price, date and list on a board is sample ink. Code
   never ports it: each element is wired to live data, or left out until it
   can be. A hardcoded board value in code is a defect, not a scaffold.

The narrowing runs in layers; Playwright comes last because it brings vision,
not narrowing:

0. **Lint** — the design meets the requirements below (`dc lint`)
1. **Files** — which project files moved (the MCP's etags against `manifest.json`)
2. **Boards** — which artboards were added, removed or changed
3. **Inside** — copy added and removed; style changes paired old → new, minor ones set aside
4. **Picture** — only the changed boards, old against new, pixel regions
5. **Code** — the code **linked** to each changed board by discovery (never found by its comments), and whether it was built against this version

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
| 5 | **Every board says what device it draws**: it is drawn in that device's frame (an imported frame component with a width — `AndroidDevice` 380×760 — is read as the device whose `device_widths` range holds it), or declares `data-device="phone\|tablet\|desktop"` and is drawn at that device's width (content inside may be fluid) | Rendering scale, vet layout and the width check come from it | fail (neither); warn with `--measure` (width off its device, frame follows the window) |
| 6 | **A notes file** (`NEXT.md`) says what each session changed and why | The intent a file diff cannot show | warn |

The rule names are the project's to tune in `design-changes.json`
(`board_attr`, `device_attr`, `device_widths`, `board_id`, `notes_file`); the
requirements themselves are not optional.

**A canvas another canvas imports as its frame** (`<dc-import name="X">`) is a
component, not a screen: mirrored so the screens render, never demanded
artboards. **A board must be in the page when the canvas runs**: one mounted
only when a state switcher selects it cannot be pictured, diffed or vetted;
`dc lint --measure` fails it and asks for the boards side by side.

**Test a requirement against the design's source before demanding it.** A
design may already carry what a rule asks for in another form — 173 of one
project's 206 boards stated their device through the frame they were drawn in,
and were demanded a `data-device` anyway. `dc frames` prints, per board, the
frame it is drawn in, from the source. Read the canvas **source** for what a
board is; a render is a picture of it, made by one browser, and shows only how
it looks.

Requirement 5 is about the **design**, which is a static mockup at one width;
standing rule 1 is about the **code**, which is fluid. They do not conflict. A
frame's width says which kind of device the mockup draws and at what scale its
picture renders — **never a size for code**.

**Required of the repo side** (lint warns; fixed here, never demanded of the
design): `design_dir` holds only the mirror and the skill's own files
(`manifest.json`, `built-against.json`, `SCREEN-LINKS.json`,
`SCREEN-CODE-MAP.md`, `DEMAND.md`, `screenshots/`). Any other file there is **foreign** — usually an old doc or an
old scheme the next session would read and follow. Move it out, delete it, or
list it in `keep` if it truly belongs.

## Demands — how the skill drives the design

`dc lint` writes every finding on a canvas this repo owns as an instruction,
per canvas, to **`<design_dir>/DEMAND.md`** — in the repo, committed with the
sync, removed by lint when nothing is owed. **A demand never lives in a
scratchpad**: a scratchpad dies with the session and the demand with it.
(`--demand <path>` writes a copy as well; the file in the repo is the one that
counts.)

**Two decisions gate delivery, and lint prints `DECIDE NOW` on every run until
they are made.** Each is asked of the user **in the same turn, as an
interactive question** — never written into a handoff, a doc or a "needs your
call":

- `demand_mode` — `"file"` (the demand written into the design project as a
  file; the design agent is told to read and apply it) or `"write"` (approved
  attribute fixes written by Claude Code to canvases small enough to send
  whole; everything else still as the file). `"post"`, from older configs, is
  read as `"file"`.
- `id_scheme` — `{"prefix": "K", "start": 1, "pad": 0}` and the like, the
  moment any board lacks an id — or `id_map`, when the project names each
  board's id itself (`{"<canvas>::<label>": "14A"}`). With either set, lint
  names the exact id each board gets, in the demand and in the console (`→ K7`).

Both are written to `design-changes.json` the moment the user answers; the
next `dc lint` then delivers cleanly.

### The route: a file in the design project

What reaches Claude Design's agent is **a file in its project** — it reads the
project's files from any chat. Two other routes look available and are not:

- **A chat posted from here** (`put_conversation`) is a *synced* chat:
  read-only in Claude Design — nobody can reply or send in it — and the
  design agent in the user's own chats cannot see it. Never use it for a
  demand, and never tell the user to "open the chat and say apply".
- **Editing a canvas from here** replaces the whole file: the MCP has no
  patch, `write_files` takes the content inline only (`local_path` is not
  implemented), so a 30-character fix to a 400 KB canvas means sending all
  400 KB back, typed out, where one wrong byte damages the design.

Delivering a demand:

1. `dc lint` has written `<design_dir>/DEMAND.md`. Write the design side's copy
   from it — **`DEMAND-<repo_name>.md`** — for a reader who has never seen
   this repo: who asks and why, what it replaces, every item with its canvas
   and board named as the design names them (the project's file names, not
   local renames), and what is *not* needed. Change nothing beyond what lint
   found.
2. `get_claude_design_prompt(project_id)` — required once before any write.
3. `finalize_plan(project_id, writes: ["DEMAND-<repo_name>.md"])` — the write
   boundary; it prompts the user and returns a `plan_token` and `base_etags`
   (`"0"` for a new file). `write_files` without a plan token is refused.
4. `write_files(project_id, plan_token, files: [{path, data, if_match}])`.
   A correction inside the token's ~15 minutes reuses it with the new etag.
5. Give the user **the one line to send**, in any chat of the design project:
   *"Read DEMAND-<repo_name>.md in this project and apply it."* The agent does
   nothing until someone sends it.
6. The next sync's lint says whether it was met; when nothing is owed, write
   the file again saying so (or ask the user whether to delete it).

**`demand_mode: "write"`** adds one thing: an **attribute** fix (an attribute
or caption text on an existing element) on a canvas small enough to send whole
may be written by Claude Code — after the user approves each exact edit (old →
new), with `read_file` for the bytes and etag, the same `finalize_plan` →
`write_files`, and a `read_file` afterwards compared byte for byte with what
was meant. Structure and naming — splitting an element, closing markup, which
label or id a board gets — are the design side's call, always in the file.

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
4. Re-pairing (the design moved to a new project) is the same procedure. The
   manifest remembers which project it was recorded from: the next
   `dc compare` opens with `RE-PAIRED` and lists every file as CHANGED/GONE —
   expected, say so — and `dc record` then retires what described the old
   project (`built-against.json` set aside as a `.bak`, the map regenerated),
   so no mark or map from the old design survives into the new.

**One design project, several repos.** A design project often draws more than
one app — a kiosk and the dashboard it talks to — and each app's repo mirrors
it. That is the normal shape, and the skill models it rather than flagging
it. Each repo says which canvases are **its own** with `owns` (globs on the
local canvas name); every other mirrored canvas is **reference** — a canvas
this repo's screens link to and must see, but another repo builds. In this
repo a reference canvas is diffed for history and drawn in the map's own
section, but it is **never demanded here, never marked here, never counted
unbuilt here**: lint lists its findings as `ref`, `dc mark` refuses it, and
the map does not blame this repo for it. `repo_name` (default: the root
folder's name) goes on every demand and chat so the design side knows which
repo asks. With `owns` unset, the repo owns everything it mirrors.

```json
{ "repo_name": "eezze_kiosk",
  "owns": ["kiosk-*.dc.html"],
  "keep": ["docs/*.md"] }
```

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

`dc lint` (add `--measure` when boards were added or resized). It writes
`<design_dir>/DEMAND.md` when anything is owed on a canvas this repo owns,
and prints `DECIDE NOW` while `demand_mode` or `id_scheme` is unset — **ask
the user those in this turn** (*Demands* above), write the answers, run lint
again, then deliver it as a file in the design project (*Demands*, *The
route*). Before demanding a rule, check the design does not already meet it
another way (`dc frames` for devices). Tell the user which boards are
blocked, and which findings are `ref` (another repo's to demand). A `foreign
file` warning is repo-side: deal with it before the commit. Continue the sync
either way.

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
per board, its id, the code **linked** to it (`SCREEN-LINKS.json`, below), how
a person reaches it, the link's status and whether each link still holds, and
whether the code was built against this version; the other way, **screens in
code no link points at**, each checked against the project's `screens` rules.
Never edit it by hand. A **new** board is *not yet linked* until discovery
links it; a **changed** board's link is flagged *recheck*.

### 7. Record the sync

1. `dc record listing.json`
2. Commit `design_dir` whole — canvases, support files, images, `manifest.json`,
   `SCREEN-LINKS.json`, `SCREEN-CODE-MAP.md`, `DEMAND.md` — in one commit, with
   the report's headline. An uncommitted resync loses the only "before" the next diff can
   have; an uncommitted demand is lost with the session.
3. `dc plan` — when the project has a `plan_doc`, every board must be in it.

### 8. Act on it

- A **changed** board whose code was **built against an older version** is work
  owed: rebuild to the new drawing, then mark it.
- A **new** board is linked by discovery (below); if nothing implements it, it
  is linked `absent` and placed in the plan.
- A link flagged **recheck** (the board changed, the file or symbol moved) is
  rediscovered and linked again — never patched to make the flag go away.
- A board that **fails lint** is not built against until its demand is met.
- **The design is precedent on UI.** Where the project owner has ruled on
  function, the ruling wins; keep the look.
- **A board is one width; code is fluid.** Transcribe structure and type scale;
  pixel figures are minimums.

## The map is links made by discovery — never comments

**Which code implements a board is established by discovery, following the
`code-discovery` skill, and recorded as a link.** A comment naming a board id
is a hypothesis, never a link: ids get reassigned, boards get retired, and a
comment keeps pointing wherever the id now lands with nothing to notice (one
reassignment re-pointed 251 comments at the wrong boards, silently). The
skill's scripts do not search code for ids to build the map; nothing does.

To link a board (a new one, one flagged recheck, or a first map):

1. **Locate** with the MCP tools, per `code-discovery` §1: `search_code` on
   what the board draws (its title, its lines, its purpose); the app's router
   and the back office's URLs tell what is bound. **A search miss is not
   absence** — list the screen files and read before calling anything absent
   (an auth gate was nearly linked `absent` because two searches missed it).
2. **Confirm it is reached** (`code-discovery` §2.4): the route that builds it,
   or the reached screen that opens it — `codegraph_explore` / Serena callers.
   A screen nothing opens is `partial`, with *unreachable* said.
3. **Confirm it draws the board**: read it. A mechanical cross-check is fine
   in a file already identified — the board's own wording found verbatim in
   its string literals — but words the server composes, sample values and
   icon ligatures will not be there, so a low figure is a prompt to read, not
   a verdict.
4. **Record it:**
   `dc link "<canvas>::<label>" --status built|partial|absent --code <file>#<Symbol>[,…] --reached "<how a person gets there>" --evidence "<what was searched, read and found>"`
   (`dc link --from <batch.json>` for many; every entry gets the same checks).
   `built` — code implements it and is reached; `partial` — part of it, or
   unreachable, with the gap said; `absent` — nothing implements it.
   Comments and docs may **suggest** where to look; they are never the
   evidence (`code-discovery` §3).

The script re-checks every link on every run (`dc links`, and the map): the
file exists, each symbol is still **declared** there (a class, def, function
or getter — a call does not count), and the board has not changed since the
link was checked. A failing link is reported `recheck`, never silently
re-pointed. `design/SCREEN-LINKS.json` is committed with the sync.

**Linking says where; vetting says how well.** Element-by-element fidelity is
`dc vet`'s job (below), and `dc mark` records it.

### Comments that cite ids — hygiene only

Code comments may still name board ids for the reader, but they decide
nothing. When the design reassigns ids, comments go stale; `dc cites <ids>`
lists every citing line so they can be corrected, each decided by what its
code is about. A comment citing a **retired** board is not renumbered to the
successor — the code may still build the retired behaviour; say so where the
work is tracked.

## Before building a screen

`dc lint` passes for its board, then `dc render <canvas> "<board label>"` and
**look at the picture** before writing code — never build from canvas markup
read by eye. `dc boards <canvas>` lists a canvas's labels and ids, and fails on
a canvas with no artboards; `dc frames [<canvas>]` says what each board is
drawn in, from the source.

The picture is how the board **looks**; the source says what it **is**. A
render serves the canvas over a local HTTP server so the design runtime can
load what the board imports (its device frame); a board that renders with no
frame, or at a width its source does not state, is a rendering fault to fix in
the skill — never a fact about the design. A board built fluid with no fixed
frame follows the window: render and vet it with `--width <css px>`, the
width the app was captured at (`dc render … --width 726`,
`dc vet … --shot shot.png --width 726`), one pair per width you compare.

## After building a screen

`dc link` the board to the code that now implements it (discovery, as above —
the code you just wrote is still confirmed reached, not assumed), then
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
| `repo_name` | this repo's name on demands and chats posted to the project (default: the root folder's name) |
| `owns` | globs on local canvas names this repo builds; the rest is reference — diffed, never demanded, marked or counted unbuilt here (null: all) |
| `keep` | globs on paths under `design_dir` allowed besides the mirror and the skill's own; anything else is a foreign-file warning |
| `demand_mode` | `"file"` or `"write"` — how demands reach the design (`"post"` is read as `"file"`); null: lint says `DECIDE NOW`, ask the user this turn |
| `id_scheme` | `{prefix, start, pad}` — how a board with no id gets one; lint then proposes the exact id; null: lint says `DECIDE NOW` when a board lacks an id |
| `id_map` | `{"<canvas>::<label>": "14A", "<canvas>": "06 · Product Page"}` — ids chosen board by board (a project that numbers boards by hand); lint proposes these first, the scheme for the rest; a bare canvas key is the root label a canvas with no artboards gets |
| `projects` | several pairings in one repo: a list of entries, each overriding the top-level keys (own `project_id`, `project_name`, `design_dir`, …); commands then take `--design <dir>` / `--project <name>` |
| `design_dir` | the mirror, relative to the root (`design`) |
| `canvas_ext`, `board_attr` | a canvas file and its board attribute (`.dc.html`, `data-screen-label`) |
| `device_attr` | the attribute a board declares its device in (`data-device`); it wins over the device read from the board's frame |
| `device_widths` | per device, the CSS px width range of its board (`{"phone": [240, 600], "tablet": [600, 1366], "desktop": [1024, 100000]}`); a frame's width is read as the device whose range holds it; its keys are the devices a board may declare. Mockup widths — never sizes for code |
| `device_scale` | pixel scale a board renders at, by device (`{"phone": 2, "tablet": 2, "desktop": 1, "default": 2}`) |
| `platform` | what the app runs on — `android`, `ios`, `desktop`, `web`; `dc vet` gives the capture method |
| `notes_file` | the design side's notes file in `design_dir` (`NEXT.md`); `null` = not checked |
| `rename` | project path → local path: `[{match, to}]`, `$1` a group, `{slug:1}` kebab-cased; `to: null` = not mirrored |
| `skip` | project paths never mirrored |
| `board_id` | regex, group 1 = the id a label or caption leads with; default: letters, digits, dots, dashes with a digit, then ` · `; `null` = labels only |
| `code_roots`, `code_ext`, `skip_dirs` | where code that cites boards is looked for (`skip_dirs` defaults to dependency and build folders only) |
| `screens` | `[{name, path, require: {column: regex}, forbid: {column: regex}, pass_path}]` |
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

## Changing the skill

The skill's checkout (`$HOME/.claude/skills/design-changes`) **is** its git
repo. A change to the skill is made there and nowhere else — never drafted in
a scratchpad, a project repo or a handoff, all of which die with the session
(v2.1.2 was lost exactly that way). Every `dc` run warns while that checkout
has uncommitted edits. The sequence, in one sitting:

1. Edit in the checkout; `npm test` green; add a test for the change.
2. Bump `package.json`, add the `CHANGELOG.md` entry.
3. Commit, tag `vX.Y.Z`, and — the installer leaves the checkout on a tag,
   detached — push with `git push origin HEAD:main --tags`.
