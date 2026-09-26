# Fixes in v2.0.0

A review of v1.0.0, run against a real 16-canvas Claude Design project, found
the defects below. Each was fixed in its own commit; the commit message carries
the full note (defect, fix, how it was checked) — `git show <commit>`.

The principle behind #1–#6: **the design belongs to the project.** Where the
skill needs a structure from the design, it requires it, checks it (`dc lint`),
and sends the design side a demand — it does not guess around a design it
cannot read.

## Design side — required, checked, demanded

| # | Defect | Fix | Where | Commit |
|---|---|---|---|---|
| 1 | A canvas with no artboards passed in silence (5 of 16 on the real project): no board diff, no picture, no code link; `dc boards` exited 0 | Required: every screen is an artboard. `dc lint` and `dc boards` fail on a canvas with none | `scripts/lint.mjs`, `scripts/diff.mjs`, SKILL.md | c5bcf62 |
| 2 | Boards had no id, so code could only be matched by label | Required: every caption (or label) leads with `<id> · `; ids unique in the project. Lint fails otherwise | `scripts/lint.mjs`, `scripts/lib/canvas.mjs`, SKILL.md | c5bcf62 |
| 3 | A duplicate or renamed label read as boards removed and added | Required: labels unique and stable. Lint fails on duplicates | `scripts/lint.mjs`, SKILL.md | c5bcf62 |
| 4 | A board whose markup ran into the next was cut short silently | The cutter reports it (`boards().unclosed`); lint fails on it | `scripts/lib/canvas.mjs`, `scripts/lint.mjs` | 6325bf6, c5bcf62 |
| 5 | Nothing said what device a board draws | Required: `data-device`. Lint fails without it; `--measure` warns on a width off its device or a frame that follows the window | `scripts/lint.mjs`, `scripts/lib/config.mjs`, SKILL.md | c5bcf62 |
| 6 | The design's intent was not recorded | Required: a notes file (`NEXT.md`); lint warns when a canvas changed and it did not | `scripts/lint.mjs`, SKILL.md | c5bcf62 |

How a demand reaches the design (SKILL.md, *Demands*): an **attribute** fix is
written to the design by Claude Code through the `claude-design` MCP
(`write_files`, with the file's etag, after the user approves each edit); a
**structure** or **naming** fix is posted to the design project's chat
(`put_conversation`) for the design side to act on.

## Code side

| # | Defect | Fix | Where | Commit |
|---|---|---|---|---|
| 7 | Code was matched to boards by label OR id; "Settings" matched 55 of 403 files, "Call Monitor - Audio" none | A board with an id is matched by its id only; the label only until the design gives it one | `scripts/diff.mjs` | 29e2487 |
| 8 | `vet` scaled both images to a fixed 420 px, side by side, bands every 60 px — a phone layout | Sized by the measured board; wide boards stack, tall ones sit side by side; bands are 5 % of each image's own height | `scripts/vet.mjs` | b570ca9 |
| 9 | Render and diff used a fixed 1600×1200 window and fixed scales (and diff crashed on a board that did not draw) | The window is sized to the board; the scale comes from its device (`device_scale`) | `scripts/lib/shoot.mjs`, `scripts/render.mjs`, `scripts/diff.mjs` | ea969fd |
| 10 | The procedure hard-coded `adb` for the app screenshot | `platform` config; `dc vet` gives the capture method for android, ios, desktop or web | `scripts/vet.mjs`, `scripts/lib/config.mjs`, SKILL.md | b570ca9 |
| 11 | `fetch --only a --listing l.json` fetched `l.json` | `--only` stops at the next option | `scripts/fetch.mjs` | 61340ed |
| 12 | `images` misread renames (`a -> b`), crashed on deletions, missed files in new folders | `git status --porcelain -z --untracked-files=all`; renames compared with their old file | `scripts/lib/config.mjs`, `scripts/images.mjs`, `scripts/diff.mjs` | 835abc3 |
| 13 | A truncated PNG/JPEG threw and ended the fetch | Bounds-checked; refused and reported | `scripts/fetch.mjs` | 61340ed |
| 14 | `mark` recorded the commit before the build | The commit is read from git: the one where the mark first appears — the build commit | `scripts/diff.mjs` | 7155aeb |
| 15 | Defaults carried another project's conventions (its id regex, Django folders) | Generic id rule (the required ` · ` form); `skip_dirs` holds dependency and build folders only | `scripts/lib/config.mjs`, `scripts/lib/canvas.mjs` | 954f9dc |
| 19 | A `screens` kind with no rules wrote a table whose header and separator disagreed (found in the final verification pass) | Header, separator and rows built from one cell list | `scripts/diff.mjs` | f32aaa8 |

## Repo

| # | Defect | Fix | Where | Commit |
|---|---|---|---|---|
| 16 | No tests | `npm test` — 29 tests on synthetic fixtures (no project's design in a public repo) | `test/` | 5b4cd1a |
| 17 | No license | MIT, © Ricardo Elmo Diane | `LICENSE` | f373392 |
| 18 | The installer installed whatever `main` held | Semver tags (v1.0.0 = first published, v2.0.0 = this); installers pin a tag; `dc version` | `install.ps1`, `install.sh`, README, `scripts/dc.mjs` | d3e62df |

## Upgrading from v1.0.0

- **Board ids:** the default `board_id` now needs `<id> · ` (a digit in the id).
  A project whose labels lead with a bare id ("A8 EFT proofs") either writes
  them the required way or sets the old rule in `design-changes.json`:
  `"board_id": "^(A\\d+[a-z]?|\\d{1,2}[A-Z]{0,2}\\d?)\\b"`.
- **Code matching:** code that cited a board by its label only now needs the
  board's id in it.
- **Lint:** run `dc lint --demand …` once and send the demands; an older design
  will fail until the design side has artboards, ids and devices.
- **Marks** made by v1 keep their stored commit, labelled "recorded before the
  build", until re-marked.
