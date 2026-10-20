#!/usr/bin/env bash
# Air cloud startup for skill-atlas: a Node (>=24) TypeScript CLI, no server to run.
set -euo pipefail

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi

cd "$(dirname "$0")/../.."

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# Node >= 24 (package.json engines). Install it in userspace via nvm only when missing.
if [ "$(node_major)" -lt 24 ]; then
  echo "[startup] Node >= 24 not found (have: $(node -v 2>/dev/null || echo none)); installing via nvm"
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm alias default 24
  # Make nvm's node visible to the agent's login and interactive shells.
  ENV_FILE="$HOME/.air-env.sh"
  printf 'export NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' > "$ENV_FILE"
  MARKER="# air-env (skill-atlas)"
  PROFILE_FILE=
  for f in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
    if [ -f "$f" ]; then PROFILE_FILE="$f"; break; fi
  done
  [ -n "$PROFILE_FILE" ] || { PROFILE_FILE="$HOME/.profile"; touch "$PROFILE_FILE"; }
  for f in "$PROFILE_FILE" "$HOME/.bashrc"; do
    grep -qF "$MARKER" "$f" 2>/dev/null || printf '\n%s\n[ -f "%s" ] && . "%s"\n' "$MARKER" "$ENV_FILE" "$ENV_FILE" >> "$f"
  done
fi
echo "[startup] node $(node -v), npm $(npm -v)"

echo "[startup] npm ci"
npm ci --no-audit --no-fund
echo "[startup] npm ci done"

# The CI checks: typecheck, tests, and the CLI on the fixture repository.
healthcheck() {
  echo "[healthcheck] typecheck"
  npm run typecheck
  echo "[healthcheck] tests"
  npm test
  echo "[healthcheck] CLI smoke"
  ./skill-atlas help >/dev/null
  ./skill-atlas scan ./fixture
  echo "[healthcheck] OK"
}

if [ -n "${WARMUP:-}" ]; then healthcheck; fi
