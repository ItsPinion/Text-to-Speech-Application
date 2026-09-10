# Text-to-Speech Platform 🎙️⚡

Full-stack text-to-speech app: **React (Vite)** frontend + **Node.js / Express** backend,
managed as a **Turborepo monorepo** (npm workspaces, single root lockfile).
API keys never leave the server. Built phase-by-phase per [`TTS-Build-Plan.md`](./TTS-Build-Plan.md).

**Aesthetic:** Vaporwave / Outrun terminal — neon magenta & cyan on the void. CRT scanlines included.

---

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 — Foundation & contracts | Monorepo, `.gitignore`, `.env.example`, frozen API contract | ✅ Done |
| 1 — Express skeleton & health | `GET /api/health`, JSON 404, CORS, helmet, Supertest | ✅ Done |
| 2 — Validation layer | `POST /api/tts` validates: text/length/language/voice (400s) | ✅ Done |
| 3 — Mock TTS + voices | Binary `audio/mpeg` round-trip, 8-voice catalog | ✅ Done |
| 4 — React UI | Full Level-1 UX on mock audio | ✅ Done |
| 5 — Real TTS provider | One vendor behind the same service interface | ⬜ |
| 6 — Hardening | Rate limit, logging, CORS allowlist | ⬜ |
| 7–9 — Level 2/3 & ship | Auth, history, files, deploy | ⬜ |

---

## Project structure

```
text-to-speech-application/
├── turbo.json              # Turborepo task graph (dev / build / test)
├── package.json            # npm workspaces: client + server, single lockfile
├── client/                 # workspace: tts-client — React (Vite) vaporwave UI
│   └── src/
│       ├── components/     # Button, TerminalWindow, TextInput, selectors, player, errors
│       ├── services/       # API client (blob transport for /api/tts)
│       ├── utils/          # text stats, language labels
│       └── test/           # Vitest + RTL setup
├── server/                 # workspace: tts-server — Express API
│   ├── src/
│   │   ├── app.js          # Express app (exported for Supertest)
│   │   ├── server.js       # Entry point — listens on PORT
│   │   ├── config/         # Env & constants (frozen limits)
│   │   ├── constants.js    # MAX_TEXT_LENGTH, DEFAULT_LANGUAGE, ...
│   │   ├── data/           # Voice catalog (single source for allow-list)
│   │   ├── validation/     # validateTtsRequest — pure, unit-testable
│   │   ├── middleware/     # requireJson (415 guard)
│   │   ├── controllers/    # tts controller
│   │   ├── services/       # ttsService port + providers/ (mock now, vendor in Phase 5)
│   │   └── routes/         # /api router: health, voices, tts
│   ├── fixtures/           # beep.mp3 — mock provider audio
│   ├── scripts/            # protocol-battery.mjs — live Postman-equivalent checks
│   └── tests/              # Jest + Supertest (24 tests)
├── docs/
│   ├── API.md              # 🔒 FROZEN API contract (source of truth)
│   └── TEST-REPORT.md      # Phase 0–3 test campaign evidence
├── .env.example            # Environment template — copy to .env
└── TTS-Build-Plan.md       # The plan this repo is built from
```

## Prerequisites

- **Node.js ≥ 18** (developed on Node 22)
- npm

## Quickstart

```bash
# 0 — configure env (never commit .env)
cp .env.example .env

# 1 — install EVERYTHING (npm workspaces: one root node_modules + lockfile)
npm install

# 2 — start EVERYTHING (API :3000 + frontend :5173) via Turborepo
npm run dev
```

`npm run dev` runs `turbo run dev`: both workspace `dev` tasks in parallel,
output prefixed per workspace (`tts-server:dev:` / `tts-client:dev:`), and
Ctrl-C tears down both. The API runs under `node --watch` (backend edits
hot-reload); the frontend runs Vite with HMR. In dev the Vite server proxies
`/api` → `http://localhost:3000`, so no CORS setup is needed in the browser.
Turbo also caches `build`/`test` — unchanged packages replay instantly
(`>>> FULL TURBO`).

<details>
<summary>Per-workspace & production commands</summary>

```bash
npm run dev:server        # API only  → http://localhost:3000
npm run dev:client        # web only  → http://localhost:5173

npm run build             # turbo: client production build (client/dist)
npm start                 # production API start (tts-server)

npm test                  # turbo: server suite + client suite (parallel)
npm run test:server       # Jest + Supertest only
npm run test:client       # Vitest + RTL only

# live protocol battery (Postman-equivalent; API must be running)
node server/scripts/protocol-battery.mjs
```
</details>

Open http://localhost:5173 — the terminal workspace pings `GET /api/health`
and shows `UPLINK: ONLINE` in the status bar when the API is reachable.

## Environment variables

Copy `.env.example` → `.env`. **Never commit a real `.env`.**

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | server | `3000` | Express listen port |
| `NODE_ENV` | server | `development` | `development` / `production` / `test` |
| `CLIENT_ORIGIN` | server | `http://localhost:5173` | CORS allowlist (Vite dev origin) |
| `TTS_PROVIDER` | server | `mock` | `mock` = fixture audio, no billing (real vendor in Phase 5) |
| `TTS_API_KEY` | server | *(blank)* | Vendor key — **server-side only, never in the client bundle** |
| `TTS_REGION` | server | *(blank)* | Vendor region if required |
| `VITE_API_URL` | client | *(blank)* | Absolute API base for production; blank in dev (proxy handles it) |

## Locked limits (no TBDs)

| Decision | Value |
| --- | --- |
| **Max text length** | 4 000 characters |
| **Default language** | `en-US` |
| **Audio format** | MP3 — `audio/mpeg` |
| **Audio transport** | Binary stream (Phase 3) or `{ audioUrl }` (Phase 4+) |
| **Rate limit** | 10 TTS requests / IP / 15 min (enforced Phase 6) |
| **TTS provider (Level 1)** | Mock in tests/CI; one real vendor from Phase 5 |

Full request/response shapes live in the frozen contract: [`docs/API.md`](./docs/API.md).

## API (live surface)

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/health` | `200 { "status": "ok" }` |
| `GET` | `/api/voices` | `200 { "success": true, "voices": [...] }` — 8 voices / 6 languages |
| `POST` | `/api/tts` | valid → `200 audio/mpeg` binary MP3 · invalid → `400/415` JSON envelope |
| `GET` | anything else | `404 { "success": false, "error": "Not found" }` (JSON, never HTML) |

Request: `{ "text": "Hello", "language": "en-US", "voice": "en-US-female-1" }` —
all shapes frozen in [`docs/API.md`](./docs/API.md).

## Features (Level 1)

- Live character (max **4 000**) + word counts while you type
- Language → voice cascading selectors driven by `GET /api/voices`
- Generate → streamed MP3 played by a native `<audio>` element
- One-click download as `speech.mp3`
- Human-mapped errors: 400 (server validation text), 429, 5xx, offline

## Testing

```bash
# both suites, parallel, turbo-orchestrated (33 tests total)
npm test

# or per workspace
npm run test:server   # Jest + Supertest (24 tests: phases 1–3)
npm run test:client   # Vitest + React Testing Library (9 tests: plan cases 4.1–4.9)
```

Covered per the plan's test matrices:

| Phase | Cases |
| --- | --- |
| 1 | health 200 · JSON 404 · helmet/CORS/malformed-JSON guards |
| 2 | empty/whitespace/4001-char text, missing voice, bad language, text/plain → 415, envelope shape |
| 3 | voices list shape · valid TTS → 200 `audio/mpeg` · unknown voice · voice/language mismatch · hi-IN round-trip |
| 4 | disabled-when-empty · live counts · 4000-clamp · language filters+resets voices · voices failure · TTS 200/400/offline · download attrs |

## Security rules

1. **API keys never leave the server** — the browser talks only to this API.
2. `.env` is git-ignored; `.env.example` ships with a blank `TTS_API_KEY=`.
3. Errors never echo vendor/key details.
