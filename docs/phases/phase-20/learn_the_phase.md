# Phase 20 — Production Deployment (Vercel + Render)

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 19 (verified base) · **Unlocks:** Phase 21 (hardening has a real target)

## What this phase is

The system goes live on PaaS (DE-01…DE-08, NFR-007/011, C6 — no Docker):

- **Vercel** hosts `apps/web` (DE-01): Next.js auto-detected, root dir `apps/web`, Bun install
  from `bun.lock`, production env (`NEXT_PUBLIC_API_URL`, `CLERK_PUBLISHABLE_KEY`).
- **Render** hosts `apps/api` (DE-02): single-instance free web service, `render.yaml` in the
  repo, Node 20, health check on `/api/health`.
- **Two-origins wiring** (DE-05): `CORS_ORIGIN` = the Vercel URL; the web client's Bearer
  path (Phase 14) becomes the *production* auth path.
- **Rollback runbook** (DE-07) and the **honest limits section** (DE-08) land in the docs.

Full design: [architecture/deployment.md](../../architecture/deployment.md) (this phase is its
execution + verification).

## Why we build it this way

- **PaaS is the right shape for this stack (C6 restated).** There is no local state to host
  (audio is an in-memory LRU, the DB is Turso), no GPU, no long-lived local services. Vercel
  gives the web app a purpose-built Next runtime + per-PR previews + TLS; Render gives the api
  a one-service, one-env-file deployment with a health check. The total ops surface is two
  dashboards.
- **`render.yaml` in the repo = the deployment is code.** The service definition (build
  command, start command, health check, plan) is diffable, reviewable, and restorable — the
  same "deployment as artifact" property Docker compose gave us, minus the image toolchain.
- **The two-origins model is a *consequence we wire deliberately*, not a bug.** Prod has no
  single-origin proxy, so the browser talks to two hosts: the CORS allow-list (exact Vercel
  origin) and the Bearer JWT are the security boundary (Phase 18's headers, Phase 14's
  verifier). Dev stays same-origin via the proxy, so the two models coexist by configuration —
  the client code is identical.
- **Honest limits are a deliverable (DE-08).** Render's free tier spins down when idle; the
  first prod request after quiet can take tens of seconds. That's fine for this project — but
  it must be *written down* (README + Phase 24's timing methodology) instead of discovered as
  a "bug" by the first user.

## How it works (internals)

### render.yaml (repo root — the service definition)

```yaml
services:
  - type: web
    name: tts-api
    runtime: node
    plan: free                  # single instance (NFR-011)
    rootDir: .                  # REPO ROOT — workspace-aware install is mandatory
    buildCommand: >
      curl -fsSL https://bun.sh/install | bash &&
      export PATH="$HOME/.bun/bin:$PATH" &&
      bun install --frozen-lockfile &&
      bun run build:api         # = turbo run build --filter=api (web is Vercel's job)
    startCommand: node apps/api/dist/server.js
    healthCheckPath: /api/health
    nodeVersion: 20
```

- `bun install` **must** run at the repo root (`workspace:*` links). `bun run build:api` (root
  script → Turbo filter) builds only the api's dependency graph.
- Start is plain Node — the recorded runtime split (Bun builds, Node ships).
- Render sets its own `PORT` for the service; `loadApiEnv` (Phase 1/6) must honor the
  platform's `PORT` variable — verify at implementation time (one-line check: Render logs the
  bound port and the health check passes).

### Vercel project settings

| Setting | Value |
| --- | --- |
| Framework | Next.js (auto) |
| Root directory | `apps/web` |
| Build command | default (`next build`) |
| Env (Production) | `NEXT_PUBLIC_API_URL=https://<api>.onrender.com/api`, `CLERK_PUBLISHABLE_KEY` |
| Env (Preview) | same API URL (or a staging Render service, if added) |

⚠️ **The inlined-env trap (the #1 first-deploy failure):** `NEXT_PUBLIC_*` is baked in at
build time. Set the production `NEXT_PUBLIC_API_URL` in Vercel *before* the first prod build —
otherwise the prod web bakes in `/api`, and there is no proxy on Vercel to catch it (the
`next.config` rewrites are dev-only by design). The checklist below exists to catch exactly
this.

### Env matrix (who holds what — DE-04)

| Variable | Vercel (web) | Render (api) |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | ✅ (build-time) | — |
| `CLERK_PUBLISHABLE_KEY` | ✅ | — |
| `NODE_ENV` | (platform sets) | `production` |
| `CORS_ORIGIN` | — | ✅ `https://<web>` |
| `TTS_PROVIDER`, `AI_*`, `CLERK_SECRET_KEY`, `TURSO_*`, `RATE_LIMIT_*` | — | ✅ |

### Deployment operations (the runbook, Phase 22 formalizes it in CI)

```text
first deploy:
  1. Vercel: import repo → root apps/web → set env → deploy main
  2. Render: New → Blueprint (render.yaml) → set env → deploy
  3. verify:
     - https://<web>/                          (page renders; API calls go to Render)
     - curl https://<api>/api/health           (200)
     - curl https://<api>/api/health/ready     (checks per their phase maturity)
     - curl -H "Origin: https://<web>" -i https://<api>/api/voices | grep -i access-control
       (allow-list header present, exact origin)
     - real TTS round-trip through the prod URLs (Phase 9 gate, re-run live)

rollback (DE-07):
  - Render: redeploy previous version → curl health
  - Vercel: redeploy previous deployment
  - trigger: Phase 22's post-deploy check failing (not user complaints)
```

## Key concepts you should learn

- **PaaS vs IaaS vs container:** what "the platform is the ops team" means concretely — you
  trade control (no image tuning, no LB config) for surface area (two dashboards instead of a
  server). For a 2-app, no-local-state system, that trade is a win (C6).
- **Platform build pipelines:** build commands as *data* (`render.yaml`), install-at-root
  monorepo builds, and why the build installs the toolchain (Bun) instead of assuming it.
- **Build-time vs runtime env:** `NEXT_PUBLIC_*` inlining (baked at build) vs server env
  (read at start) — the distinction that causes the #1 PaaS deploy bug, understood as a rule.
- **Two-origins security:** CORS allow-list as a boundary (exact origin, credentials policy),
  Bearer JWT as the cross-origin identity carrier, and why dev's same-origin proxy *hides*
  this path (which is why Phase 20 verifies it explicitly).
- **Platform limits as design inputs:** idle spin-down (cold starts), instance count
  (NFR-011), RAM — read them *before* deploy and write them into the docs, not after a
  complaint.
- **Deployment verification:** "deployed" ≠ "working" — the post-deploy check (health +
  readiness + CORS + one real round-trip) is the success condition; rollback keys off it.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Vercel for web | Next-native runtime, per-PR previews, auto-TLS, zero config | Netlify (equivalent), self-hosted Node server (re-introduces the ops surface C6 removed) |
| Render for api | Single Node service, env dashboard, health check, free single instance | Railway (equivalent), Fly.io (containers — closer to the C6 escape hatch, more surface) |
| `render.yaml` (blueprint) in repo | Deployment is diffable code; reproducible service | Dashboard-only config (lost knowledge, no review) |
| `bun run build:api` (Turbo filter) | Render builds only what it ships; web stays Vercel's | Full monorepo build on Render (wasteful), prebuilt artifacts (extra pipeline) |
| Keep the Docker escape hatch documented | If self-hosting is ever needed, the build is already portable | "Docker forever" (C6's premise: not needed now) |

## What gets created

```text
render.yaml
Vercel project (dashboard) + Render service (dashboard), env per the matrix
root README: "Running in production" section (runbook + cold-start note)
docs/architecture/deployment.md: as-built notes (actual URLs, cold-start timing)
Phase 22 inputs: post-deploy check endpoints for CI
```

## Verification checklist (M5 — production)

- [ ] `main` deploys to **both** platforms; page live on Vercel, health 200 on Render
- [ ] **Inlined-env trap check:** prod web's network tab shows API calls to the Render URL
      (not `/api` → 502)
- [ ] CORS: `Origin: https://<web>` → `Access-Control-Allow-Origin` = exactly that origin; a
      foreign origin → no header
- [ ] Auth path: protected endpoint with the web's Bearer token → 200 profile; without → 401
      (the Phase 14 matrix, re-run against prod)
- [ ] Real TTS round-trip through prod URLs: generate → MP3 bytes (Phase 9 gate, live)
- [ ] Readiness endpoint reflects real checks per phase maturity (tts/ai states honest)
- [ ] Egress from Render: edge-tts, AI endpoint (if key set), Turso, Clerk JWKS all reachable
      (readiness `db`/`idp` checks ok where applicable)
- [ ] Secrets audit: bundle grep (no `AI_API_KEY` in prod web), CI logs searched for key
      *values* (not names)
- [ ] Cold start measured and recorded (kill quiet for 20 min → first request timing →
      deployment.md as-built)
- [ ] Rollback drill: deploy a deliberately-bad api change (feature-flag off → 500 on
      `/api/tts`), watch post-deploy check fail, redeploy previous version, verify 200 —
      recorded with timestamps
- [ ] Render `PORT` honored: api bound to the platform port (logs), health check passing

## Common pitfalls

- **`NEXT_PUBLIC_API_URL` set after the build** → prod web calls `/api` into the void (502).
  The inlined-env trap: set the env, *then* build.
- **`CORS_ORIGIN` with a trailing slash / wrong scheme** → the allow-list silently rejects the
  web origin; check the *header*, not the config text.
- **`bun install` in `apps/api`** (rootDir mistake) → workspace links fail or resolve empty;
  the build command runs at the repo root, always.
- **Trusting "free tier forever"** → the limits (DE-08) are the design inputs; when they're
  hit, the decision is upgrade/move, not code heroics.
- **Forgetting the cold start in Phase 24 timings** → NFR-003 (time-to-audio) must be
  measured warm, and the cold number recorded separately — or the metrics lie.

## How it connects to the rest of the system

- Phase 21: health/readiness are now consumed by Render's health check and the post-deploy
  check; metrics point at the live service.
- Phase 22: CI's deploy story is "main is deployable" (green merge gate) + the post-deploy
  check + the rollback runbook.
- Phase 24: the final verification matrix runs against *these* URLs — the happy paths on
  Vercel+Render, the failure matrix on the local dev stack.

## What to remember

1. `render.yaml` is the deployment: diffable, reviewable, restorable — the compose file's job
   without the image toolchain.
2. Two origins are a *wired* decision: exact-origin CORS + Bearer JWT are the prod boundary;
   dev's same-origin proxy is why this path needs explicit testing.
3. `NEXT_PUBLIC_*` is build-time. Set env before building — or the prod page calls a proxy
   that doesn't exist.
4. "Deployed" ≠ "working": the post-deploy check (health + readiness + CORS + one real
   round-trip) is the success condition, and rollback keys off it.
5. Limits are design inputs: cold starts, one instance, RAM — written down *before* the first
   user hits them.
