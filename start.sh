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
#  No Docker? → pnpm dev   (same app, mock voices, zero setup)
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

# 0 ─ Docker must be up; otherwise point at the zero-setup alternative.
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is not running." >&2
  echo "  • Start Docker Desktop / Engine and retry, or" >&2
  echo "  • skip real speech for now:  pnpm dev   (mock voices, no Docker)" >&2
  exit 1
fi

# 1 ─ Sidecar up (detached — it does NOT block the dev servers).
echo "▶ docker compose up — IndexTTS sidecar (detached)…"
docker compose up -d indextts

# 1.5 — First run only: install workspace dependencies.
if [ ! -d node_modules ]; then
  echo "▶ installing workspace dependencies (first run only)…"
  pnpm install
fi

# 2 ─ API + webserver at the same time, wired to the sidecar.
echo "▶ starting API + webserver in parallel…"
echo "  UI  → http://localhost:5173"
echo "  API → http://localhost:3000"
echo "  speech engine boot: docker compose logs -f indextts"
echo

export TTS_PROVIDER=indextts
export INDEX_TTS_API_URL="${INDEX_TTS_API_URL:-http://127.0.0.1:7861}"

cleanup() {
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
