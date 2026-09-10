@echo off
rem ════════════════════════════════════════════════════════════════
rem  ONE SCRIPT, EVERYTHING (Windows):
rem   1. docker compose up -> IndexTTS sidecar (detached)
rem   2. API + webserver start immediately, in parallel
rem
rem  UI  -> http://localhost:5173     API -> http://localhost:3000
rem  First sidecar boot downloads ~2-4 GB of model weights; watch it:
rem  docker compose logs -f indextts
rem
rem  Stop: Ctrl+C the dev servers, then "docker compose stop indextts"
rem  (weights stay cached in the docker volume).
rem ════════════════════════════════════════════════════════════════

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm not found. Pick ONE:
  echo   1^) Zero-Node option:  docker compose up    ^(UI on http://localhost:8080^)
  echo   2^) Install pnpm:      npm install -g pnpm   ^(or: corepack enable^)
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop, or use: pnpm dev
  exit /b 1
)

echo ^> docker compose up - IndexTTS sidecar ^(detached^)…
docker compose up -d indextts
if errorlevel 1 exit /b 1

if not exist node_modules (
  echo ^> installing workspace dependencies ^(first run only^)…
  pnpm install
)

echo ^> starting API + webserver in parallel…
echo   UI  - http://localhost:5173
echo   API - http://localhost:3000
echo   speech engine boot: docker compose logs -f indextts
echo.

set TTS_PROVIDER=indextts
set INDEX_TTS_API_URL=http://127.0.0.1:7861

pnpm dev
