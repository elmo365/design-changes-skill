# design-changes

A Claude Code skill for projects designed in **Claude Design**. It mirrors the
design into the repo byte-exact, says exactly what changed between syncs (files,
boards, copy, style, pictures) and which code each change touches, keeps a
generated board ↔ code map (`SCREEN-CODE-MAP.md`), and vets a built screen
against its board.

## Install (once per machine)

Windows:

```powershell
gh repo clone elmo365/design-changes-skill $env:TEMP\dcs; & $env:TEMP\dcs\install.ps1
```

macOS / Linux:

```sh
gh repo clone elmo365/design-changes-skill /tmp/dcs && sh /tmp/dcs/install.sh
```

The installer puts the skill at `~/.claude/skills/design-changes`, installs its
own Playwright and Chromium, and registers the `claude-design` MCP for your user
if it is not there. Run it again to update. Pass a project path
(`install.ps1 -Project <dir>` / `install.sh <dir>`) to write that project's
config at the same time.

Needs Node 20+, git, and the `claude` CLI.

## Set up a project

In Claude Code, inside the project: **"set up design-changes"**. Claude finds
the design project through the MCP, writes `design-changes.json`, fetches every
file, records the manifest and builds the map. After that, **"resync the
design"** runs the whole sync and reports what moved.

## Commands

`node ~/.claude/skills/design-changes/scripts/dc.mjs help` —
`init`, `compare`, `fetch`, `images`, `diff`, `map`, `boards`, `record`,
`plan`, `render`, `vet`, `mark`. `SKILL.md` is the procedure.
