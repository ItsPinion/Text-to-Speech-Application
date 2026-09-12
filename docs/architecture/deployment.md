# Deployment Architecture (Vercel + Render — no Docker)

Covers DE-01…DE-08, NFR-007, NFR-011, and constraint C6 (no Docker).

## 1. Why no Docker (the decision, honestly stated)

The stack has **no local services**: TTS is a remote endpoint (edge-tts), AI is a remote
free-tier endpoint, identity is Clerk (hosted), and the database is Turso (hosted). All there
is to run is two small Node/Next applications. Containerizing them buys reproducibility we
already get from `bun.lock` + Turbo, at the cost of a whole toolchain (images, compose, Caddy)
neither the project's goals nor its scale need.

Chosen 2026-09 (replacing the original C6 "Docker from Phase 2"):

- **Dev:** native `bun run dev` — one command, real hot reload, zero container concepts.
- **Prod:** **Vercel** (web) + **Render** (api), both free-tier, both deploy from the repo.

**What we gave up, stated plainly:** the self-host story (this code can no longer be pointed at
a bare VPS without re-adding a container or a node service), and the container-hardening
section (non-root, read-only fs, image audits). The escape hatch stays open: the build is
platform-agnostic (`bun install && bun run build` → `node apps/api/dist/server.js`), so
re-containerizing later is a weekend, not a rewrite.

## 2. Topology

```text
DEV (single origin)
  Browser → http://localhost:3000 (Next dev)
            └── /api/* proxied → http://localhost:4000 (Express, bun --watch)
  No CORS. libSQL file in data/. .env at the repo root.

PROD (two origins — DE-05)
  Browser → https://<web>       Vercel (Next.js platform runtime)
          → https://<api>/api   Render (Express on Node 20, single instance)
  CORS allow-list: exactly <web>. Auth: Clerk Bearer JWT on cross-origin calls (Phase 14).
  Egress from Render: edge-tts · AI endpoint · Turso (libsql://) · Clerk JWKS.
```

Dev keeps the same-origin DX (the Next dev proxy); prod is two origins by construction of the
two platforms. The client handles both because it targets `NEXT_PUBLIC_API_URL` and the API's
CORS middleware is a real allow-list — verified in Phases 10/14/20.

## 3. Vercel (web — DE-01)

- **Import:** GitHub repo, framework preset *Next.js*, **root directory `apps/web`**.
- **Bun:** Vercel detects `bun.lock` and installs with Bun automatically (no custom runtime).
- **Env settings (Vercel dashboard):**
  | Variable | Value |
  | --- | --- |
  | `NEXT_PUBLIC_API_URL` | `https://<api>.onrender.com/api` (production) |
  | `CLERK_PUBLISHABLE_KEY` | from Clerk (Phase 14) |
- **Build-time caveat (load-bearing):** `NEXT_PUBLIC_*` values are **inlined at build time**.
  Set the production value in Vercel's production env *before the first prod deploy* — a web
  built without it bakes in the dev default (`/api`) and prod 502s. This is the #1 first-deploy
  failure and it is documented here on purpose.
- **Preview deploys:** every PR gets a live Vercel preview (reviewers test real changes).
  Preview `NEXT_PUBLIC_API_URL` = the same Render service (or a staging service, if added).
- **TLS:** automatic, platform-provided (DE-03).

## 4. Render (api — DE-02)

`render.yaml` (repo root, Phase 20 deliverable):

```yaml
services:
  - type: web
    name: tts-api
    runtime: node
    plan: free                 # single instance (NFR-011), $0
    rootDir: .                 # repo root — the build must be workspace-aware
    buildCommand: >
      curl -fsSL https://bun.sh/install | bash &&
      export PATH="$HOME/.bun/bin:$PATH" &&
      bun install --frozen-lockfile &&
      bun run build:api        # turbo run build --filter=api
    startCommand: node apps/api/dist/server.js
    healthCheckPath: /api/health
    nodeVersion: 20
```

Notes:

- **Workspace-aware build is mandatory:** `bun install` must run at the *repo root* (the
  monorepo's `workspace:*` links resolve there). `rootDir: .` + `bun run build:api` (Turbo
  filter) builds only the api's graph — the web build is Vercel's job, not Render's.
- **Start = plain Node:** `node apps/api/dist/server.js` (the recorded runtime split: Bun
  builds, Node ships — Phase 1).
- **Env settings (Render dashboard):**
  | Variable | Value |
  | --- | --- |
  | `NODE_ENV` | `production` |
  | `CORS_ORIGIN` | `https://<web>` (exact, no trailing slash) |
  | `TTS_PROVIDER` | `edge-tts` |
  | `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | user's free-tier endpoint (optional) |
  | `CLERK_SECRET_KEY` | from Clerk (Phase 14) |
  | `TURSO_DB_URL` / `TURSO_AUTH_TOKEN` | hosted Turso (Phase 15) |
  | `API_PORT` | Render assigns; `0.0.0.0` binding is platform-handled (Express binds `PORT` via the code's config — verify at Phase 20 that `loadApiEnv` honors the platform's `PORT` var if Render sets one) |
- **Health check:** `/api/health` (DE-03) — Render restarts the service if it stops answering;
  this is the platform's graceful-restart path (Phase 6's SIGTERM handling cooperates).
- **Egress:** Render's free tier has full outbound internet — edge-tts, the AI endpoint,
  `libsql://` Turso, and Clerk's JWKS are all reachable (verified at Phase 20).

## 5. Secrets (DE-04, SR-01)

- Repo: only `.env.example` (placeholders). Local `.env` and `data/` are git-ignored.
- Prod: secrets exist **only** in the platform env dashboards (Render for api secrets, Vercel
  for the publishable web key). Nothing secret is a build argument, a repo file, or a CI secret
  (CI only pushes via the platforms' GitHub integrations).
- Audit: Phase 20's checklist includes a bundle grep (no `AI_API_KEY` in the web client) and a
  CI-log search for key *values*.

## 6. Rollback (DE-07)

- **Render:** redeploy the previous version (versions are retained per deploy; the runbook is a
  two-click + `curl` readiness check).
- **Vercel:** promote/redeploy the previous deployment from the deployments list.
- **Rule:** a deploy is only "done" after its post-deploy check (Phase 22) is green — rollback
  is triggered by that check, not by user complaints.

## 7. Platform limits, honestly (DE-08)

| Limit | Effect | Mitigation / acceptance |
| --- | --- | --- |
| Render free: **spins down after ~15 min idle** | First request after idle: cold start (tens of seconds) | Documented in the README's "Running in production"; an uptime ping (optional) or accept the wait. TTS time-to-audio (NFR-003) is measured *after* warm-up in Phase 24 — recorded honestly |
| Render free: 512 MB RAM, 0.1 CPU | Our app is tiny (a few MB at idle); synthesis is I/O-bound | Fine at v1 scale; the Phase 21 OOM test proves headroom |
| Vercel Hobby: request/bandwidth quotas | More than enough for a project-scale deployment | Fine; documented |
| Single api instance (both) | In-memory audio LRU cannot cross instances (NFR-011) | *Matches* the documented limit; `AudioStore` seam is the designed exit |
| `NEXT_PUBLIC_*` inlined at build | Stale build ⇒ wrong API URL | DE-01 caveat above + Phase 20 checklist |

## 8. Dev environment (the whole story)

No second topology: `bun run dev` (web :3000 + api :4000, dev proxy, libSQL file in `data/`,
root `.env`). Everything a contributor needs is in Phase 2's doc; everything prod needs is
above. The two share one repo, one lockfile, one build.
