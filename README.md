# design-changes

A Claude Code skill for projects designed in **Claude Design** — since the
standalone site closes on 14 Dec 2026, a **"Migrated Design" artifact on
claude.ai**, read and written with Claude Code's Artifact tool (`dc migrate`
says how to move a project still on standalone). It mirrors the
design into the repo byte-exact, holds the design to the structure the skill
needs (and sends the design side a demand when it falls short), says exactly
what changed between syncs (files, boards, copy, style, pictures) and which
code each change touches, keeps a generated board ↔ code map
(`SCREEN-CODE-MAP.md`), and vets a built screen against its board.

## Install (once per machine)

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/elmo365/design-changes-skill/v5.0.1/install.ps1 | iex
```

macOS / Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/elmo365/design-changes-skill/v5.0.1/install.sh | sh
```

The installer puts release **v5.0.1** at `~/.claude/skills/design-changes`,
installs its own Playwright and Chromium, and — until 14 Dec 2026 only, for a
design still on standalone — registers the legacy `claude-design` MCP. Pass a project path
(`install.ps1 -Project <dir>` / `install.sh <dir>`) to write that project's
config at the same time. `dc version` says which release is installed.

**Updating** — run the one-liner of a newer release (the tags on GitHub, and
`CHANGELOG.md`). Set `DESIGN_CHANGES_REF` to install another tag, or `main`
for the development head.

Needs Node 20+, git, and the `claude` CLI.

## Set up a project

In Claude Code, inside the project: **"set up design-changes"**. Claude lists
your artifacts, you pick the design, it writes `design-changes.json`, reads
every file (`dc paths` → Artifact read → `dc import --write`), lints the
design, records the manifest and builds the map. After that,
**"resync the design"** runs the whole sync and reports what moved.

## Commands

`node ~/.claude/skills/design-changes/scripts/dc.mjs help` —
`init`, `migrate`, `paths`, `import`, `compare`, `fetch` (standalone only), `lint`, `images`, `diff`, `map`, `boards`,
`frames`, `link`, `links`, `cites`, `record`, `plan`, `render`, `vet`, `mark`, `version`. `SKILL.md` is
the procedure; `CHANGELOG.md` says what each release changed, and `FIXES.md`
what v2 fixed and why.

The board ↔ code map is made by **discovery** — the `code-discovery` skill with
claude-context, CodeGraph and Serena — and recorded as verified links
(`design/SCREEN-LINKS.json`, `dc link`), re-checked on every run. Code comments
are never the map.

Demands reach the design as a file published into the design artifact
(`project/DEMAND-<repo>.md`); Claude Code then opens the artifact's own chat
(its **Chat** button) in your Chrome, sends *"Read project/DEMAND-<repo>.md in
this artifact and apply it."*, and drives it until the demand is met.

## Develop

`npm test` runs the tests (`node --test`, synthetic fixtures only — no
project's design belongs in this repo).

Releasing: bump `version` in `package.json`, the tag in `install.ps1`,
`install.sh` and this README, add the release to `CHANGELOG.md`, commit, then
tag `vX.Y.Z` and push the tag. Breaking changes to what the skill requires of
a design or a config are a major version.

## License

MIT © Ricardo Elmo Diane
