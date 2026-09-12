# Phase 06 — Express Backend Foundation

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 5 · **Unlocks:** Phase 7 (hardening) and 8+ (providers)

## What this phase is

The Express app becomes a real, layered API skeleton with the three spec-mandated endpoints in
place (TTS still stubbed behind a placeholder, real engine in Phase 9):

- `GET /api/health` — liveness (FR-011).
- `GET /api/health/ready` — basic readiness (tts catalog state; db/ai checks land in Phases 15/21).
- `GET /api/voices` — **real** catalog (Phase 5's contract), served from a new
  `voices.service` that talks to a *placeholder provider* for now (Phase 8 replaces it).
- `POST /api/tts` — routed and validated shape, returning a **501-style stub is not allowed**:
  it returns `503 TTS_UNAVAILABLE` with a clear "TTS engine not integrated yet" message until
  Phase 9 — the contract (shape, codes, envelope) is live from day one, only the provider is
  provisional. This matters: Phase 10's frontend can develop against a *live contract*.

Full layering design: [architecture/backend.md §1](../../architecture/backend.md#1-app-skeleton).

## Why we build it this way

- **Layered (routes → controllers → services → providers) because it is the test/replace axis.**
  Routes know URLs and status codes; controllers know the request/response shape; services know
  the business (voice lookup, store writes, error mapping); providers/repos know I/O. Every
  Phase 7–9 addition lands in exactly one layer, and tests target services without HTTP.
- **`app.ts` vs `server.ts` split:** `createApp()` is a pure factory (no `listen`); `server.ts`
  boots config, wires providers, and listens. Supertest imports `createApp()` with test
  dependencies (mock provider) — no ports, no env files, no flakiness. This one split is what
  makes Phase 19's API suite fast and deterministic.
- **Express 5, ESM, TypeScript:** v5 forwards rejected promises from async handlers straight to
  the error middleware — no `asyncHandler` ceremony (a real Express-4 tax we're not paying).
  ESM everywhere (packages too) so import specifiers are explicit (`.js` extensions) — no CJS/
  ESM surprise in builds.
- **Composition root in `server.ts`:** the only file that names concrete providers
  (`createTTSProvider(config)`) and stores (in-memory `AudioStore`). Everything downstream
  receives interfaces — the seam that Phase 8 formalizes and tests exploit.

## How it works (internals)

```text
server.ts
  config = loadApiEnv()            # @tts/config: fail-fast on missing required vars
  app = createApp({ config, providers: { tts, ai }, stores: { audio } })
  http = app.listen(config.port); graceful shutdown on SIGTERM/SIGINT (10 s drain)

app.ts (createApp)
  helmet → requestId → pino-http → cors(allow-list) → express.json(100 KB, strict)
  → rate-limit (general)
  → mount /api routes (health, voices, tts, …)
  → 404 → central error handler

routes/voices.ts  → GET /voices → voicesController.list
controllers       → parse query (none) → voicesService.getCatalog()
services/voices   → catalog lifecycle (tts.md §4): provider.listVoices() → cache 24 h →
                    derive languages; stale-serve on refresh failure
services/tts      → (stub until Phase 9): validate → voice lookup → 503 TTS_UNAVAILABLE
middleware/error  → AppError → envelope + status; unknown → 500 INTERNAL (+requestId in logs)
```

Conventions fixed now (used by every later phase):

- **Envelope** on every response: `{ success, … }` / `{ success:false, error:{ code,message,details? } }`.
- **Request ids** on every response (`X-Request-Id`), present in every log line.
- **Status discipline:** 200 success, 201 created (tts, Phase 9), 4xx caller fault, 503 external
  fault, 500 ours (error registry, Phase 7 formalizes).
- **No `console.log`:** pino only, structured, redaction list active.

## Key concepts you should learn

- Express request lifecycle: middleware chain, `next()` flow, error middleware (4-arg) last.
- **Why layers:** the "fat controller" anti-pattern (routes doing I/O + logic + formatting) and
  how this layout kills it; where each kind of knowledge belongs.
- Factory vs singleton: `createApp(deps)` makes the app a function of its dependencies — the
  simplest possible dependency injection, and the reason tests are trivial.
- Health vs readiness: liveness ("process alive") vs readiness ("can I do my job") — two
  different questions, two endpoints (FR-011, backend.md §8).
- Graceful shutdown: stop accepting → drain in-flight → release resources (libSQL pool in
  Phase 15) → exit; why orchestrators (Docker/K8s) depend on it.
- Structured logging: JSON lines, request-scoped child loggers, redaction as policy not
  diligence (SR-11).

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Express 5 | Spec-aligned; native async error propagation; huge learning surface | Fastify (excellent, different ecosystem; fine alternative, not our path), NestJS (framework weight > project size) |
| ESM + `.js` import specifiers | Consistent with packages; modern Node default | CJS (legacy interop tax) |
| pino + pino-http | Fast, structured, request-log integration built in | winston (config-heavy), morgan (unstructured) |
| No ORM/DI framework | Scale doesn't justify; explicit wiring is readable | TypeDI (magic), Prisma (no DB until Phase 15 anyway) |
| Central config via `@tts/config` | One typed env object; fail-fast lists | `process.env` sprinkled (drift + typos) |

## What gets created

```text
apps/api/src/{server.ts,app.ts}
apps/api/src/routes/{health.ts,voices.ts,tts.ts}
apps/api/src/controllers/{voices.controller.ts,tts.controller.ts}
apps/api/src/services/{voices.service.ts,tts.service.ts (stub)}
apps/api/src/middleware/{error.ts,requestId.ts}
apps/api/src/utils/{log.ts,json.ts}
apps/api/src/config/  (delegates to @tts/config)
tests: health + voices + envelope shape (supertest) — seeded here, grown in Phase 19
```

## Verification checklist

- [ ] `curl :4000/api/health` → 200 with version + uptime; `/api/health/ready` reports tts state
- [ ] `GET /api/voices` returns the catalog shape from API.md §2.3 (placeholder provider data
      now; real edge-tts catalog in Phase 9) — response validates against `@tts/types` fixture
- [ ] `POST /api/tts` with valid body → 503 `TTS_UNAVAILABLE` (honest stub), correct envelope;
      with empty text → 400 `INVALID_TEXT` (validation already real — Phase 7 completes it)
- [ ] Unknown route → 404 envelope; malformed JSON → 400 `BAD_REQUEST` (no stack leak)
- [ ] Every response carries `X-Request-Id`; logs are JSON with matching ids
- [ ] `SIGTERM` → clean exit 0 with drain (observed on the dev process; Render redeploys are the prod analog)
- [ ] Layering grep: no `req`/`res` in services; no provider imports in controllers

## Common pitfalls

- **Logic in routes** ("just this once") → the layering rule exists so Phase 9 doesn't
  archaeologize; enforce with the grep check above.
- **Listening in `app.ts`** → tests can't import the app; keep `listen` in `server.ts` only.
- **Swallowing errors in controllers** (try/catch + generic 500) → throw `AppError`s; the
  central handler is the only place status codes are decided.
- **env everywhere** → one `config` object, passed down; `process.env` appears only in
  `@tts/config`.
- **Forgetting the 4-arg error middleware** (Express 5 still requires it to catch; async
  forwarding is free, but the *handler* must be registered last).

## How it connects to the rest of the system

- Phase 7 hardens exactly this skeleton (validation middleware, full error registry, limits).
- Phase 8 adds `providers/tts/factory.ts` and the real `TTSProvider` implementations *behind the
  seam `server.ts` already exposes* — no route/controller changes.
- Phase 9 flips the stub to the real edge-tts provider; Phase 10's frontend starts talking to
  this exact app.
- Phase 14 inserts `auth` middleware into the pipeline at the reserved position; Phase 21
  upgrades readiness to real checks — the endpoints already exist.

## What to remember

1. Layers = the replacement axis: each future phase touches one layer, rarely two.
2. `createApp(deps)` is the cheapest, most valuable DI you'll ever write.
3. The contract (envelope, codes, ids, status discipline) is live before the engine is — the
   stub's job is to be *honest*, not to pretend.
4. Health answers "alive?"; readiness answers "useful right now?" — never conflate them.
5. If a handler knows a status code, it probably knows too much.
