#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  ONE SCRIPT, EVERYTHING:
#    1. docker compose up  → IndexTTS sidecar (voice engine, detached)
#    2. API + webserver start immediately, in parallel (hot reload)
#
#    UI → http://localhost:5173        API → http://localhost:3000
#
#  Speech works as soon as the sidecar finishes preparing — first boot
#  downloads ~2-4 GB of model weights (watch: docker compose logs -f
#  indextts). The UI/API are usable immediately; syntheses answer
#  "unavailable" until then.
#
#  Ctrl+C stops the API + webserver AND the sidecar (weights stay
#  cached in the docker volume → next start is instant).
#
#  No Node/pnpm at all? → docker compose up   (whole stack in containers,
#  UI on :8080) — this script needs Node + pnpm for the hot-reload dev
#  servers.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

# ── Prerequisite 1: pnpm (checked BEFORE touching docker) ──────────
# Non-interactive scripts don't source .bashrc/.zshrc, so pnpm installed
# via nvm/volta/asdf is often invisible here — search the usual homes.
find_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then return 0; fi
  for dir in \
    "$HOME"/.nvm/versions/node/*/bin \
    "$HOME/.volta/bin" \
    "$HOME/.local/bin" \
    "$HOME/.asdf/shims" \
    "$HOME/.bun/bin" \
    /usr/local/bin; do
    if [ -x "$dir/pnpm" ]; then
      export PATH="$dir:$PATH"
      return 0
    fi
  done
  return 1
}

# Node ships corepack, which can provide pnpm without a global install.
ensure_pnpm() {
  if find_pnpm; then return 0; fi

  if command -v corepack >/dev/null 2>&1; then
    echo "▶ pnpm not on PATH — enabling via corepack (ships with Node)…"
    corepack enable >/dev/null 2>&1 || true
    if find_pnpm; then
      echo "  pnpm ready: $(command -v pnpm)"
      return 0
    fi
  fi

  cat >&2 <<'EOF'
✗ pnpm is not available (needed to run the dev servers).

  Pick ONE:
  ① Zero-Node option — run the whole stack in Docker instead:
       docker compose up            # UI on http://localhost:8080

  ② Install pnpm, then rerun ./start.sh:
       npm install -g pnpm          # (or: corepack enable)

  ③ If pnpm IS installed via nvm/volta/asdf, open it in a normal
     terminal first — or point PATH at it manually.
EOF
  exit 1
}

echo "▶ checking prerequisites…"
ensure_pnpm
echo "  node:  $(command -v node) ($(node --version))"
echo "  pnpm:  $(command -v pnpm) ($(pnpm --version))"

# ── Prerequisite 2: Docker (sidecar engine) ─────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is not running." >&2
  echo "  • Start Docker Desktop / Engine and retry, or" >&2
  echo "  • skip real speech for now:  pnpm dev   (mock voices, no Docker)" >&2
  exit 1
fi

# ── 1: sidecar up (detached — does NOT block the dev servers) ───────
echo "▶ docker compose up — IndexTTS sidecar (detached)…"
docker compose up -d indextts

# ── 1.5: first run only — install workspace dependencies ────────────
if [ ! -d node_modules ]; then
  echo "▶ installing workspace dependencies (first run only)…"
  pnpm install
fi

# ── 2: API + webserver at the same time, wired to the sidecar ───────
echo "▶ starting API + webserver in parallel…"
echo "  UI  → http://localhost:5173"
echo "  API → http://localhost:3000"
echo "  speech engine boot: docker compose logs -f indextts"
echo

export TTS_PROVIDER=indextts
export INDEX_TTS_API_URL="${INDEX_TTS_API_URL:-http://127.0.0.1:7861}"

STOPPED=0
cleanup() {
  [ "$STOPPED" = "1" ] && return
  STOPPED=1
  echo
  echo "▶ shutting down — stopping the sidecar (model weights stay cached)…"
  kill "${CHILD:-}" 2>/dev/null || true
  sleep 1
  # Sweep anything still holding the dev ports (a bare `kill <pid>` can
  # orphan turbo's grandchildren; terminal Ctrl+C already signals them all).
  for port in 3000 5173; do
    if command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -ti ":$port" 2>/dev/null || true)
    elif command -v ss >/dev/null 2>&1; then
      pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
    else
      pids=""
    fi
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  docker compose stop indextts >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

pnpm dev &
CHILD=$!
wait "$CHILD"
