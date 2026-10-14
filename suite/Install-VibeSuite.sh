#!/usr/bin/env bash
# Universal Vibe Suite - one-click setup (macOS / Linux)
# Copy into your project folder and run:  bash Install-VibeSuite.sh [--offline]
# No repository checkout needed: on first run it fetches VibeSuite from GitHub
# into a shared local cache (or uses UNIVERSAL_PRD_HOME / universal-prd-home.txt).
set -euo pipefail
TARGET="$(cd "$(dirname "$0")" && pwd)"
VIBESUITE_REPO="https://github.com/MZarc/VibeSuite.git"
VIBESUITE_REF="main" # pin to a release tag once the project tags releases
VIBESUITE_CACHE="${HOME}/.vibesuite"
EXPLICIT=""
PRD_HOME="${UNIVERSAL_PRD_HOME:-}"
[ -n "$PRD_HOME" ] && EXPLICIT=1
if [ -z "$PRD_HOME" ] && [ -f "$TARGET/universal-prd-home.txt" ]; then
  PRD_HOME="$(head -n 1 "$TARGET/universal-prd-home.txt")"
  [ -n "$PRD_HOME" ] && EXPLICIT=1
fi
if [ -z "$PRD_HOME" ] && [ -f "$VIBESUITE_CACHE/suite/install.mjs" ]; then
  PRD_HOME="$VIBESUITE_CACHE"
fi
if [ -z "$PRD_HOME" ]; then
  PRD_HOME="$VIBESUITE_CACHE"
  WANT_CLONE=1
else
  WANT_CLONE=""
fi
command -v node >/dev/null || { echo "[ERROR] Node.js 20+ required."; exit 1; }
command -v git >/dev/null || { echo "[ERROR] git required."; exit 1; }
if [ ! -f "$PRD_HOME/suite/install.mjs" ]; then
  if [ -n "$EXPLICIT" ]; then
    echo "[ERROR] Suite installer not found in $PRD_HOME (explicit paths fail loudly by design)."
    exit 1
  fi
fi
if [ -n "${WANT_CLONE:-}" ]; then
  echo "[...] first run: fetching VibeSuite $VIBESUITE_REF from GitHub into $VIBESUITE_CACHE"
  git clone --depth 1 --branch "$VIBESUITE_REF" "$VIBESUITE_REPO" "$VIBESUITE_CACHE" || {
    echo "[ERROR] git clone failed. Check your internet connection and try again."
    exit 1
  }
  [ -f "$PRD_HOME/suite/install.mjs" ] || { echo "[ERROR] clone succeeded but suite/install.mjs is missing."; exit 1; }
fi
node "$PRD_HOME/suite/install.mjs" --target "$TARGET" "$@"
