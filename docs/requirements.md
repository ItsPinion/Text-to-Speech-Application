# Requirements — Text-to-Speech Monorepo

Phase 0 deliverable. This document is the single source of truth for **what** is being built.
The *how* lives in [architecture/system.md](architecture/system.md) and the per-phase learning docs.

- **MoSCoW:** Must (v1 core) · Should (v1 stretch) · Could (v2, phase-gated) · Won't (explicitly out)
- **Phase** column references the phase that delivers the requirement.
- Hard constraints are restated from the root README and are binding on every section below.

---

## 1. Product summary

A web application that:

1. Accepts text (typed, pasted, or later: uploaded file).
2. Lets the user pick a **language** and a **voice** from a provider catalog.
3. Optionally runs **free AI text enhancement** (grammar, summary, rewrite, conversational, simplify)
   with explicit user confirmation before the enhanced text replaces the original.
4. Converts text to speech via a **free TTS engine** (default: edge-tts).
5. Returns audio (MP3) to the browser for **playback** (play/pause/seek/volume/progress) and **download**.
6. With a **Clerk** account: records **speech history**, supports **favorites**, and remembers
   **voice/language preferences**.
7. Fails **gracefully and legibly** for every documented error class.

## 2. Hard constraints (binding)

| # | Constraint | Consequence for design |
| --- | --- | --- |
| C1 | No paid TTS API required | edge-tts default; provider abstraction; no paid SDK may be a hard dependency |
| C2 | Free AI models only | `AIProvider` → OpenAI-compatible free-tier endpoint; key optional at runtime; feature degrades to 503 without key |
| C3 | Clerk is the identity provider | No custom JWT, no passwords, no user-credential tables |
| C4 | Turso (libSQL) + Drizzle for app data | No PostgreSQL; schema is SQLite/libSQL-dialect; Drizzle owns queries |
| C5 | Turborepo monorepo | `apps/web`, `apps/api`, `packages/*`; one lockfile; shared types/schemas/config |
| C6 | **No Docker — PaaS deployment** | Dev is native (`bun run dev`); prod = Vercel (web) + Render (api). Chosen 2026-09: no local services to containerize (TTS = remote endpoint, DB = hosted Turso) |

## 3. Functional requirements

### 3.1 Core TTS (Phases 3–11) — Must

| ID | Requirement | Notes |
| --- | --- | --- |
| FR-001 | User can enter or paste text in a text area | Multi-line, editable after generation |
| FR-002 | UI shows live character count, word count, and remaining characters vs. the maximum | Max = 5,000 chars (shared constant, `MAX_TEXT_CHARS`) |
| FR-003 | User selects a language from the catalog returned by the API | Languages derived from the voice catalog (deduplicated) |
| FR-004 | User selects a voice; voice list depends on the selected language | Dependent selectors; selection resets safely on language change |
| FR-005 | "Generate Speech" sends text + voice to `POST /api/tts` and produces audio | Backend validates, calls TTS provider, stores audio temporarily, returns `audioUrl` |
| FR-006 | Audio player supports play, pause, seek, volume, progress, and duration display | Custom player on `<audio>` element; MP3 |
| FR-007 | User can download the generated audio as an MP3 file | Filename: `speech-<id>.mp3` |
| FR-008 | All error classes are surfaced with actionable messages | See §6 error matrix; both client- and server-side |
| FR-009 | Empty text and over-length text are rejected before any API call (client) **and** re-validated (server) | Defense in depth; never trust the client |
| FR-010 | `GET /api/voices` returns the voice catalog with name, language/locale, and gender | Source of truth is the backend, not the browser |
| FR-011 | `GET /api/health` (liveness) and `GET /api/health/ready` (readiness) exist | Readiness reports TTS/AI/DB check status |
| FR-012 | User can clear or modify the text at any time | Clear resets player state |
| FR-013 | A loading state is shown while generating; the in-flight request can be cancelled | `AbortController` on the client |

### 3.2 AI text enhancement (Phases 12–13) — Should

Constraint C2 applies: **free models only**, key supplied by the user in a server env var.

| ID | Requirement | Notes |
| --- | --- | --- |
| FR-014 | Operations: `correctGrammar`, `summarize`, `rewrite`, `makeConversational`, `simplify` | One operation per request |
| FR-015 | Enhanced text is shown in a **review panel**; the user must explicitly **Apply** or **Dismiss** | Original text is never auto-replaced |
| FR-016 | Without a configured AI key: clear `503 AI_NOT_CONFIGURED`; UI hides/disables enhancement with an explanation | App fully usable without AI |
| FR-017 | AI output is validated server-side (schema + length caps) before returning | Caps: `summarize` ≤ 500 chars; other ops ≤ 1.5× input length; non-empty |
| FR-018 | AI requests are rate-limited per user/IP (20/hour default) and time-boxed (60s timeout) | 429 with `Retry-After` when exceeded |

### 3.3 Accounts, history, favorites (Phases 14–16) — Could (v2, phase-gated)

| ID | Requirement | Notes |
| --- | --- | --- |
| FR-019 | Sign in / sign up / sign out via **Clerk** (hosted UI or modal) | No custom auth code beyond integration |
| FR-020 | Protected routes (web) and protected API endpoints (Express) | Clerk middleware + server-side JWT verification |
| FR-021 | App profile row (Clerk user id, display name, created at) created on first authenticated request | Only application-specific data in Turso |
| FR-022 | Speech history per user: list (paginated), detail, delete | Stores text, language, voice, audio reference, created at |
| FR-023 | Favorites: mark/unmark a generation; favorites list; delete a generation removes its favorite | |
| FR-024 | Voice/language preferences: default language + default voice per user; recent voices | Used to pre-select on load |
| FR-025 | Core TTS works for signed-out users (rate-limited per IP); history/favorites require auth | Public core, personal persistence |

### 3.4 File upload & text extraction (Phase 17) — Could (v2)

| ID | Requirement | Notes |
| --- | --- | --- |
| FR-026 | Upload `.txt`, `.pdf`, `.docx`; extract text; show preview in the editor | Max 10 MB; MIME + extension validation |
| FR-027 | Extracted text longer than `MAX_TEXT_CHARS` is truncated with an explicit notice | User can edit after truncation |
| FR-028 | Uploaded files are processed from a temp location and deleted immediately after extraction | Never persisted |

### 3.5 Cross-cutting — Must

| ID | Requirement | Phase |
| --- | --- | --- |
| FR-029 | Rate limiting on all public endpoints (per-IP; per-user where authed) | 18 |
| FR-030 | Security defaults: Helmet headers, CORS allow-list, JSON body limit 100 KB, request timeouts | 18 |
| FR-031 | Structured logs with request IDs; metrics for requests/latency/TTS/AI outcomes | 21 |
| FR-032 | Audio is stored **temporarily** (TTL 30 min, bounded LRU); favorited generations persist the MP3 as a BLOB in Turso on demand | 9 / 15 |

### 3.6 Won't (explicitly out of scope for this project)

- Paid TTS or paid AI as a *requirement* (may be possible to configure, never required).
- Custom password/JWT authentication or any user-credential storage.
- PostgreSQL or any non-libSQL database.
- Self-hosted LLM as the *default* AI path (documented as a possible user-configured endpoint).
- Real-time/streaming TTS, voice cloning, audio editing, UI i18n (UI stays English),
  offline/PWA mode, multi-tenant teams, admin analytics dashboards.

## 4. Non-functional requirements

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-001 | UI responsiveness | First interaction < 100 ms; voice list rendered < 500 ms (cached after first fetch) |
| NFR-002 | API latency (excluding TTS/AI provider time) | p95 < 300 ms |
| NFR-003 | End-to-end TTS latency | < 10 s for ≤ 1,000 chars on a healthy network (provider-dependent; surfaced, never faked) |
| NFR-004 | Graceful degradation | TTS down → 503 + retry UI; AI unconfigured/down → 503 + disabled UI; app otherwise usable |
| NFR-005 | Cost | Zero mandatory paid services. AI key is a user option (free tier). |
| NFR-006 | Security | See §8. No secret in client bundle or image; all input validated server-side; HTTPS in prod |
| NFR-007 | Portability | `bun install && bun run dev` works on any modern OS; the repo deploys to Vercel + Render from `main` with no extra steps |
| NFR-008 | Maintainability | TypeScript strict mode; shared schemas/types; lint + typecheck + tests in CI; docs per phase |
| NFR-009 | Accessibility | WCAG 2.1 AA baseline: labels on all controls, visible focus, `aria-live` error region, keyboard operable |
| NFR-010 | Privacy | Audio TTL-limited; no history for anonymous users; minimal data collected; keys never logged |
| NFR-011 | Scalability (honest limit) | API is stateless **except** the in-memory audio store → single-instance assumption for v1; documented upgrade path (shared store) in architecture/system.md |

## 5. User flows

### UF-1 Core TTS (happy path)

```text
1. User opens app → voices load from GET /api/voices (skeleton while loading)
2. User enters text → live counts update (chars / words / remaining)
3. User picks language → voices filter; voice resets to language default
4. User picks voice → (optional) AI enhancement panel
5. User clicks Generate → POST /api/tts { text, voice }
   → loading state; user may cancel
6. 201 { audioId, audioUrl } → GET audioUrl → audio blob in player
7. Play / pause / seek / volume / download (speech-<id>.mp3)
```

Failure branches: 400 (validation) → field errors; 429 → "slow down" message;
503 → "TTS unavailable, retry"; network error → offline message + retry button.

### UF-2 AI enhancement

```text
1. User has text + chooses operation (e.g. "Make conversational")
2. POST /api/ai/enhance { text, operation } → loading
3. 200 { originalText, enhancedText } → review panel shows both
4. Apply → editor text replaced (original kept in memory for one-step "Undo")
   Dismiss → nothing changes
5. User can then Generate Speech from the enhanced text
```

Failure branches: `AI_NOT_CONFIGURED` → panel shows "Add a free AI key to enable";
429 → quota message with reset time; 503 → provider unavailable, retry.

### UF-3 Auth, history, favorites

```text
Sign in:  Clerk flow (modal) → JWT accepted by both Next middleware and Express
History:  GET /api/history → list (text snippet, voice, date) → click → re-play if audio
          still available (persisted blob or still within TTL) or "regenerate"
Favorite: star a generation → persisted (audio BLOB stored once) → Favorites page
Sign out: clears session; protected data disappears from UI
```

### UF-4 File upload (v2)

```text
Choose file (.txt/.pdf/.docx, ≤ 10 MB)
 → multipart to POST /api/upload
 → server validates MIME + extension + size → extracts text
 → 200 { text, truncated, fileName, size }
 → editor prefilled (preview) → user edits if needed → UF-1 from step 5
```

### UF-5 Error handling (generic contract)

```text
Any request → error response { success:false, error:{ code, message } }
  client maps code → human message + action (retry / edit / sign in / slow down)
  unknown codes → generic safe message; raw detail only in server logs
```

### UF-6 Sign-in impact on core

Signed-out users can use the whole core (rate-limited per IP). Signing in adds history,
favorites, and preferences; previously generated audio ids still resolve within their TTL.

## 6. Error matrix

| Code | HTTP | Meaning | Where | User action |
| --- | --- | --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed body / bad content-type | api | Fix request (rare for UI) |
| `INVALID_TEXT` | 400 | Empty or not a string | client + api | Enter text |
| `TEXT_TOO_LONG` | 400 | > 5,000 chars | client + api | Shorten text |
| `INVALID_VOICE` | 400 | Voice not in catalog | client + api | Re-select voice |
| `INVALID_LANGUAGE` | 400 | Language not supported / mismatched voice | api | Re-select language |
| `INVALID_OPERATION` | 400 | Unknown AI operation | client + api | Re-select operation |
| `UNAUTHORIZED` | 401 | Missing/invalid/expired token | api (protected) | Sign in |
| `FORBIDDEN` | 403 | Authenticated but not allowed (e.g., foreign resource) | api | — |
| `NOT_FOUND` | 404 | Unknown route or resource | api | — |
| `AUDIO_EXPIRED` | 404 (or 410 semantics in message) | Temp audio gone | web | Regenerate |
| `FILE_INVALID` | 400 | Wrong type/content for upload | web | Different file |
| `FILE_TOO_LARGE` | 413 | > 10 MB | web | Smaller file |
| `RATE_LIMITED` | 429 | Limit exceeded (with `Retry-After`) | api | Wait (time shown) |
| `PAYLOAD_TOO_LARGE` | 413 | Body over limit | api | Smaller text |
| `TTS_UNAVAILABLE` | 503 | TTS provider/network failure | api | Retry |
| `AI_NOT_CONFIGURED` | 503 | No AI key set | api | Add free key (ops) |
| `AI_UNAVAILABLE` | 503 | AI provider error/timeout | api | Retry later |
| `INTERNAL` | 500 | Unexpected | api | Retry; log has request ID |

## 7. API requirements (summary — full contract in [api/API.md](api/API.md))

| Method & path | Auth | Purpose | Introduced |
| --- | --- | --- | --- |
| `GET /api/health` | none | Liveness | 6 |
| `GET /api/health/ready` | none | Readiness (tts/ai/db checks) | 6, full in 21 |
| `GET /api/voices` | none | Voice catalog | 5 |
| `POST /api/tts` | none (IP-limited) | Synthesize text → temp audio | 9 |
| `GET /api/audio/:id` | none (ID = unguessable) | Stream MP3 | 9 |
| `POST /api/ai/enhance` | none (IP-limited) | Free AI enhancement | 12 |
| `GET /api/users/me` | Clerk | App profile (upsert) | 14 |
| `GET /api/history` | Clerk | Paginated history | 15 |
| `GET /api/history/:id` | Clerk | History detail | 15 |
| `DELETE /api/history/:id` | Clerk | Delete generation (+favorite) | 15 |
| `GET /api/favorites` | Clerk | Favorites list | 16 |
| `POST /api/favorites` | Clerk | Add favorite (persists audio BLOB) | 16 |
| `DELETE /api/favorites/:generationId` | Clerk | Remove favorite | 16 |
| `GET /api/preferences` | Clerk | Voice/language defaults | 16 |
| `PUT /api/preferences` | Clerk | Set defaults | 16 |
| `POST /api/upload` | none (IP-limited) | Extract text from file | 17 |

Status codes used: 200, 201, 400, 401, 403, 404, 413, 429, 500, 503 (per spec table + 413).

## 8. Security requirements

| ID | Requirement |
| --- | --- |
| SR-01 | Secrets (AI key, Clerk secret, Turso token) live **only** in server env vars / `.env` (git-ignored) or platform env settings; never in the web client or logs |
| SR-02 | Every request validated server-side (zod): text, voice, language, operation, body shape, content-type |
| SR-03 | Text max 5,000 chars; JSON body ≤ 100 KB; uploads ≤ 10 MB; request timeouts (TTS 30 s, AI 60 s) |
| SR-04 | Rate limits: general 60 req/min/IP; `POST /api/tts` 10 req/min/IP (15 for authed users); `POST /api/ai/enhance` 20 req/hour/IP (per-user when authed) |
| SR-05 | CORS allow-list (web origin only); Helmet security headers; `X-Request-Id` on every response |
| SR-06 | Clerk JWT verified on the API (signature, issuer, expiry) — client claims never trusted |
| SR-07 | Per-user data scoping: every history/favorite/preference query is filtered by the authenticated user id |
| SR-08 | Uploads: extension + MIME + size validation, temp storage, immediate cleanup, extracted text sanitized of control chars, never executed |
| SR-09 | Audio ids are `crypto.randomUUID()`; temp store bounded (LRU, TTL 30 min); no permanent audio without an explicit favorite |
| SR-10 | HTTPS in production (reverse proxy terminates TLS); dependency updates tracked (Dependabot); no secrets committed (secret scanning in CI) |
| SR-11 | Logs are structured and redacted: no API keys, no full text bodies above a truncated preview |

## 9. TTS requirements

| ID | Requirement |
| --- | --- |
| TR-01 | Default engine: **edge-tts** — free, no API key, MP3 output |
| TR-02 | Engine accessed only through `TTSProvider` interface: `listVoices()`, `synthesize()` |
| TR-03 | Engine chosen by env: `TTS_PROVIDER=edge-tts` (default) or `mock` (tests/offline) |
| TR-04 | Catalog covers at least: English, Hindi, Gujarati, Marathi, Spanish, French, German (edge-tts provides all + ~35 more locales) |
| TR-05 | Voice metadata: `id` (provider short name), `name` (display), `language` (locale), `gender` |
| TR-06 | Voice catalog cached server-side (TTL 24 h) with refresh-on-failure; UI loads catalog from API only |
| TR-07 | Synthesis: validate → look up voice → provider → temp store → `{ audioId, audioUrl }` |
| TR-08 | Provider/network failures map to `503 TTS_UNAVAILABLE`, never a 500 with stack leak |
| TR-09 | Documented honest limit: edge-tts is an unofficial consumer endpoint — no SLA, may change or be rate-limited; the abstraction exists precisely for this (see architecture/tts.md) |

## 10. AI requirements

| ID | Requirement |
| --- | --- |
| AR-01 | Free models only (C2). Documented defaults: OpenRouter free (`:free`) models or Groq free tier via user-supplied key |
| AR-02 | Config: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — all server-side. Absent key ⇒ feature off (`AI_NOT_CONFIGURED`) |
| AR-03 | Accessed only through `AIProvider` interface: `generate()` (required), `stream()` (optional) |
| AR-04 | Operations with versioned prompts in `packages/ai/prompts`; one operation per request |
| AR-05 | Output validated with zod (string, non-empty, length caps) before returning; failure → `AI_UNAVAILABLE` |
| AR-06 | Temperature ≤ 0.3 for deterministic-ish edits; max output tokens capped per operation |
| AR-07 | UI never auto-applies: review panel + Apply/Dismiss + one-step Undo (client-side) |
| AR-08 | Provider errors/timeouts → `503 AI_UNAVAILABLE`; per-key usage not metered by us (free-tier limits are the provider's) but we enforce our own rate limit (SR-04) |

## 11. Deployment requirements (no Docker — C6)

| ID | Requirement |
| --- | --- |
| DE-01 | Phase 20: `web` deploys to **Vercel** from the repo (Next.js auto-detected; Vercel installs with Bun from `bun.lock`) |
| DE-02 | Phase 20: `api` deploys to **Render** as a single-instance native Node service (build: install Bun → `bun install --frozen-lockfile` → `bun run build`; start: `node apps/api/dist/server.js`) |
| DE-03 | TLS on both public hosts (platform-provided, automatic); Render health-check path `/api/health` |
| DE-04 | Secrets live only in platform env settings (Render env / Vercel env) — never in the repo (SR-01) |
| DE-05 | Prod is **two origins**: `NEXT_PUBLIC_API_URL` = Render's public URL; `CORS_ORIGIN` allow-list = the web origin; the web client sends the Clerk JWT as a Bearer header on cross-origin calls (Phase 14) |
| DE-06 | Turso stays a **hosted** service (no database anywhere in the stack); local dev uses the libSQL file `data/local.db` (git-ignored) |
| DE-07 | Rollback = redeploy the previous version on each platform (documented runbook, Phase 22) |
| DE-08 | Platform limits documented honestly (Render free-tier idle spin-down, Vercel Hobby limits); single api instance matches NFR-011 |

## 12. Environments

| Variable | web | api | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | ✅ | — | API base URL for the browser (`/api` via proxy in dev) |
| `API_PORT` | — | ✅ | 4000 (dev + Render) |
| `CORS_ORIGIN` | — | ✅ | Web origin allow-list |
| `TTS_PROVIDER` | — | ✅ | `edge-tts` (default) / `mock` |
| `AI_BASE_URL` `AI_API_KEY` `AI_MODEL` | — | ✅ | Free AI endpoint (optional) |
| `CLERK_PUBLISHABLE_KEY` | ✅ | — | Public key (safe in client) |
| `CLERK_SECRET_KEY` | — | ✅ | JWT verification on Express |
| `TURSO_DB_URL` `TURSO_AUTH_TOKEN` | — | ✅ | `file:./data/local.db` dev / `libsql://…` prod |
| `RATE_LIMIT_*` | — | ✅ | Tunable limits (defaults in code) |

- **Dev (native):** `bun run dev` → web :3000, api :4000 (Bun is the package manager and dev runtime; production runs Node 20 on Render); Next dev proxy forwards `/api/*` to :4000 (no CORS pain in dev). **This is the only dev topology** (Docker removed, C6).
- **Prod:** Vercel (Next) + Render (Express, Node 20) → { edge-tts (egress), AI endpoint (egress), Turso (hosted), Clerk (hosted, verified via JWKS) }. Two public origins; the browser reaches the API via `NEXT_PUBLIC_API_URL` (CORS allow-list + Bearer JWT, DE-05).

## 13. Definition of Done

**Core (Phase 11 exit):**

- [ ] `bun install && bun run lint && bun run typecheck && bun run test && bun run build` all pass from the repo root
- [ ] `bun run dev` starts web + api (single origin, proxy intact); health checks green
- [ ] UF-1 completes end-to-end with edge-tts: generate → play → seek → volume → download
- [ ] Every row of the error matrix (§6) that applies to core is reachable and returns the documented code/shape
- [ ] Voice catalog loads from the API; dependent language→voice selection works; no secret in the client bundle
- [ ] `learn_the_phase.md` exists and is accurate for Phases 0–11

**AI (Phase 13 exit):**

- [ ] UF-2 works with a free key; without a key the panel degrades per FR-016
- [ ] Output validation caps enforced (tested)
- [ ] Review/Apply/Dismiss/Undo behavior tested in the UI

**Advanced (Phase 17 exit):**

- [ ] Clerk sign-in/up/out on web and API; protected endpoints return 401/403 correctly
- [ ] History + favorites + preferences work per user; foreign access rejected
- [ ] Uploads of .txt/.pdf/.docx extract and preview; bad files rejected; temp files cleaned

**Production (Phase 24 exit):**

- [ ] Production deployed: Vercel (web) + Render (api), TLS on both, readiness green (DE-01…DE-03)
- [ ] Readiness endpoint reports real checks; metrics + structured logs live
- [ ] CI green on `main` (lint, typecheck, tests, build); branch protection on
- [ ] Phase 24 verification matrix (§ docs/phases/phase-24) fully executed and recorded
- [ ] README, API doc, and architecture docs match the shipped system
