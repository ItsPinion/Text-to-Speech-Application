# TTS://TERMINAL — Text-to-Speech Platform

A text-to-speech platform built phase-by-phase from [`TTS-Build-Plan.md`](./TTS-Build-Plan.md),
on a **Turborepo** monorepo. Neon-drenched vaporwave UI on top of a production-shaped
Express API. **Rule #1: API keys never leave the server.**

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Foundation & contracts (monorepo, env, frozen API contract, limits) | ✅ Done |
| 1 | Express skeleton & health (`GET /api/health`, JSON 404, CORS, helmet) | ✅ Done |
| 2 | Validation layer (`POST /api/tts` rejects garbage, 501 on valid) | ⬜ Next |
| 3 | Mock TTS + audio response + `GET /api/voices` | ⬜ |
| 4 | React UI (input, counts, language/voice, player, download) | ⬜ |
| 5 | Real TTS provider behind the same interface | ⬜ |
| 6 | Hardening: rate limit, CORS allow-list, structured logs | ⬜ |
| 7–9 | Auth/history, advanced features, deploy | ⬜ |

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **API:** Node 20+, Express 5 (ESM), helmet, cors — tested with Vitest + Supertest
- **UI:** React 19, Vite 7, TypeScript, Tailwind CSS 4 (CSS-first design tokens)
- **Shared:** `@tts/shared` — the frozen contract (limits, envelopes, types) used by *both* apps

## Repo layout

The build plan's `client/` + `server/` map to `apps/*` (Turborepo convention):

```
.
├── apps/
│   ├── client/                 # React 19 + Vite + Tailwind 4 — vaporwave command deck
│   │   └── src/
│   │       ├── components/ui/       # Button, Card, Badge, TerminalWindow…
│   │       ├── components/system/   # CrtOverlay, Backdrop (grid + sun)
│   │       ├── hooks/               # useApiHealth — polls GET /api/health
│   │       ├── services/            # api.ts — the only module that knows the API origin
│   │       └── styles/globals.css   # 🎨 ALL design tokens (@theme) + atmosphere layers
│   └── server/                 # Express 5 API
│       ├── src/
│       │   ├── server.js            # entrypoint — listens (PORT/HOST from env)
│       │   ├── app.js               # app factory — helmet, CORS, /api, JSON 404, error handler
│       │   ├── config/env.js        # centralised env access with safe defaults
│       │   ├── routes/              # /api router (health today; tts/voices in Phases 2–3)
│       │   └── middleware/errors.js # contract-shaped JSON 404 + 500
│       └── tests/health.test.js     # Phase 1 suite (tests 1.1, 1.2)
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

- UI: http://localhost:5173 — the `SYS://HEALTH` panel polls `GET /api/health`
  and flips **ONLINE** when the API answers (Phase 1: "frontend can wait for
  backend readiness").
- API: http://localhost:3000/api/health

Other commands:

```bash
pnpm build     # type-check + build every app
pnpm test      # run every test suite (server: Vitest + Supertest)
```

## Locked decisions (Phase 0 — no TBDs)

| Decision | Value | Why |
| --- | --- | --- |
| Max text length | **4 000 characters** | Cheap, matches many TTS quotas |
| Default language | **`en-US`** | Widest voice coverage |
| Audio format | **MP3 (`audio/mpeg`)** | Plays everywhere, small files |
| Audio transport | **Binary stream** (`{ audioUrl }` optional later) | Phase 3 streams bytes; files can come in Phase 4+ |
| TTS provider (Level 1) | **Mock** (fixture MP3); real vendor in Phase 5 | No billing during early phases; CI needs no secrets |
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

### `GET /api/voices` — Phase 3

```json
// 200
{ "voices": [ { "id": "en-US-female-1", "name": "Aria", "language": "en-US", "gender": "female" } ] }
```

### `POST /api/tts` — Phase 2 (validation → 501), Phase 3 (audio)

```json
// request
{ "text": "Hello", "language": "en-US", "voice": "en-US-female-1" }
```

| Status | When | Body |
| --- | --- | --- |
| 200 | valid request (Phase 3+) | `audio/mpeg` bytes (binary stream) |
| 400 | empty/oversized text, unknown language, missing/unknown voice | `{"success":false,"error":"…"}` |
| 429 | rate limit exceeded (Phase 6, + `Retry-After`) | `{"success":false,"error":"Too many requests"}` |
| 503 | TTS provider unavailable/timeout (Phase 5+) | `{"success":false,"error":"TTS provider unavailable"}` |
| 501 | valid request during Phase 2 only | `{"success":false,"error":"TTS not implemented"}` |

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

Server suite (`apps/server/tests/`, Vitest + Supertest):

| ID | Phase | Test | Expected |
| --- | --- | --- | --- |
| 1.1 | 1 | `GET /api/health` | **200**, `{ "status": "ok" }`, JSON |
| 1.2 | 1 | `GET /api/does-not-exist` | **404**, contract JSON — never HTML |
| — | 1 | `DELETE /api/health` | **404** JSON |

Phase 2 adds the validation matrix (tests 2.1–2.8), Phase 3 the audio/voice tests,
Phase 4 the React Testing Library suite.

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
- **Live wiring**: `useApiHealth` polls `GET /api/health` through the Vite proxy —
  the `SYS://HEALTH` terminal shows status, latency, and check count;
  `SYS://SPEC` renders the frozen limits straight from `@tts/shared`.

Accessibility & responsiveness are built in: `aria-live` status region, decorative
layers `aria-hidden` and pointer-transparent, visible cyan focus rings, 44px+ touch
targets, `prefers-reduced-motion` support, and single-column mobile layouts that keep
every neon effect.

## Roadmap

See [`TTS-Build-Plan.md`](./TTS-Build-Plan.md) for the full phase-by-phase plan,
test matrix, and the 14-day mapping. Next up — **Phase 2**: `POST /api/tts`
validation with the frozen limits from `@tts/shared`.
