@echo off
rem ════════════════════════════════════════════════════════════════
rem  LOCAL (bun) dev loop (Windows):
rem   1. docker compose up -> IndexTTS sidecar (detached)
rem   2. API + webserver start immediately, in parallel
rem
rem  UI  -> http://localhost:5173     API -> http://localhost:3000
rem
rem  Zero-install alternative: docker compose up  (whole stack in Docker)
rem ════════════════════════════════════════════════════════════════

where bun >nul 2>&1
if errorlevel 1 (
  echo bun not found. Pick ONE:
  echo   1^) Zero-install:  docker compose up     ^(whole stack, hot reload^)
  echo   2^) Install bun:   powershell -c "irm bun.sh/install.ps1 | iex"
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop, or use: bun run dev
  exit /b 1
)

echo ^> docker compose up - IndexTTS sidecar ^(detached^)…
docker compose up -d indextts
if errorlevel 1 exit /b 1

if not exist node_modules (
  echo ^> installing workspace dependencies ^(first run only^)…
  bun install
)

echo ^> starting API + webserver in parallel…
echo   UI  - http://localhost:5173
echo   API - http://localhost:3000
echo.

set TTS_PROVIDER=indextts
set INDEX_TTS_API_URL=http://127.0.0.1:7861

bun run dev
