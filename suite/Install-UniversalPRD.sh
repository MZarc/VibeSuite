#!/usr/bin/env bash
# ============================================================================
#  Universal PRD - one-click project setup (macOS / Linux)
# ----------------------------------------------------------------------------
#  HOW TO USE:
#    1. Copy THIS file into your project folder (any empty or existing project).
#    2. Run:  bash Install-UniversalPRD.sh
#       (or: chmod +x Install-UniversalPRD.sh && ./Install-UniversalPRD.sh)
#  No repository checkout needed: on first run it fetches VibeSuite from GitHub
#  into a shared local cache (or uses the first location below that exists).
#  It will: check Node.js, build Universal PRD if needed, create .prd/spec.json,
#  register the MCP server for OpenCode AND Antigravity, and copy the Agent
#  Skill into your project. Nothing outside your project folder is modified
#  (except building Universal PRD itself on first run).
#
#  Finding Universal PRD (first match wins):
#    a) first argument:  bash Install-UniversalPRD.sh /path/to/prd
#    b) env var:         UNIVERSAL_PRD_HOME=/path/to/prd bash Install-UniversalPRD.sh
#    c) first line of universal-prd-home.txt next to this file
# ============================================================================
set -euo pipefail

TARGET="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(basename "$TARGET")"
VIBESUITE_REPO="https://github.com/MZarc/VibeSuite.git"
VIBESUITE_REF="main" # pin to a release tag once the project tags releases
VIBESUITE_CACHE="${HOME}/.vibesuite"

EXPLICIT=""
PRD_HOME="${1:-${UNIVERSAL_PRD_HOME:-}}"
[ -n "$PRD_HOME" ] && EXPLICIT=1
if [ -z "$PRD_HOME" ] && [ -f "$TARGET/universal-prd-home.txt" ]; then
  PRD_HOME="$(head -n 1 "$TARGET/universal-prd-home.txt")"
  [ -n "$PRD_HOME" ] && EXPLICIT=1
fi
[ -z "$PRD_HOME" ] && [ -f "$TARGET/.agents/skills/universal-prd/SKILL.md" ] && PRD_HOME="$TARGET"
[ -z "$PRD_HOME" ] && [ -f "$VIBESUITE_CACHE/suite/install.mjs" ] && PRD_HOME="$VIBESUITE_CACHE"
WANT_CLONE=""
if [ -z "$PRD_HOME" ]; then
  PRD_HOME="$VIBESUITE_CACHE"
  WANT_CLONE=1
fi

echo ""
echo " Target project : $TARGET"
echo " Universal PRD  : $PRD_HOME"
echo ""

# 1. Node.js + git
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js 20+ not found. Install it from https://nodejs.org/ , then re-run."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "[ERROR] git not found. Install it, then re-run."
  exit 1
fi
if [ -n "$EXPLICIT" ] && [ ! -f "$PRD_HOME/package.json" ]; then
  echo "[ERROR] Not a VibeSuite checkout: $PRD_HOME (explicit paths fail loudly by design)."
  exit 1
fi
if [ -n "$WANT_CLONE" ]; then
  echo "[...] first run: fetching VibeSuite $VIBESUITE_REF from GitHub into $VIBESUITE_CACHE"
  git clone --depth 1 --branch "$VIBESUITE_REF" "$VIBESUITE_REPO" "$VIBESUITE_CACHE" || {
    echo "[ERROR] git clone failed. Check your internet connection and try again."
    exit 1
  }
fi

# 2. Build once
if [ ! -f "$PRD_HOME/dist/cli/cli.js" ]; then
  echo "[1/4] First run: installing dependencies and building Universal PRD..."
  ( cd "$PRD_HOME" && npm install && npm run build )
else
  echo "[1/4] Universal PRD already built, skipping build."
fi
CLI="$PRD_HOME/dist/cli/cli.js"

# 3. Init + register (inside target)
echo "[2/4] Initializing PRD workspace..."
( cd "$TARGET" && node "$CLI" init --name "$PROJ" )
echo "[3/4] Registering OpenCode + Antigravity (workspace scope, with backup)..."
( cd "$TARGET" && node "$CLI" install --target both --scope workspace --apply )

# 4. Skills (+ /uprd shortcut)
echo "[4/4] Installing Agent Skill..."
if [ ! -f "$PRD_HOME/.agents/skills/universal-prd/SKILL.md" ]; then
  echo "[ERROR] Skill not found in $PRD_HOME/.agents/skills/universal-prd"
  exit 1
fi
mkdir -p "$TARGET/.agents/skills/universal-prd"
cp -r "$PRD_HOME/.agents/skills/universal-prd/." "$TARGET/.agents/skills/universal-prd/"
if [ ! -f "$PRD_HOME/templates/skills/uprd/SKILL.md" ]; then
  echo "[ERROR] uprd template not found in $PRD_HOME/templates"
  exit 1
fi
mkdir -p "$TARGET/.agents/skills/uprd" "$TARGET/.opencode/commands"
cp -r "$PRD_HOME/templates/skills/uprd/." "$TARGET/.agents/skills/uprd/"
cp "$PRD_HOME/templates/opencode/commands/uprd.md" "$TARGET/.opencode/commands/uprd.md"

cat <<EOF

======================================================================
 DONE. Your project is ready for AI-assisted requirements work.

 Created in $TARGET :
   .prd/spec.json                  (canonical requirements file)
   opencode.json                   (OpenCode MCP registration)
   .agents/mcp_config.json         (Antigravity MCP registration)
   .agents/skills/universal-prd/   (Agent Skill)
   .agents/skills/uprd/            (/uprd trigger skill, both hosts)
   .opencode/commands/uprd.md      (/uprd native command, OpenCode)

  NEXT STEPS:
    1. OpenCode: reload MCP servers. Antigravity: Settings -> Installed
       MCP Servers -> refresh, or open the /mcp panel and reload.
    2. Tell your AI agent:
       "Use Universal PRD to define this application properly
        before implementing it."
       Shortcut: type /uprd followed by your brief.
======================================================================
EOF
