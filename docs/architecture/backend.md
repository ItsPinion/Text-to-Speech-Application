# Backend Architecture (Express)

Covers the API contract in [api/API.md](../api/API.md), FR-010…FR-011, FR-029…FR-032,
SR-02…SR-11, TR-*, AR-* (server side).

## 1. App skeleton

```text
apps/api/src/
├── server.ts                 # boot: config load, provider wiring, listen, graceful shutdown
├── app.ts                    # express app factory (no listen) — exported for tests
├── routes/
│   ├── health.ts             # GET /api/health, /api/health/ready
│   ├── voices.ts             # GET /api/voices
│   ├── tts.ts                # POST /api/tts, GET /api/audio/:id
│   ├── ai.ts                 # POST /api/ai/enhance          (phase 12)
│   ├── users.ts              # GET /api/users/me             (phase 14)
│   ├── history.ts            # GET /api/history, GET/DELETE /api/history/:id (phase 15)
│   ├── favorites.ts          # (phase 16)
│   ├── preferences.ts        # (phase 16)
│   └── upload.ts             # POST /api/upload              (phase 17)
├── controllers/              # thin: parse/validate → service → response; no business logic
├── services/
│   ├── tts.service.ts        # orchestration: voice lookup → provider → store (tts.md)
│   ├── voices.service.ts     # catalog lifecycle + caching (tts.md §4)
│   ├── ai.service.ts         # op dispatch → provider → output validation (ai.md)
│   ├── history.service.ts    # (phase 15)
│   ├── favorites.service.ts  # (phase 16)
│   ├── preferences.service.ts
│   └── upload.service.ts     # (phase 17)
├── providers/
│   ├── tts/                  # factory.ts, edgeTts.ts, mock.ts   (tts.md §3)
│   └── ai/                   # factory.ts, openaiCompatible.ts, none.ts (ai.md)
├── repositories/             # Drizzle queries, one per table (phase 15)
│   ├── user.repo.ts
│   ├── generation.repo.ts
│   ├── favorite.repo.ts
│   └── preference.repo.ts
├── middleware/
│   ├── error.ts              # central error handler + 404 + async-safe (Express 5)
│   ├── validate.ts           # zod parse → 400 with field details
│   ├── auth.ts               # Clerk JWT verification → req.user (phase 14)
│   ├── rateLimit.ts          # layered limiters (SR-04)
│   └── requestId.ts          # X-Request-Id assign/echo
├── config/                   # env → typed config (delegates to @tts/config)
├── utils/                    # logging (pino), json.ts, id.ts, redact.ts
└── types/                    # express request augmentation (req.user)
```

**Layering rule (enforced by code review, not tooling):**

```text
routes (URLs, status) → controllers (shape) → services (logic) → providers/repos (IO)
```

- Controllers never touch providers/repos directly; services never build HTTP responses
  (they throw typed errors or return domain results).
- `app.ts` has no `listen`; `server.ts` does. Tests import `app.ts` and bind ephemeral ports.
- Express **5** is used: async middleware errors propagate natively to the error handler — no
  `asyncHandler` wrappers needed (a real simplification vs Express 4; noted for the learning doc).

## 2. Middleware pipeline (order matters)

```text
helmet            → security headers (SR-05)
requestId         → X-Request-Id: reuse inbound or generate uuid; into pino child logger
pino-http         → structured request log (method, path, status, duration, requestId;
                    body redacted: text truncated to 200 chars preview, keys never logged) (SR-11)
cors              → origin allow-list from CORS_ORIGIN (SR-05); dev is same-origin via proxy
express.json      → limit 100 KB (SR-03); strict mode (only objects/arrays)
express-rate-limit→ general 60/min/IP on /api/* (SR-04)
routes…
  /api/tts   → rate-limit 10/min/IP (15 with valid user) → validate → controller
  /api/ai/*  → rate-limit 20/hour/IP (per-user key when authed)
  protected  → auth (Clerk verify) → user-scoped service calls
404 handler → AppError(NOT_FOUND)
error handler → map AppError → { success:false, error:{ code,message[,details] } } + status
                non-AppError → log.error with requestId → 500 { code:"INTERNAL" } (SR-safe)
```

## 3. Validation

- Shared zod schemas from `@tts/validation` (single source with the client):
  - `ttsRequestSchema`: `{ text: string 1..5000 (after trim), voice: string (catalog member) }`
  - `aiEnhanceRequestSchema`: `{ text: 1..5000, operation: enum(5 ops) }`
  - `preferencesSchema`, `upload limits`, pagination params (`limit 1..50`, `cursor` opaque)
- `validate(schema, "body"|"query"|"params")` middleware: parse → on failure throw
  `AppError(BAD_REQUEST | INVALID_TEXT | TEXT_TOO_LONG | INVALID_OPERATION …)` with `details`
  (field-level) included only for 4xx (safe to show).
- Catalog membership (`voice` must exist) is checked **in the service** (the schema cannot know
  the runtime catalog); mismatch → `INVALID_VOICE`.
- Content-type is enforced by `express.json` (non-JSON → 415 handled as `BAD_REQUEST` with a
  clear message — the spec's content-type requirement).

## 4. Typed errors & status mapping (Phase 7 core)

```ts
class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string,
              readonly status: number, readonly details?: unknown)
}
```

Error codes and their statuses are a **single registry** in `@tts/validation` (shared with the
web client's message map — the two can never drift):

| code | status | | code | status |
| --- | --- | --- | --- | --- |
| BAD_REQUEST | 400 | | RATE_LIMITED | 429 (+ `Retry-After`) |
| INVALID_TEXT | 400 | | PAYLOAD_TOO_LARGE / FILE_TOO_LARGE | 413 |
| TEXT_TOO_LONG | 400 | | TTS_UNAVAILABLE | 503 |
| INVALID_VOICE | 400 | | AI_NOT_CONFIGURED | 503 |
| INVALID_LANGUAGE | 400 | | AI_UNAVAILABLE | 503 |
| INVALID_OPERATION | 400 | | INTERNAL | 500 |
| UNAUTHORIZED | 401 | | AUDIO_EXPIRED | 404 |
| FORBIDDEN | 403 | | NOT_FOUND | 404 |
| FILE_INVALID | 400 | | | |

Rules: 4xx messages are user-safe by construction (from the registry); 500/503 log full context
under `requestId` and return the registry message only. The shape is always
`{ success: false, error: { code, message, details? } }` — and success is always
`{ success: true, …payload }`, so the client has one decode path.

## 5. TTS & AI services

See [tts.md](tts.md) and [ai.md](ai.md) for the domain design. Backend-specific notes:

- Services are constructed with their dependencies (provider, store, config) in `server.ts`
  (composition root) and passed via a small context object on `app.locals` — explicit wiring,
  no DI framework at this scale, no globals.
- Timeouts: TTS 30 s, AI 60 s via `AbortSignal.timeout` passed into provider calls.
- `POST /api/tts` returns **201** (a resource — the audio — was created) with
  `{ audioId, audioUrl, voice, language, format, chars }`; the audio itself is fetched from
  `audioUrl` (spec's `audioUrl` contract, §8 of the original spec).

## 6. Authentication (Phase 14, Clerk)

- **Web:** `@clerk/nextjs` — `ClerkProvider`, `clerkMiddleware` protects `/history`, `/favorites`;
  `SignedIn/SignedOut` for UI.
- **API:** `auth` middleware verifies the Clerk JWT:
  - header `Authorization: Bearer <token>` (primary, works cross-origin), **or**
  - Clerk cookie for same-site requests (dev).
  - Verification is done against Clerk's **JWKS** (signature + `iss` + `exp` + `aud`) using
    `CLERK_SECRET_KEY`. We do not parse claims as identity on their honor — verification is
    cryptographic (SR-06).
  - Result: `req.user = { id: <clerkUserId>, firstName?, … }`.
- Endpoint policy: public (rate-limited by IP): health, voices, tts, audio, ai, upload.
  Protected: users/me, history, favorites, preferences. Foreign-resource access → 403 (every repo
  query is user-scoped — SR-07).
- No custom auth code exists anywhere (C3): no password endpoints, no refresh logic, no auth
  tables beyond the app profile row.

## 7. Data layer (Phases 15–16, Turso + Drizzle)

- Driver: `@libsql/client` (file: `file:./data/local.db` in dev; `libsql://…` + auth token in
  prod) + `@drizzle-orm/libsql`.
- Schema (Drizzle, libSQL dialect) — full DDL sketches in [phase-15](../phases/phase-15/learn_the_phase.md):

```text
users(id TEXT PK = clerk user id, display_name, created_at)
speech_generations(id TEXT PK uuid, user_id → users, text, language, voice, audio_reference TEXT,
                   char_count INT, created_at, INDEX(user_id, created_at DESC))
favorites(id TEXT PK, user_id, generation_id UNIQUE per user, created_at,
          audio_blob BLOB NULL, audio_content_type)
voice_preferences(user_id PK, language, voice, updated_at)
```

- Repositories are the **only** layer that knows SQL/Drizzle; services call repo methods
  (`listByUser(userId, { limit, cursor })`, `deleteByUserAndId`, …). Every method takes the user
  id explicitly — scoping is unmissable in review (SR-07).
- Migrations: `drizzle-kit generate` → SQL migrations run at boot (idempotent `migrate` step);
  in CI/tests run against a temp file DB.
- Audio in DB: `speech_generations.audio_reference` holds the temp-store id or `"persisted:<id>"`;
  favorites copy the MP3 bytes into `audio_blob` once (bounded: favorites are user-curated, so
  size growth is deliberate and capped per user, e.g., 200 MB — enforced, `413`-style error).

## 8. Health & readiness (FR-011, Phase 21 complete)

```text
GET /api/health        → 200 { status:"ok", version, uptime }          (process alive)
GET /api/health/ready  → 200 { status:"ready"|"degraded", checks:{ tts, ai, db } }
                        tts: catalog loaded (or cached-stale = degraded)
                        ai:  configured (absent = "disabled", not a failure)
                        db:  ping OK (phase 15+)
                503 when a *required* dependency fails (tts without cache)
```

## 9. <a id="audio-store"></a>Audio store (interface)

```ts
interface AudioStore {
  put(bytes: Uint8Array, contentType: string): Promise<string>;  // → id
  get(id: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}
```

- v1 implementation: in-memory LRU+TTL (tts.md §5).
- Documented swap path for multi-instance prod: object storage, or Turso BLOB-on-generate.
  `AudioStore` is the only seam that changes (NFR-011).

## 10. Shutdown, logging, config

- Graceful shutdown: SIGTERM → stop accepting → drain (max 10 s) → close libSQL → exit 0
  (matters for container orchestration).
- Logging: pino, JSON in prod / pretty in dev; every line carries `requestId`; redaction list
  includes `authorization`, `api-key`, `token`, and text-body truncation (SR-11).
- Config: `@tts/config` parses env once; boot fails fast with a readable list of missing
  required vars (fail-fast beats 500s).

## 11. What to remember

1. Layers are one-way: routes → controllers → services → providers/repos.
2. One error registry, one response shape, one status map — client and server share it.
3. The browser is a user, never an authority: verify JWTs, re-validate everything, scope by user.
4. Providers are injected leaves behind interfaces; the composition root is the only place
   concrete providers are named.
5. Health vs readiness are different answers: "am I alive?" vs "can I do my job right now?"
