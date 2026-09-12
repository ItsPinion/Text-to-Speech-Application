# System Architecture

How the pieces fit together. Read this before [requirements.md](../requirements.md) if you prefer
top-down; it cross-references the requirement IDs throughout.

## 1. Context

A browser app that turns text into speech. Three external, **free** dependencies:

- **TTS:** edge-tts (unofficial, keyless access to Microsoft's Edge online voices) — egress from the API (Render).
- **AI:** an OpenAI-compatible **free-tier** endpoint (user-supplied key, e.g., OpenRouter `:free`
  models or Groq's free tier) — egress from the API (Render). Optional at runtime.
- **Identity + data:** Clerk (hosted IdP, verified via JWKS) and Turso (hosted libSQL) — both egress.

Everything else is two applications in one monorepo: **web** (Next.js) and **api** (Express),
plus shared TypeScript packages.

## 2. Runtime architecture

```text
                                 ┌──────────────────┐
                                 │      Browser     │
                                 └────────┬─────────┘
                                          │ HTTPS
                          ┌───────────────┴────────────────┐
                          │  dev: single origin — Next dev │  same-origin, no CORS
                          │  proxy /api/* → :4000          │
                          │  prod: two origins — Vercel    │  CORS allow-list + Bearer
                          │  (web) & Render (api), TLS     │  (DE-05)
                          └───────────────┬────────────────┘
                                          │
              ┌───────────────────────────┴────────────────────────────┐
              │                        Next.js web (:3000)             │
              │   App Router · UI state · audio element · Clerk client │
              │   NEVER holds secrets · NEVER calls TTS/AI directly    │
              └───────────────────────────┬────────────────────────────┘
                                          │ REST (JSON / MP3 bytes)
                                          │ Authorization: Bearer <Clerk JWT> (protected routes)
              ┌───────────────────────────┴────────────────────────────┐
              │                     Express api (:4000)                │
              │                                                        │
              │  middleware: helmet · cors · rate-limit · body-limit   │
              │              request-id · pino logging · clerk verify  │
              │                                                        │
              │  routes → controllers → services → providers/repos     │
              │  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
              │  │ TTS service│  │ AI service │  │ data service     │  │
              │  │ +audio LRU │  │ (caps, val)│  │ (Drizzle + libSQL)│ │
              │  └─────┬──────┘  └─────┬──────┘  └────────┬─────────┘  │
              └────────┼───────────────┼──────────────────┼────────────┘
                       │               │                  │
                       ▼               ▼                  ▼
                ┌────────────┐  ┌─────────────┐   ┌──────────────┐
                │  edge-tts  │  │ free AI API │   │    Turso     │
                │ (egress,   │  │ (egress,    │   │ (hosted      │
                │  no key)   │  │  free tier, │   │  libSQL)     │
                └────────────┘  │  user key)  │   └──────────────┘
                                └─────────────┘        ▲
                                                       │ identity (JWKS verify)
                                                ┌──────┴───────┐
                                                │     Clerk    │
                                                │  (hosted IdP) │
                                                └──────────────┘
```

**Boundary rules (the whole security & coupling story in one paragraph):**

1. The **browser** talks only to the API's public surface; it holds no secrets and no provider
   credentials — Clerk's *publishable* key is the one intentionally-public exception.
2. **Express** is the only component that knows the AI key, Clerk secret key, and Turso token;
   it validates everything; it owns provider calls, timeouts, and error mapping.
3. **Providers** (TTS, AI) are reached only through interfaces (`TTSProvider`, `AIProvider`)
   created in `packages/*` and injected into services — swapping engines/model providers is an
   env change plus a registered implementation, never a rewrite.
4. **Turso** stores only application data (C4): app profile keyed by Clerk user id, history,
   favorites, preferences. Identity itself never leaves Clerk.

## 3. Monorepo structure & dependency rules

```text
text-to-speech/
├── apps/
│   ├── web/                  # Next.js (consumer only — no shared logic lives here)
│   └── api/                  # Express (composition root for providers)
├── packages/
│   ├── types/                # Voice, SpeechRequest, ApiError, HistoryItem, … (pure types)
│   ├── validation/           # zod schemas + MAX_TEXT_CHARS etc. (shared by client & server)
│   ├── config/               # env parsing/defaults shared by both apps
│   └── ai/                   # prompts, AIProvider interface, operations, schemas (phase 12–13)
├── docs/                     # this documentation
├── render.yaml               # Render service manifest (api) — added in Phase 20
├── turbo.json                # task graph: build/lint/typecheck/test/dev
├── package.json              # root: workspaces + turbo-delegating scripts (Bun)
├── bun.lock                  # committed lockfile
├── tsconfig.base.json
├── .env.example
└── README.md
```

Dependency rule: `apps/*` may depend on `packages/*`; **packages never depend on apps**, and
`packages/*` are side-effect-free (no network, no process) except `packages/ai`'s *provider
implementations*, which are imported only by `apps/api`. Shared zod schemas in
`packages/validation` are the single definition of request shapes — the client pre-validates with
the same schema the server enforces (FR-009, SR-02).

Enforcement note: Bun's `node_modules` is hoisted (npm-like), so the package manager will *not*
block a dependency-rule violation for us. The rule is enforced by an import-boundary lint rule +
the Phase 19 boundary tests — see [Phase 1](../phases/phase-01/learn_the_phase.md).

## 4. Core request lifecycles

### 4.1 Synthesis (UF-1)

```text
web:  POST /api/tts { text, voice }
api:  validate (zod) → look up voice in catalog → TTSProvider.synthesize(text, voiceId)
      → MP3 bytes → AudioStore.put(bytes) → id = uuid
      → 201 { success, audioId, audioUrl: "/api/audio/<id>", voice, language, format: "mp3", chars }
web:  fetch(audioUrl) → Blob → <audio> src = URL.createObjectURL(blob)
      download: <a download="speech-<id>.mp3" href=objectURL>
```

- Temp store: in-memory `Map` with LRU eviction (200 files / 200 MB) and 30-min TTL (FR-032, NFR-011).
  Single-instance assumption is documented; the upgrade path (shared store) is in
  [backend.md](backend.md#audio-store).
- Audio ids are unguessable UUIDs; `GET /api/audio/:id` requires no auth (core is public, FR-025)
  but is rate-limited and TTL-bounded.

### 4.2 AI enhancement (UF-2)

```text
web:  POST /api/ai/enhance { text, operation }
api:  validate → AIProvider configured? (no → 503 AI_NOT_CONFIGURED)
      → prompt = templates[operation] (packages/ai/prompts, versioned)
      → AIProvider.generate(messages, { temperature, maxTokens })
      → zod-validate output + caps → 200 { originalText, enhancedText, operation, model }
web:  review panel → Apply (replaces editor text; one-step Undo) | Dismiss
```

### 4.3 Authenticated history (UF-3)

```text
web:  sign in via Clerk modal → Clerk JWT in cookie
web → api:  Authorization: Bearer <jwt>
api:  clerk-verify middleware (JWKS) → req.user.id = Clerk user id
      → ensure app profile row (Turso `users`) → history repo queries filtered by user id
favorite a generation:
      → copy MP3 (from temp store or re-synthesis) into favorites row as BLOB
        → audio survives TTL for favorites (FR-032)
```

### 4.4 File upload (UF-4, v2)

```text
web:  multipart POST /api/upload (≤10 MB)
api:  multer → validate extension+MIME → extract (.txt utf-8 | pdf-parse | mammoth)
      → strip control chars → truncate at MAX_TEXT_CHARS (flag `truncated`)
      → delete temp file → 200 { text, truncated, fileName, size }
web:  editor prefilled → normal pipeline
```

## 5. Failure & degradation model

| Failure | Detection | Response | UI behavior |
| --- | --- | --- | --- |
| TTS network/endpoint error | provider throws / timeout 30 s | `503 TTS_UNAVAILABLE` | retry button; core otherwise usable |
| TTS catalog fetch fails | on `listVoices()` | serve cached catalog (stale) or `503` | show cached or "voices unavailable" |
| AI not configured | missing `AI_API_KEY` | `503 AI_NOT_CONFIGURED` | enhancement panel disabled + explanation |
| AI provider error/timeout | 60 s timeout / HTTP ≥ 400 / bad JSON | `503 AI_UNAVAILABLE` | retry; original text untouched |
| DB unavailable | libSQL error | `503` on history/favorites endpoints | core still works (public endpoints don't need DB) |
| Client network error | fetch rejects | — | offline message + retry |
| Rate limit | middleware | `429` + `Retry-After` | wait message with seconds |
| Temp audio expired | store miss | `404 AUDIO_EXPIRED` | "expired — regenerate" |

Design rule: **provider failures are 503, programming errors are 500, caller errors are 4xx.**
The server never leaks stack traces; logs carry the `X-Request-Id` for correlation (SR-11).

## 6. Environment & configuration model

All configuration enters as env vars, parsed once at boot in `packages/config` (typed, with
defaults). The full table is in [requirements.md §12](../requirements.md#12-environments).
`.env` is git-ignored; `.env.example` documents every variable with a safe placeholder.

Configuration is *provider-aware*: `TTS_PROVIDER` selects the registered TTS implementation;
`AI_*` selects (and can switch on) the AI implementation. Nothing else in the app knows which
concrete provider is active (TR-03, AR-03).

## 7. Deployment views

### 7.1 Development

One topology (Docker removed, C6):

1. **Native:** `bun run dev` — web :3000 (Next dev), api :4000 (`bun --watch`). Next's dev server
   proxies `/api/*` → `:4000`, so the browser sees a single origin (no CORS in dev; CORS
   middleware is still present and tested). The libSQL file in `data/` persists across process
   restarts; `.env` (from `.env.example`) feeds both apps.

### 7.2 Production

```text
Browser → https://<web>     (Vercel — Next.js, platform runtime)
      → https://<api>/api   (Render — Express on Node 20, single instance)
Egress: api → edge-tts, AI endpoint, Turso (libsql://), Clerk JWKS (https://...clerk.com)
```

- No containers anywhere (C6): no database to host (DE-06); secrets live only in platform env
  settings (DE-04).
- Two-origins model (DE-05): `NEXT_PUBLIC_API_URL` points at Render; the CORS allow-list is the
  web origin; protected calls carry the Clerk Bearer JWT. Dev stays same-origin via the proxy.
- Scale-out note (NFR-011): running **multiple api instances** requires moving the audio LRU to a
  shared store (e.g., S3-compatible object storage or a Turso BLOB on generate). The interface
  (`AudioStore`) is designed to allow that swap. v1 ships single-instance on Render's free tier;
  this is a documented limit, not an oversight.

## 8. Cross-cutting decisions log

| Decision | Rationale | Cost / limit accepted |
| --- | --- | --- |
| Package manager / runtime split | Bun for install/workspaces/dev; Node 20 in production | One fast toolchain in dev; prod stays on a runtime with zero compatibility risk (the Render service runs `node dist/server.js`) | Bun in prod (runtime risk for no product gain), pnpm (strict layout; boundary discipline moves to our lint/tests) |
| Deployment: no Docker — Vercel + Render (C6) | No local services to containerize (TTS = remote endpoint, DB = hosted Turso); free tiers; platforms provide TLS, builds, rollback | Docker Compose (original design; removed 2026-09): loses the self-host story + container-hardening section; prod becomes two origins (CORS + Bearer load-bearing) |
| edge-tts as default TTS | Only viable *keyless, free, good-quality, multilingual* option; fits C1 | Unofficial endpoint: no SLA, may break/rate-limit → abstraction + `mock` fallback + 503 UX (TR-09) |
| MP3 only (no WAV/OGG promise) | What edge-tts actually produces; spec says don't promise unsupported formats | — |
| AI = OpenAI-compatible free endpoint | One integration serves OpenRouter/Groq/etc.; key stays optional at runtime | Free-tier limits belong to the provider; we add our own caps (AR-08) |
| Clerk over custom auth | C3; removes credential risk surface; hosted = no auth DB | A service dependency; but it is free-tier and first-class in both stacks |
| Turso + Drizzle over Postgres/Prisma | C4; libSQL file dev = zero-setup; hosted prod = zero-ops; Drizzle is TS-native | libSQL is SQLite-dialect; schema portability if we ever leave is a migration task |
| Temp audio in memory (default) | Spec: permanent storage not required; keeps v1 dependency-light | Single-instance limit (§7.2); favorites persist explicitly (FR-032) |
| Client pre-validates with the *same* schemas as server | Fast UX (no round-trip on empty text) without divergent rules | Schemas must stay shared (they do: `packages/validation`) |
| Dev proxy vs prod two-origins | Dev: single origin via the Next dev proxy (no CORS pain); prod: Vercel + Render with CORS allow-list + Bearer (DE-05) | Two topologies — documented; dev keeps the same-origin DX |
