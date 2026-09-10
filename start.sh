#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  LOCAL (bun) dev loop:
#    1. docker compose up  → IndexTTS sidecar (voice engine, detached)
#    2. API + webserver start immediately, in parallel (hot reload)
#
#    UI → http://localhost:5173        API → http://localhost:3000
#
#  DON'T WANT TO INSTALL ANYTHING? → docker compose up
#  (the whole stack — with hot reload — runs inside Docker; this script
#  is for developing with bun on the host.)
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

# ── Prerequisite 1: bun ─────────────────────────────────────────────
find_bun() {
  if command -v bun >/dev/null 2>&1; then return 0; fi
  # Bun installs to ~/.bun/bin by default; scripts may not have it on PATH.
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
    return 0
  fi
  return 1
}

echo "▶ checking prerequisites…"
if ! find_bun; then
  cat >&2 <<'EOF'
✗ bun is not installed (this script develops on the host with bun).

  Pick ONE:
  ① Zero-install option — run the whole stack in Docker (hot reload too):
       docker compose up            # UI on http://localhost:5173

  ② Install bun (single binary, no Node needed), then rerun ./start.sh:
       curl -fsSL https://bun.sh/install | bash
EOF
  exit 1
fi
echo "  bun:   $(command -v bun) ($(bun --version))"

# ── Prerequisite 2: Docker (sidecar engine) ─────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is not running." >&2
  echo "  • Start Docker Desktop / Engine and retry, or" >&2
  echo "  • mock voices without Docker:  bun run dev" >&2
  exit 1
fi

# ── 1: sidecar up (detached — does NOT block the dev servers) ───────
echo "▶ docker compose up — IndexTTS sidecar (detached)…"
docker compose up -d indextts

# ── 1.5: first run only — install workspace dependencies ────────────
if [ ! -d node_modules ]; then
  echo "▶ installing workspace dependencies (first run only)…"
  bun install
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

bun run dev &
CHILD=$!
wait "$CHILD"
