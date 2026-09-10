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
| 4 | React UI (input, counts, language/voice, player, download) | ⬜ Next |
| 5 | Real TTS provider behind the same interface | ⬜ |
| 6 | Hardening: rate limit, CORS allow-list, structured logs | ⬜ |
| 7–9 | Auth/history, advanced features, deploy | ⬜ |

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **API:** Node 20+, Express 5 (ESM), helmet, cors — tested with Vitest + Supertest
- **UI:** React 19, Vite 7, TypeScript, Tailwind CSS 4 (CSS-first design tokens)
- **Shared:** `@tts/shared` — the frozen contract (limits, envelopes, types) used by *both* apps
- **Mock audio:** fixtures encoded in pure JS via `@breezystack/lamejs` (dev-only)

## Repo layout

The build plan's `client/` + `server/` map to `apps/*` (Turborepo convention):

```
.
├── apps/
│   ├── client/                 # React 19 + Vite + Tailwind 4 — vaporwave command deck
│   │   └── src/
│   │       ├── components/ui/       # Button, Card, Badge, TerminalWindow…
│   │       ├── components/system/   # CrtOverlay, Backdrop (grid + sun)
│   │       ├── hooks/               # useApiHealth (polls health), useVoices (catalog)
│   │       ├── services/            # api.ts — the only module that knows the API origin
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

## Quickstart

Requires **Node ≥ 20** and **pnpm ≥ 9** (`npm i -g pnpm` or `corepack enable`).

```bash
pnpm install

# Run API (:3000) + UI (:5173) together — UI proxies /api → :3000
pnpm dev

# Or run one app
pnpm dev:server
pnpm dev:client
```

- UI: http://localhost:5173 — the `SYS://HEALTH` panel polls `GET /api/health`,
  and `SYS://SPEC` shows the live voice catalog (Phase 3).
- API: http://localhost:3000/api/health · http://localhost:3000/api/voices

Other commands:

```bash
pnpm build     # type-check + build every app
pnpm test      # run every test suite (server: Vitest + Supertest)
pnpm --filter @tts/server generate:fixtures   # regenerate mock MP3s (lamejs, no ffmpeg)
```

## Locked decisions (Phase 0 — no TBDs)

| Decision | Value | Why |
| --- | --- | --- |
| Max text length | **4 000 characters** | Cheap, matches many TTS quotas |
| Default language | **`en-US`** | Widest voice coverage |
| Audio format | **MP3 (`audio/mpeg`)** | Plays everywhere, small files |
| Audio transport | **Binary stream** (`{ audioUrl }` optional later) | Phase 3 streams bytes; files can come in Phase 4+ |
| TTS provider (Level 1) | **Mock** (fixture MP3s); real vendor in Phase 5 | No billing during early phases; CI needs no secrets |
| Rate limit | **10 TTS requests / IP / 15 min** (enforced Phase 6) | Abuse protection |
| Error envelope | **`{ "success": false, "error": string }`** | One shape the client can always parse |

## API contract (v1 — frozen)

All errors are contract-shaped JSON — never HTML. Unknown routes return
`404 { "success": false, "error": "Not found" }`.

### `GET /api/health` — live (Phase 1)

```bash
curl -s http://localhost:3000/api/health
# → 200 {"status":"ok"}
```

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
| 429 | rate limit exceeded (Phase 6, + `Retry-After`) | `{"success":false,"error":"Too many requests"}` |
| 503 | TTS provider unavailable/timeout | `{"success":false,"error":"TTS provider unavailable"}` |
| 501 | *(Phase 2 only — retired)* valid request before synthesis existed | `{"success":false,"error":"TTS not implemented"}` |

The mock provider streams a per-voice fixture MP3 (~1 s pitched dual-beep —
speakers are audibly distinct). Phase 5 swaps `ttsService`'s provider; the
route, contract, and UI do not change.

## Environment variables

Copy the root [`.env.example`](./.env.example) to `apps/server/.env` for local dev.
`.env` files are git-ignored — **keys can never be committed** (Phase 0 test 0.2).

| Var | Default | Used by | Notes |
| --- | --- | --- | --- |
| `PORT` | `3000` | server | API port |
| `HOST` | `0.0.0.0` | server | Bind address |
| `CLIENT_ORIGIN` | `http://localhost:5173` | server | CORS placeholder (allow-list hardened in Phase 6) |
| `TTS_PROVIDER` | `mock` | server | `mock` needs no key; vendor choice lands Phase 5 |
| `TTS_API_KEY` | *(blank)* | server | **Server-only.** Never in client code or bundles |
| `TTS_REGION` | *(blank)* | server | Vendor region (Phase 5) |
| `VITE_API_URL` | *(blank)* | client | Empty in dev (Vite proxy); absolute API origin in prod (Phase 9) |

## Tests

```bash
pnpm test          # everything (CI runs this with TTS_PROVIDER=mock)
```

Server suite (`apps/server/tests/`, Vitest + Supertest). **Status: Phase 0–3
verified 2026-09-10 — 32/32 automated green, manual protocols executed.**

| ID | Phase | Test | Expected | Status |
| --- | --- | --- | --- | --- |
| 0.1 | 0 | README lists install steps + env vars | Present | ✅ |
| 0.2 | 0 | `.env` git-ignored; `TTS_API_KEY=` blank in `.env.example` | No secrets committable | ✅ |
| 0.3 | 0 | Limits documented (4 000 chars, 10 req/15 min, `audio/mpeg`), no TBD | Documented | ✅ |
| — | 0 | Contract guard (`tests/contract.test.js`) | Frozen limits + envelopes asserted as code | ✅ |
| 1.1 | 1 | `GET /api/health` (Supertest + live curl) | **200**, `{ "status": "ok" }`, JSON | ✅ |
| 1.2 | 1 | `GET /api/does-not-exist` | **404**, contract JSON — never HTML | ✅ |
| — | 1 | `DELETE /api/health` (unsupported method) | **404** JSON | ✅ |
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
| — | 2 | Malformed JSON / >64 KB body / array body / GET method | **400** / **413** / **400** / **404**, all JSON | ✅ |
| 3.1 | 3 | `GET /api/voices` | **200**, ≥2 voices with id/name/language/gender | ✅ |
| 3.2 | 3 | `POST /api/tts` valid | **200**, `content-type: audio/mpeg`, body > 0 bytes | ✅ |
| 3.3 | 3 | Unknown voice id | **400**, "Unknown voice" | ✅ |
| 3.4 | 3 | Voice ≠ requested language | **400**, "does not speak" | ✅ |
| 3.5 | 3 | Manual: save response as `.mp3` | Valid MPEG frame chain (40 frames, ~1 s), playable | ✅ |
| 3.6 | 3 | Regression: Phase 2 suite | 400s intact; valid input now **200** (was 501) | ✅ |

CI (`.github/workflows/ci.yml`) installs, builds, and tests on every push with the
mock provider — no secrets ever needed.

## UI — current state (design-system foundation)

The client is the **vaporwave design system, implemented** — not yet the Phase 4
product screen. What exists today:

- **Tokens** in `apps/client/src/styles/globals.css` (`@theme`): palette
  (`void #090014`, `panel #1a103c`, `magenta #FF00FF`, `cyan #00FFFF`,
  `sunset #FF9900`, `line #2D1B4E`), fonts (Orbitron for headings, Share Tech Mono
  for everything else), neon shadow/glow tokens, and motion (blink, pulse).
- **Atmosphere** components: fixed CRT overlay (scanlines + chromatic aberration +
  vignette) and the backdrop (perspective grid floor, blurred gradient sun, horizon glow).
- **Primitives**: `Button` (4 variants incl. the skewed kinetic primary),
  `Card`, `Badge`, `StatusDot`, `TerminalWindow` (title bar + control dots + status bar).
- **Live wiring**: `useApiHealth` polls `GET /api/health` (status, latency, checks in
  the `SYS://HEALTH` terminal); `useVoices` fetches the Phase 3 catalog (live voice
  count in `SYS://SPEC`); endpoint cards reflect what's actually deployed.

Accessibility & responsiveness are built in: `aria-live` status region, decorative
layers `aria-hidden` and pointer-transparent, visible cyan focus rings, 44px+ touch
targets, `prefers-reduced-motion` support, and single-column mobile layouts that keep
every neon effect.

## Roadmap

See [`TTS-Build-Plan.md`](./TTS-Build-Plan.md) for the full phase-by-phase plan,
test matrix, and the 14-day mapping. Next up — **Phase 4**: the React product
screen (text input with live counts, language/voice selectors from
`/api/voices`, generate → blob → `<audio>`, download, error mapping) on top of
the design system.
