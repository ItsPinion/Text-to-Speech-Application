# Text-to-Speech Platform 🎙️⚡

Full-stack text-to-speech app: **React (Vite)** frontend + **Node.js / Express** backend.
API keys never leave the server. Built phase-by-phase per [`TTS-Build-Plan.md`](./TTS-Build-Plan.md).

**Aesthetic:** Vaporwave / Outrun terminal — neon magenta & cyan on the void. CRT scanlines included.

---

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 — Foundation & contracts | Monorepo, `.gitignore`, `.env.example`, frozen API contract | ✅ Done |
| 1 — Express skeleton & health | `GET /api/health`, JSON 404, CORS, helmet, Supertest | ✅ Done |
| 2 — Validation layer | `POST /api/tts` validation-only (400 / 501) | ⬜ |
| 3 — Mock TTS + voices | Binary `audio/mpeg` round-trip, voice catalog | ⬜ |
| 4 — React UI | Full Level-1 UX on mock audio | ⬜ |
| 5 — Real TTS provider | One vendor behind the same service interface | ⬜ |
| 6 — Hardening | Rate limit, logging, CORS allowlist | ⬜ |
| 7–9 — Level 2/3 & ship | Auth, history, files, deploy | ⬜ |

---

## Project structure

```
text-to-speech-application/
├── client/                 # React (Vite) — UI shell + design tokens
│   └── src/
│       ├── components/     # UI components (grows in Phase 4)
│       └── services/       # API client
├── server/                 # Express API
│   ├── src/
│   │   ├── app.js          # Express app (exported for Supertest)
│   │   ├── server.js       # Entry point — listens on PORT
│   │   ├── config/         # Env & constants
│   │   └── routes/         # Route modules (/api router)
│   └── tests/              # Jest + Supertest
├── docs/
│   └── API.md              # 🔒 FROZEN API contract (source of truth)
├── .env.example            # Environment template — copy to .env
└── TTS-Build-Plan.md       # The plan this repo is built from
```

## Prerequisites

- **Node.js ≥ 18** (developed on Node 22)
- npm

## Quickstart

```bash
# 1 — configure env (never commit .env)
cp .env.example .env

# 2 — API server → http://localhost:3000
cd server
npm install
npm run dev

# 3 — frontend → http://localhost:5173 (new terminal)
cd client
npm install
npm run dev
```

Open http://localhost:5173 — the terminal boot screen pings `GET /api/health`
and reports `STATUS: ONLINE` when the API is up. In dev the Vite server proxies
`/api` → `http://localhost:3000`, so no CORS setup is needed in the browser.

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

## API (Phase 1 surface)

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/health` | `200 { "status": "ok" }` |
| `GET` | anything else | `404 { "success": false, "error": "Not found" }` (JSON, never HTML) |

## Testing

```bash
# server — Jest + Supertest
cd server && npm test

# client — arrives with Phase 4 (Vitest + React Testing Library)
```

Phase 1 automated tests:

| ID | Case | Expected |
| --- | --- | --- |
| 1.1 | `GET /api/health` | `200`, body `{ "status": "ok" }` |
| 1.2 | `GET /api/does-not-exist` | `404` JSON, not HTML |
| 1.3 | Helmet headers present | `X-Content-Type-Options: nosniff`, etc. |

## Security rules

1. **API keys never leave the server** — the browser talks only to this API.
2. `.env` is git-ignored; `.env.example` ships with a blank `TTS_API_KEY=`.
3. Errors never echo vendor/key details.
