# TTS://TERMINAL — Text-to-Speech Platform

A text-to-speech platform built phase-by-phase from [`TTS-Build-Plan.md`](./TTS-Build-Plan.md),
on a **Turborepo** monorepo. Neon-drenched vaporwave UI on top of a production-shaped
Express API. **Rule #1: API keys never leave the server.**

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Foundation & contracts (monorepo, env, frozen API contract, limits) | ✅ Done |
| 1 | Express skeleton & health (`GET /api/health`, JSON 404, CORS, helmet) | ✅ Done |
| 2 | Validation layer (`POST /api/tts` rejects garbage, 501 on valid) | ✅ Done |
| 3 | Mock TTS + audio response + `GET /api/voices` | ✅ Done |
| 4 | React UI (input, counts, language/voice, player, download) | ✅ Done — **Level 1 demo complete** |
| 5 | Real TTS provider (Google Cloud TTS) behind the same interface | ✅ Done |
| 6 | Hardening: rate limit, CORS allow-list, structured logs | ✅ Done |
| 7 | Level 2: JWT auth, history, favorites (SQLite) | ✅ Done |
| 8–9 | Advanced slices, deploy | ⬜ Next |

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **API:** Node 20+, Express 5 (ESM), helmet, cors — Vitest + Supertest
- **UI:** React 19, Vite 7, TypeScript, Tailwind CSS 4 — Vitest + React Testing Library
- **Shared:** `@tts/shared` — the frozen contract (limits, envelopes, types) used by *both* apps
- **Mock audio:** fixtures encoded in pure JS via `@breezystack/lamejs` (dev-only)

## Repo layout

The build plan's `client/` + `server/` map to `apps/*` (Turborepo convention):

```
.
├── apps/
│   ├── client/                 # React 19 + Vite + Tailwind 4 — vaporwave command deck
│   │   └── src/
│   │       ├── components/
│   │       │   ├── tts/             # THE PRODUCT: TtsStudio + TextInput, selectors,
│   │       │   │                    #   GenerateButton, AudioPlayer, ErrorMessage
│   │       │   ├── ui/              # Button, Card, Badge, TerminalWindow, StatusDot
│   │       │   └── system/          # CrtOverlay, Backdrop (grid + sun)
│   │       ├── hooks/               # useApiHealth, useVoices
│   │       ├── services/api.ts      # the only module that knows the API origin
│   │       ├── lib/                 # cn(), textStats (live counters)
│   │       ├── test/setup.ts        # RTL + jest-dom setup
│   │       └── styles/globals.css   # 🎨 ALL design tokens (@theme) + atmosphere layers
│   └── server/                 # Express 5 API
│       ├── fixtures/                # mock-provider MP3s (per-voice pitches + beep.mp3)
│       ├── scripts/                 # generate-fixtures.mjs — reproducible fixture encoder
│       ├── src/
│       │   ├── server.js            # entrypoint — listens (PORT/HOST from env)
│       │   ├── app.js               # app factory — helmet, CORS, /api, JSON 404, error handler
│       │   ├── config/env.js        # centralised env access with safe defaults
│       │   ├── routes/              # health, voices, tts
│       │   ├── services/            # ttsService (swappable provider port), voiceCatalog
│       │   ├── validation/tts.js    # pure Phase 2 validator — 400s live here
│       │   └── middleware/errors.js # contract-shaped JSON 404/400/413 + 500
│       └── tests/                   # Phase 1–3 suites (Vitest + Supertest)
├── packages/
│   └── shared/                 # @tts/shared — frozen contract, consumed by server & client
├── .env.example                # every env var, with TTS_API_KEY= blank
├── turbo.json                  # dev / build / test tasks
└── TTS-Build-Plan.md           # the phase-by-phase source of truth
```

## Quickstart — one command, whole stack

| Command | UI | API | Speech | Needs |
| --- | --- | --- | --- | --- |
| **`docker compose up`** | http://localhost:8080 | http://localhost:3000 | **IndexTTS — real, local** | Docker |
| **`pnpm dev:full`** | http://localhost:5173 | http://localhost:3000 | **IndexTTS — real, local** | Docker + Node/pnpm |
| `pnpm dev` | http://localhost:5173 | http://localhost:3000 | mock fixtures (instant) | Node ≥ 20 + pnpm ≥ 9 |

**`docker compose up`** starts all three containers — UI (nginx), API, and the
IndexTTS sidecar, wired together (`client → server → indextts` inside the
compose network). The sidecar's first boot downloads ~2–4 GB of model weights
into a persistent volume; watch progress with `docker compose logs -f indextts`
(syntheses answer "unavailable" until that finishes, everything else works).

**`pnpm dev:full`** is the same stack on bare metal with hot reload: it starts
the sidecar, waits for its health check (patiently narrating the first-boot
download), then launches UI + API with `TTS_PROVIDER=indextts` pre-wired.
Ctrl+C stops the apps **and** the sidecar (weights stay cached, next boot is
instant). No Docker? It exits with pointing-you-at-`pnpm-dev` instructions.

**`pnpm dev`** is the zero-setup loop: UI + API with mock fixtures — the whole
product works (validation, history*, favorites*), just with beeps instead of
speech. *(history/favorites need a signed-in account — create one in SYS://ACCESS.)*

Other commands:

```bash
pnpm install    # once, after cloning (skipped by the docker path)
pnpm build      # type-check + build every app
pnpm test       # 86 server + 13 client tests
pnpm dev:server # API only · pnpm dev:client — UI only
pnpm --filter @tts/server generate:fixtures    # regenerate mock MP3s (pure JS, no ffmpeg)
```

## Locked decisions (Phase 0 — no TBDs)

| Decision | Value | Why |
| --- | --- | --- |
| Max text length | **4 000 characters** | Cheap, matches many TTS quotas |
| Default language | **`en-US`** | Widest voice coverage |
| Audio format | **MP3 (`audio/mpeg`)** | Plays everywhere, small files |
| Audio transport | **Binary stream** (`{ audioUrl }` optional later) | Phase 3 streams bytes; files can come later |
| TTS provider (Level 1) | **Mock** (fixture MP3s); real vendor in Phase 5 | No billing during early phases; CI needs no secrets |
| Rate limit | **10 TTS requests / IP / 15 min** (enforced Phase 6) | Abuse protection |
| Error envelope | **`{ "success": false, "error": string }`** | One shape the client can always parse |

## API contract (v1 — frozen)

All errors are contract-shaped JSON — never HTML. Unknown routes return
`404 { "success": false, "error": "Not found" }`.

### `GET /api/health` — live (Phase 1 + Phase 6 `tts` field)

```bash
curl -s http://localhost:3000/api/health
# → 200 {"status":"ok","tts":"mock"}
# tts: "mock" | "configured" (vendor + key set) | "unconfigured" (vendor, no key)
# — never includes key material.
```

### `POST /api/auth/*`, `/api/history`, `/api/favorites` — live (Phase 7)

| Endpoint | Auth | Behavior |
| --- | --- | --- |
| `POST /api/auth/register` `{email, password}` | — | **201** `{user}` · **400** invalid · **409** duplicate (7.1) |
| `POST /api/auth/login` `{email, password}` | — | **200** `{token, user}` · **401** (identical message for unknown email / bad password — no enumeration) |
| `GET /api/auth/me` | Bearer | **200** `{user}` — session restore |
| `GET /api/history` | Bearer | **200** `{generations: [...]}` newest first · **401** without token (7.3) |
| `DELETE /api/history/:id` | Bearer | **204** · **404** (missing **or owned by someone else** — no cross-user oracle, 7.4) |
| `GET/POST/DELETE /api/favorites` | Bearer | Voice favorites; **400** on unknown voice (7.6) |
| `GET /api/audio/:file` | — | Replays stored MP3s (strict `[\w-]+.mp3`, no traversal) |

**Documented plan-7.7 choice:** `POST /api/tts` auth is **optional** — anonymous
generation works, and a valid Bearer token additionally records the generation
(audio file + row) for replay in `SYS://ARCHIVE`.

Storage: SQLite via Node's built-in `node:sqlite` (zero deps, CI-friendly) with
the plan's exact schema — `users`, `generations`, `favorites`. Passwords are
scrypt-hashed (`salt:hash`, `timingSafeEqual` compare); tokens are HS256 JWTs
(7-day expiry). `data/` is git-ignored.

### `GET /api/voices` — live (Phase 3)

```json
// 200
{ "voices": [
  { "id": "en-US-female-1", "name": "Aria",   "language": "en-US",  "gender": "female" },
  { "id": "en-US-male-1",   "name": "Marcus","language": "en-US",  "gender": "male" },
  { "id": "en-GB-female-1", "name": "Iris",   "language": "en-GB",  "gender": "female" },
  { "id": "hi-IN-female-1", "name": "Priya",  "language": "hi-IN",  "gender": "female" },
  { "id": "es-ES-male-1",   "name": "Javier", "language": "es-ES",  "gender": "male" },
  { "id": "fr-FR-female-1", "name": "Céline", "language": "fr-FR",  "gender": "female" },
  { "id": "de-DE-male-1",   "name": "Klaus",  "language": "de-DE",  "gender": "male" }
] }
```

Covers every language in the allow-list; drives the Phase 4 selectors.

### `POST /api/tts` — live (Phase 3: validation + mock synthesis)

```json
// request — language is optional (defaults to "en-US")
{ "text": "Hello", "language": "en-US", "voice": "en-US-female-1" }
```

Validation rules (enforced by `src/validation/tts.js`, driven by `@tts/shared`):
text required, trimmed, ≤ 4 000 chars · language must be in the allow-list ·
voice must exist in the catalog · voice must speak the requested language ·
`Content-Type` must be `application/json`.

| Status | When | Body |
| --- | --- | --- |
| 200 | valid request | `audio/mpeg` bytes (binary stream; `X-TTS-Provider: mock`) |
| 400 | empty/oversized text, unknown language, unknown voice, voice/language mismatch, malformed JSON | `{"success":false,"error":"…"}` |
| 415 | `Content-Type` is not `application/json` | `{"success":false,"error":"Content-Type must be application/json"}` |
| 413 | body exceeds 64 KB | `{"success":false,"error":"Request body too large"}` |
| 429 | rate limit exceeded — **live since Phase 6**; includes `Retry-After` + `RateLimit` headers | `{"success":false,"error":"Too many requests"}` |
| 503 | TTS provider unavailable/timeout | `{"success":false,"error":"TTS provider unavailable"}` |

The mock provider streams a per-voice fixture MP3 (~1 s pitched dual-beep —
speakers are audibly distinct).

### Provider selection (Phase 5+)

`TTS_PROVIDER` picks the implementation behind the **same** `synthesize()`
interface — the route, contract, and UI do not change:

| `TTS_PROVIDER` | Behavior | Needs a key? | Needs internet? |
| --- | --- | --- | --- |
| `mock` *(default)* | Per-voice fixture MP3s | No | No |
| **`indextts`** ⭐ | **Real cloned speech via a local [IndexTTS-2.5](https://github.com/index-tts/index-tts) sidecar** — open source, runs on your machine (CPU works, NVIDIA GPU is fast) | **No key, no credit card** | No (after first model download) |
| `google` | Google Cloud TTS (`Neural2` voices) | Yes — requires a billing account | Yes |

**Recommended for local use: `indextts`.** One command starts it:

```bash
docker compose up indextts   # first boot downloads ~2-4 GB of model weights
```

Then in `apps/server/.env`:

```bash
TTS_PROVIDER=indextts
INDEX_TTS_API_URL=http://127.0.0.1:7861
INDEX_TTS_TIMEOUT_MS=120000   # CPU synthesis is slow; GPU is fast
```

See [`sidecar/README.md`](./sidecar/README.md) for the manual (non-Docker)
setup and how to clone your own voice into any catalog slot (drop a WAV into
the refs dir). Language coverage: ZH/EN/JA/ES/AR officially; our hi-IN/fr-FR/
de-DE entries use the model's cross-lingual mode (unofficial quality).

Google error mapping (plan Phase 5): missing/invalid key (**401/403**) → vague
**500** "Internal server error" — the key and vendor message never reach the
client; timeout (default 30 s, `TTS_TIMEOUT_MS`) / network / vendor errors →
**503** "TTS provider unavailable". Voice ids map to Google names in
`src/services/providers/googleTts.js`.

IndexTTS error mapping: sidecar unreachable / timeout (default 120 s) /
sidecar errors → **503** "TTS provider unavailable"; its WAV output is
converted to contract MP3 in pure JS (`@breezystack/lamejs` — no ffmpeg).

## Environment variables

Copy the root [`.env.example`](./.env.example) to `apps/server/.env` for local dev.
`.env` files are git-ignored — **keys can never be committed** (Phase 0 test 0.2).

| Var | Default | Used by | Notes |
| --- | --- | --- | --- |
| `PORT` | `3000` | server | API port |
| `HOST` | `0.0.0.0` | server | Bind address |
| `CLIENT_ORIGIN` | `http://localhost:5173` | server | CORS **allow-list** — comma-separated for multiple origins (Phase 6) |
| `TTS_PROVIDER` | `mock` | server | `mock` needs no key; vendor choice lands Phase 5 |
| `TTS_API_KEY` | *(blank)* | server | **Server-only.** Never in client code or bundles |
| `TTS_REGION` | *(blank)* | server | Vendor region (future providers) |
| `TTS_TIMEOUT_MS` | `30000` | server | Vendor request timeout; overdue → 503 |
| `JWT_SECRET` | *(dev fallback + warning)* | server | **Required in production** — signs login tokens (Phase 7) |
| `DB_PATH` | `apps/server/data/tts.sqlite` | server | SQLite file; `:memory:` for tests (Phase 7) |
| `UPLOADS_DIR` | `apps/server/data/uploads` | server | Generated-audio storage for history replay (Phase 7) |
| `INDEX_TTS_API_URL` | `http://127.0.0.1:7861` | server | Local IndexTTS sidecar URL (`docker compose up indextts`) |
| `INDEX_TTS_TIMEOUT_MS` | `120000` | server | Local synthesis timeout (CPU is slow; GPU is fast) |
| `VITE_API_URL` | *(blank)* | client | Empty in dev (Vite proxy); absolute API origin in prod (Phase 9) |

## Tests

```bash
pnpm test          # everything (CI runs this with TTS_PROVIDER=mock)
```

**Status: Phase 0–7 verified 2026-09-10 — 73 server + 13 client green (3 vendor
tests skip without a real key).**

### Server (`apps/server/tests/`, Vitest + Supertest)

| ID | Phase | Test | Expected | Status |
| --- | --- | --- | --- | --- |
| 0.1 | 0 | README lists install steps + env vars | Present | ✅ |
| 0.2 | 0 | `.env` git-ignored; `TTS_API_KEY=` blank in `.env.example` | No secrets committable | ✅ |
| 0.3 | 0 | Limits documented (4 000 chars, 10 req/15 min, `audio/mpeg`), no TBD | Documented | ✅ |
| — | 0 | Contract guard (`tests/contract.test.js`) | Frozen limits + envelopes asserted as code | ✅ |
| 1.1 | 1 | `GET /api/health` (Supertest + live curl) | **200**, `{ "status": "ok" }`, JSON | ✅ |
| 1.2 | 1 | `GET /api/does-not-exist` | **404**, contract JSON — never HTML | ✅ |
| 1.3 | 1 | Manual: health while server running | `200` `application/json` in ~1 ms | ✅ |
| 1.4 | 1 | Manual: server stopped, hit health | Connection refused — client error path confirmed | ✅ |
| 2.1 | 2 | `POST /api/tts` `{}` | **400**, "Text is required" | ✅ |
| 2.2 | 2 | `{ "text": "   " }` | **400**, empty after trim | ✅ |
| 2.3 | 2 | 4 001 chars | **400**, "must be 4000 characters or fewer" | ✅ |
| 2.4 | 2 | `{ "text": "Hi" }` (no voice) | **400**, "Voice is required" | ✅ |
| 2.5 | 2 | `language: "xx-ZZ"` | **400**, "Unsupported language" | ✅ |
| 2.6 | 2→3 | valid body | Phase 2: **501** · Phase 3+: **200** `audio/mpeg` | ✅ |
| 2.7 | 2 | `Content-Type: text/plain` | **415** contract JSON | ✅ |
| 2.8 | 2 | Manual: repeat 2.1–2.7 live (curl) | Identical status codes | ✅ |
| 3.1 | 3 | `GET /api/voices` | **200**, ≥2 voices with id/name/language/gender | ✅ |
| 3.2 | 3 | `POST /api/tts` valid | **200**, `content-type: audio/mpeg`, body > 0 bytes | ✅ |
| 3.3 | 3 | Unknown voice id | **400**, "Unknown voice" | ✅ |
| 3.4 | 3 | Voice ≠ requested language | **400**, "does not speak" | ✅ |
| 3.5 | 3 | Manual: save response as `.mp3` | Valid MPEG frame chain (40 frames, ~1 s), playable | ✅ |
| 3.6 | 3 | Regression: Phase 2 suite | 400s intact; valid input now **200** (was 501) | ✅ |
| 5.1 | 5 | Full suite with `TTS_PROVIDER=mock` | All green — CI needs no secrets | ✅ |
| 5.2 | 5 | Real key: English sentence | **200** real-speech MP3 *(needs key — gated)* | ⏭ skips without key |
| 5.3 | 5 | Real key: Hindi sentence | Intelligible hi-IN speech *(needs key — gated)* | ⏭ skips without key |
| 5.4 | 5 | Wrong API key (401/403) | **500** vague body — key & vendor msg never leak | ✅ (stubbed + missing-key) |
| 5.5 | 5 | Vendor timeout / network stub | **503** "TTS provider unavailable" | ✅ |
| 5.6 | 5 | `grep TTS_API_KEY` in client src + dist | Zero matches | ✅ |
| 5.7 | 5 | Two voices → different audio | Different buffers *(real key)* · fixtures differ per voice | ✅ |
| 6.1 | 6 | 11th TTS from same IP in window | **429** + `Retry-After: 900` + `RateLimit: limit=10` | ✅ |
| 6.2 | 6 | Health/voices after limit hit | **Never 429** — unlimited | ✅ |
| 6.3 | 6 | Disallowed origin | No `Access-Control-Allow-Origin`; allow-list from `CLIENT_ORIGIN` (CSV) | ✅ |
| 6.4 | 6 | Logs after TTS call | Structured JSON: requestId, durationMs, `textLength` only — no text, no keys | ✅ |
| — | 6 | Regression: Phases 2–5 suites | All still pass (`rateLimit: false` in per-suite apps) | ✅ |
| 7.1 | 7 | Register duplicate email | **409** | ✅ |
| 7.2 | 7 | Login bad password | **401** (same message as unknown email) | ✅ |
| 7.3 | 7 | `GET /api/history` no token | **401** | ✅ |
| 7.4 | 7 | User A deletes user B's row | **404** (no cross-user oracle); row survives | ✅ |
| 7.5 | 7 | TTS + history | Row saved; `audio_url` replays **200** `audio/mpeg` | ✅ |
| 7.6 | 7 | Favorite unknown voice | **400**; known voice → 201, list joins catalog | ✅ |
| 7.7 | 7 | Logged-out Generate | **Works anonymously** (documented choice); nothing saved | ✅ |
| 7.8 | 7 | Two users, two histories | Fully isolated | ✅ |

### Client (`apps/client/src/`, Vitest + React Testing Library)

| ID | Phase | Test | Expected | Status |
| --- | --- | --- | --- | --- |
| 4.1 | 4 | Empty textarea + Generate | Button **disabled**, zero network calls | ✅ |
| 4.2 | 4 | Type "Hello world" | CHARS 11/4000 · WORDS 2, live | ✅ |
| 4.3 | 4 | Paste 4 001 chars | Clamped to 4 000 + "MAX REACHED" warning | ✅ |
| 4.4 | 4 | Change language | Voice list filters; stale voice auto-resets | ✅ |
| 4.5 | 4 | Voices API failure | Alert visible + Generate disabled + retry button | ✅ |
| 4.6 | 4 | TTS 200 blob | `<audio>` appears with `blob:` src | ✅ |
| 4.7 | 4 | TTS 400 | Server's JSON error text shown in alert | ✅ |
| 4.8 | 4 | Network offline | "Network failure" message | ✅ |
| 4.9 | 4 | Download link | `download="speech.mp3"` + `blob:` href | ✅ |
| 4.10 | 4 | Manual: happy path vs live server | ✅ verified via proxy round-trip (catalog → 200 MPEG) | ✅ |
| 4.11 | 4 | Manual: 375 px width | Mobile-first single-column; no horizontal overflow | ✅ |
| 4.12 | 4 | Manual: keyboard order | DOM order: textarea → language → voice → generate → player | ✅ |

### UI behavior decisions (documented per the plan)

- **4 001st character is blocked *and* warned** (clamped in `TextInput`, "MAX REACHED" hint).
- **Changing text clears the previous audio** (plan: "clear is simpler"); the old
  object URL is revoked — no blob memory leaks, ever.
- **Empty text never reaches the network** — Generate is disabled until text +
  voice exist (4.1), and the server re-validates everything client-side checks.
- **Error mapping** (`ErrorMessage`): 400s show the server's human message; 429
  explains the 10/15-min limit; 503 suggests retrying; a dead connection says
  "Network failure".

CI (`.github/workflows/ci.yml`) installs, builds, and tests on every push with the
mock provider — no secrets ever needed.

## Design system (vaporwave / outrun)

The full design language lives in **one file** — `apps/client/src/styles/globals.css`:

- **`@theme` tokens**: palette (`void #090014`, `panel #1a103c`, `magenta #FF00FF`,
  `cyan #00FFFF`, `sunset #FF9900`, `line #2D1B4E`), fonts (Orbitron headings,
  Share Tech Mono body/UI — self-hosted via Fontsource), neon glow shadows, motion.
- **Atmosphere components**: CRT overlay (scanlines + chromatic aberration +
  vignette, `aria-hidden`, pointer-transparent) and the backdrop (perspective grid
  floor, blurred gradient sun, horizon glow).
- **Primitives**: `Button` (4 variants, kinetic skew), `Card`, `Badge`, `StatusDot`,
  `TerminalWindow` (window chrome + control dots).
- **Synth bay** (`components/tts/`): the Phase 4 product UI, built entirely from
  those primitives — live counts, terminal selectors, in-flight "SYNTHESIZING…"
  state, blob-fed `<audio>` + neon download button.

Accessibility is part of the system: labeled inputs (4.12/9.5), `role="alert"`
errors, `aria-live` counters/status, visible cyan focus rings, 44px+ touch
targets, `prefers-reduced-motion` support.

## Roadmap

See [`TTS-Build-Plan.md`](./TTS-Build-Plan.md) for the full phase-by-phase plan.
**Phases 0–7 complete: Level 1 + hardening + Level 2 accounts.** Real speech,
free and local, via the IndexTTS sidecar (`docker compose up indextts` — no
key, no credit card). Rate-limited, CORS-locked, privacy-logged, with per-user
history and favorites. Remaining (Phase 8/9): advanced slices (speed/pitch
sliders, file upload, AI enhance, cloud storage) and deployment.
