# Install or update the design-changes skill for every project on this machine.
#
#   irm https://raw.githubusercontent.com/elmo365/design-changes-skill/main/install.ps1 | iex
#   .\install.ps1 [-Project <path>]      # from a checkout; -Project also sets a project up
#
# 1. The skill goes to ~/.claude/skills/design-changes (cloned, or pulled if there).
# 2. Its own Playwright, pixelmatch and pngjs, and Chromium.
# 3. The claude-design MCP, registered for the user if it is not already.
# 4. With -Project: design-changes.json written there, and the map built if
#    the design is already mirrored. The first sync itself runs inside Claude
#    Code (the MCP is only reachable from a session): ask "set up design-changes".
param(
  [string]$Project = '',
  [string]$Repo = 'https://github.com/elmo365/design-changes-skill.git'
)
# Native tools write progress to stderr; Windows PowerShell 5.1 would treat
# that as a failure under 'Stop'. Exit codes decide instead.
$ErrorActionPreference = 'Continue'
$target = Join-Path $HOME '.claude\skills\design-changes'
function Check($what) { if ($LASTEXITCODE -ne 0) { Write-Error "$what failed (exit $LASTEXITCODE)"; exit 1 } }

Write-Host '1/4 skill files'
if (Test-Path (Join-Path $target '.git')) {
  git -C $target pull --ff-only; Check 'git pull'
} elseif (Test-Path $target) {
  Write-Error "$target exists and is not a git checkout. Move it aside, then run this again."; exit 1
} else {
  New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
  git clone --quiet $Repo $target; Check 'git clone'
}

Write-Host '2/4 Playwright and Chromium'
Push-Location $target
try { npm install --no-audit --no-fund; Check 'npm install' } finally { Pop-Location }

Write-Host '3/4 claude-design MCP'
$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) {
  Write-Warning 'The claude CLI is not on PATH. Register the MCP yourself: claude mcp add --transport http -s user claude-design https://api.anthropic.com/v1/design/mcp'
} else {
  claude mcp get claude-design *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host '    already registered'
  } else {
    claude mcp add --transport http -s user claude-design https://api.anthropic.com/v1/design/mcp
    Write-Host '    registered - restart Claude Code, then authenticate it with /mcp if asked'
  }
}

Write-Host '4/4 project'
if ($Project) {
  Push-Location $Project
  try {
    node (Join-Path $target 'scripts\dc.mjs') init
    node (Join-Path $target 'scripts\dc.mjs') map
  } catch {
    Write-Host '    no design mirrored yet - the first sync builds the map'
  } finally { Pop-Location }
} else {
  Write-Host '    none given. In a project, ask Claude Code: "set up design-changes"'
}
Write-Host "Installed at $target"
