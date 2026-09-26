#!/usr/bin/env sh
# Install or update the design-changes skill for every project on this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/elmo365/design-changes-skill/v2.0.0/install.sh | sh
#   ./install.sh [project-path]          # from a checkout; a path also sets a project up
#
# Installs one release: the tag in DESIGN_CHANGES_REF, by default this script's
# own release ('main' gives the development head). Same four steps as
# install.ps1: skill files, Playwright + Chromium, the claude-design MCP, and
# optionally a project's config and first map.
set -eu
REPO="${DESIGN_CHANGES_REPO:-https://github.com/elmo365/design-changes-skill.git}"
REF="${DESIGN_CHANGES_REF:-v2.0.0}"
TARGET="$HOME/.claude/skills/design-changes"
PROJECT="${1:-}"

echo "1/4 skill files ($REF)"
if [ -d "$TARGET/.git" ]; then
  git -C "$TARGET" fetch --quiet --tags --force origin
  git -C "$TARGET" checkout --quiet "$REF"
  if git -C "$TARGET" symbolic-ref -q HEAD >/dev/null; then git -C "$TARGET" pull --quiet --ff-only; fi
elif [ -e "$TARGET" ]; then
  echo "$TARGET exists and is not a git checkout. Move it aside, then run this again." >&2
  exit 1
else
  mkdir -p "$(dirname "$TARGET")"
  git clone --quiet --branch "$REF" "$REPO" "$TARGET"
fi

echo '2/4 Playwright and Chromium'
(cd "$TARGET" && npm install --no-audit --no-fund)

echo '3/4 claude-design MCP'
if ! command -v claude >/dev/null 2>&1; then
  echo '    claude CLI not on PATH. Register it yourself:'
  echo '    claude mcp add --transport http -s user claude-design https://api.anthropic.com/v1/design/mcp'
elif claude mcp get claude-design >/dev/null 2>&1; then
  echo '    already registered'
else
  claude mcp add --transport http -s user claude-design https://api.anthropic.com/v1/design/mcp
  echo '    registered - restart Claude Code, then authenticate it with /mcp if asked'
fi

echo '4/4 project'
if [ -n "$PROJECT" ]; then
  (cd "$PROJECT" && node "$TARGET/scripts/dc.mjs" init && node "$TARGET/scripts/dc.mjs" map) \
    || echo '    no design mirrored yet - the first sync builds the map'
else
  echo '    none given. In a project, ask Claude Code: "set up design-changes"'
fi
node "$TARGET/scripts/dc.mjs" version
echo "Installed at $TARGET"
