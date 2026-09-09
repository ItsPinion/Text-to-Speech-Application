# 🔊 Text-to-Speech Studio

A full-stack text-to-speech application — **React (Vite)** client, **Node.js + Express** server, and a swappable TTS provider behind a server-side port. API keys never leave the server.

**Current status: ✅ Phase 7 + neural voices — auth, history, favorites & offline human-sounding speech.**
The full product loop works against the live API: type text (live counts) → pick language & voice from the catalog → **Generate** → play the MP3 in the browser → download it. Speech needs **no credit card and no account**: the default **Piper** provider (`TTS_PROVIDER=piper`) runs **neural VITS voices fully offline** — English (US/GB), Hindi, Spanish and French sound like recorded humans; Telugu & Tamil (no neural models exist yet) and any voice whose model files haven't been fetched fall back to the bundled eSpeak-NG engine automatically. A **Google Cloud TTS** adapter is also wired (`TTS_PROVIDER=google` + key). The frontend needed only a cosmetic change (a ⚡ neural badge): the proof the Phase 3 port was correct.
Now hardened: **rate limit** (10 generations / IP / 15 min → `429` + `Retry-After`), **CORS allowlist** from `CLIENT_ORIGIN`, and **request-id structured logging** that records text *length* only — never content, never secrets.
And multi-user: **create an account**, keep a **history** of every generation (replay + download from the server, no re-synthesis), and **★ favorite voices**. Auth is optional — anonymous generation works exactly as before (documented plan choice for 7.7).

## What works right now

| Route / screen | Status | Behavior |
| --- | --- | --- |
| **Web app** (`localhost:5173`) | ✅ | text input w/ counts · language/voice selectors · generate (spinner) · `<audio>` player · download · error mapping |
| `GET /api/health` | ✅ | `200 { "status": "ok" }` |
| `GET /api/contract` | ✅ | machine-readable frozen contract |
| `GET /api/voices` | ✅ | 16 voices across 8 languages + `engine`/`quality` per voice + active `provider` |
| `POST /api/tts` | ✅ | validates → `200 audio/mpeg` (neural Piper speech by default) · `400`/`415` on bad input · `500` on vendor auth failure · `503` on vendor timeout/down |
| **TTS provider port** | ✅ | `piper` (**neural, offline, free** — default) · `espeak` (classic, all 8 languages) · `mock` (CI-safe) · `google` (neural, needs key) via `TTS_PROVIDER`; keys stay server-side |
| **Hardening** | ✅ | rate limit `429` + `Retry-After` + `RateLimit-*` · CORS allowlist (no ACAO for foreign origins) · request-id + JSON logs (`textChars` only) |
| **Accounts (JWT)** | ✅ | `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` — scrypt passwords, HS256 tokens (24 h), brute-force limiter |
| **History** | ✅ | authenticated `POST /api/tts` saves every generation (SQLite row + `uploads/<uuid>.mp3`); `GET /api/history` · `DELETE /api/history/:id` (own rows only) |
| **Favorites** | ✅ | `GET/POST/DELETE /api/favorites` — ★ in the voice selector, favorites-only filter |

## Project layout

```
Text-to-Speech-Application/
├── client/                        # React UI (Vite dev server on :5173)
│   ├── src/
│   │   ├── App.jsx                 # orchestrates the studio (spec §32 flow)
│   │   ├── services/api.js         # getVoices() + synthesizeSpeech() — only place fetch lives
│   │   ├── components/
│   │   │   ├── TextInput.jsx       # textarea, live char+word count, 4000 cap, clear
│   │   │   ├── LanguageSelector.jsx# unique languages from /api/voices
│   │   │   ├── VoiceSelector.jsx   # voices filtered by language; ⚡ neural badge + ★ favorites
│   │   │   ├── GenerateButton.jsx  # POST /api/tts, spinner, disabled in flight
│   │   │   ├── AudioPlayer.jsx     # <audio controls src={blobUrl}>
│   │   │   ├── DownloadButton.jsx  # <a download="speech.mp3"> from same blob
│   │   │   ├── ErrorMessage.jsx    # 400/429/503/network → human text
│   │   │   ├── EndpointCard.jsx     # contract renderer
│   │   │   ├── AuthPanel.jsx        # login / register / logout (Phase 7)
│   │   │   └── HistoryPanel.jsx     # replay + download + delete (Phase 7)
│   │   ├── __tests__/App.test.jsx  # RTL — 16 tests (plan 4.1–4.9, 7.7 + extras)
│   │   └── test/setup.js           # jest-dom matchers + blob-URL stub
│   └── vite.config.js              # dev proxy /api → :3000 + vitest config
├── server/                         # Express API (listens on :3000)
│   ├── server.js                   # entry point (only file that listens)
│   ├── data/tts.db                  # SQLite DB (users, generations, favorites) — git-ignored
│   ├── uploads/                     # saved generation MP3s (UUID names) — git-ignored
│   ├── fixtures/beep.mp3           # mock TTS output — short "ding-dong" (3.9 KB)
│   ├── src/
│   │   ├── loadEnv.js              # loads .env (server only — tests never load it)
│   │   ├── db.js                   # SQLite layer (node:sqlite) + schema + helpers
│   │   ├── auth.js                 # scrypt passwords, HS256 JWT, requireAuth/optionalAuth
│   │   ├── app.js                  # hardening (logs, CORS, rate limit) + routes + errors
│   │   ├── contract.js             # ❄️ frozen contract, served at /api/contract
│   │   ├── constants.js            # limits; allow-list derived from catalog
│   │   ├── voiceCatalog.js         # 16 voices / 8 languages (+ engine/quality per voice)
│   │   ├── validation.js           # pure validateTtsPayload()
│   │   ├── services/ttsService.js  # provider port: env-based selection (mock ↔ piper ↔ espeak ↔ google)
│   │   ├── services/providers/
│   │   │   ├── errors.js           # shared ProviderError (500|503 mapping)
│   │   │   ├── mock.js             # fixture beep (CI/test default)
│   │   │   ├── espeak.js           # eSpeak-NG WASM — real speech, offline (also Piper's phonemizer)
│   │   │   ├── piper.js            # neural VITS (Piper models via onnxruntime-node) — offline
│   │   │   └── google.js           # Google Cloud TTS REST adapter
│   │   ├── audio/pcmToMp3.js        # PCM → MP3 encoder (lamejs)
│   │   └── routes/                 # health, voices, tts, auth, history, favorites, audio
│   ├── scripts/fetch-piper-models.sh # one-time download of the 9 neural voice models (~560 MB)
│   │   ├── .cache/piper-models/      # the .onnx models + configs — git-ignored
│   └── tests/                      # Vitest + Supertest — 102 tests
├── .env.example                    # template for env vars (copy to .env)
├── .gitignore
├── TTS-Build-Plan.md               # the phase-by-phase build plan
└── README.md
```

## Quick start

Requires **Node 20.19+** (or 22.12+).

```bash
# install (two terminals, or run each in a tab)
cd server && npm install
cd client && npm install

# environment (no keys needed, ever, for offline providers)
cp .env.example .env

# optional but recommended: fetch the neural voice models (~560 MB, one-time)
bash server/scripts/fetch-piper-models.sh

# run the API server          → http://localhost:3000
cd server && npm run dev

# run the web app (new tab)   → http://localhost:5173
cd client && npm run dev

# run the automated tests
cd server && npm test     # Vitest + Supertest — 30 tests
cd client && npm test     # Vitest + RTL — 11 tests
```

## The studio (spec §32)

```
1. App mounts → GET /api/voices → fill language + voice selectors
2. User types → counts update (client-side, capped at 4,000)
3. Generate  → POST /api/tts → blob → URL.createObjectURL → <audio>
4. Download  → same object URL, <a download="speech.mp3">
5. Editing text clears the previous audio (simple + predictable)
```

Error mapping (`ErrorMessage.jsx`): `400` shows the server's validation sentence · `429` → "limit is 10 generations per 15 minutes" · `503` → "temporarily unavailable" · network → "cannot reach the server".

Keyboard order follows DOM order (manual test 4.12): **textarea → language → voice → generate → player**. Layout is responsive down to 375 px (4.11).

## TTS providers (Phase 5)

All providers implement the same port — `synthesize({ text, language, voice }) → Promise<Buffer>` (MP3 bytes) — selected by `TTS_PROVIDER` in `.env` (read per call):

| Provider | Real speech? | Needs key? | Needs network? | Quality |
| --- | --- | --- | --- | --- |
| **`piper`** *(default)* | ✅ **neural, 12 voices** | **no** | **no** (one-time model download) | **human-sounding VITS** |
| `espeak` | ✅ **all 8 languages** | **no** | **no** | classic eSpeak (robotic, intelligible) |
| `mock` | ❌ (fixture beep) | no | no | — |
| `google` | ✅ neural | yes (`TTS_API_KEY`) | yes | natural |

### Real speech without a credit card — `TTS_PROVIDER=espeak`

The eSpeak-NG engine runs **in-process via WebAssembly** (`@echogarden/espeak-ng-emscripten`): no account, no API key, no network, no billing — and it covers every catalog language, including Telugu, Tamil and Hindi. Voices differ by gender for each language.

```bash
cp .env.example .env
# edit .env:  TTS_PROVIDER=espeak
cd server && npm run dev
# health: { "status": "ok", "tts": { "provider": "espeak", "configured": true } }
```

Voice mapping (`providers/espeak.js`): `en-US` → `en-us`, `en-GB` → `en-gb-x-rp`, `en-IN` → `en` (eSpeak has no Indian-English voice), `hi-IN` → `hi`, `te-IN` → `te`, `ta-IN` → `ta`, `es-ES` → `es`, `fr-FR` → `fr`; catalog gender → eSpeak gender (1=male, 2=female). The engine emits 22 050 Hz mono PCM, encoded to MP3 server-side with `lamejs` (`services/audio/pcmToMp3.js`).

Note: eSpeak-NG is **GPL-3.0** — fine for this project; keep it in mind if you ever ship a closed-source product (swap providers, same port).

### Human-sounding neural speech, still offline — `TTS_PROVIDER=piper` (the default)

**Piper** voice models (VITS architecture, from the OHF-Voice / Piper project) run in-process via `onnxruntime-node` on the CPU — ~0.2–0.7 s per sentence, no key, no account, no network after a one-time model download. 12 of the 16 catalog voices are neural (English US/GB ×2 each, en-IN on US models, Hindi ×2, Spanish ×2 via one two-speaker model, French ×2); Telugu and Tamil have no Piper voices and fall back to eSpeak automatically (the same fallback covers missing model files, with a one-time console warning — the API never hard-fails over it).

```bash
# one-time: fetch the ~560 MB of models (git protocol; works on locked-down networks)
bash server/scripts/fetch-piper-models.sh
# .env:  TTS_PROVIDER=piper   (already the default in .env.example)
cd server && npm run dev
# health: { "status": "ok", "tts": { "provider": "piper", "configured": true } }
```

The pipeline (`providers/piper.js`, a faithful re-implementation of Piper's phonemize.cpp + Echogarden's VitsTTS reference): text → eSpeak-NG **Kirshenbaum phonemes** (WASM, using each model's *own* espeak voice) → `phoneme_id_map` ids with `^…# 🔊 Text-to-Speech Studio

A full-stack text-to-speech application — **React (Vite)** client, **Node.js + Express** server, and a swappable TTS provider behind a server-side port. API keys never leave the server.

**Current status: ✅ Phase 7 + neural voices — auth, history, favorites & offline human-sounding speech.**
The full product loop works against the live API: type text (live counts) → pick language & voice from the catalog → **Generate** → play the MP3 in the browser → download it. Speech needs **no credit card and no account**: the default **Piper** provider (`TTS_PROVIDER=piper`) runs **neural VITS voices fully offline** — English (US/GB), Hindi, Spanish and French sound like recorded humans; Telugu & Tamil (no neural models exist yet) and any voice whose model files haven't been fetched fall back to the bundled eSpeak-NG engine automatically. A **Google Cloud TTS** adapter is also wired (`TTS_PROVIDER=google` + key). The frontend needed only a cosmetic change (a ⚡ neural badge): the proof the Phase 3 port was correct.
Now hardened: **rate limit** (10 generations / IP / 15 min → `429` + `Retry-After`), **CORS allowlist** from `CLIENT_ORIGIN`, and **request-id structured logging** that records text *length* only — never content, never secrets.
And multi-user: **create an account**, keep a **history** of every generation (replay + download from the server, no re-synthesis), and **★ favorite voices**. Auth is optional — anonymous generation works exactly as before (documented plan choice for 7.7).

## What works right now

| Route / screen | Status | Behavior |
| --- | --- | --- |
| **Web app** (`localhost:5173`) | ✅ | text input w/ counts · language/voice selectors · generate (spinner) · `<audio>` player · download · error mapping |
| `GET /api/health` | ✅ | `200 { "status": "ok" }` |
| `GET /api/contract` | ✅ | machine-readable frozen contract |
| `GET /api/voices` | ✅ | 16 voices across 8 languages + `engine`/`quality` per voice + active `provider` |
| `POST /api/tts` | ✅ | validates → `200 audio/mpeg` (neural Piper speech by default) · `400`/`415` on bad input · `500` on vendor auth failure · `503` on vendor timeout/down |
| **TTS provider port** | ✅ | `piper` (**neural, offline, free** — default) · `espeak` (classic, all 8 languages) · `mock` (CI-safe) · `google` (neural, needs key) via `TTS_PROVIDER`; keys stay server-side |
| **Hardening** | ✅ | rate limit `429` + `Retry-After` + `RateLimit-*` · CORS allowlist (no ACAO for foreign origins) · request-id + JSON logs (`textChars` only) |
| **Accounts (JWT)** | ✅ | `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` — scrypt passwords, HS256 tokens (24 h), brute-force limiter |
| **History** | ✅ | authenticated `POST /api/tts` saves every generation (SQLite row + `uploads/<uuid>.mp3`); `GET /api/history` · `DELETE /api/history/:id` (own rows only) |
| **Favorites** | ✅ | `GET/POST/DELETE /api/favorites` — ★ in the voice selector, favorites-only filter |

## Project layout

```
Text-to-Speech-Application/
├── client/                        # React UI (Vite dev server on :5173)
│   ├── src/
│   │   ├── App.jsx                 # orchestrates the studio (spec §32 flow)
│   │   ├── services/api.js         # getVoices() + synthesizeSpeech() — only place fetch lives
│   │   ├── components/
│   │   │   ├── TextInput.jsx       # textarea, live char+word count, 4000 cap, clear
│   │   │   ├── LanguageSelector.jsx# unique languages from /api/voices
│   │   │   ├── VoiceSelector.jsx   # voices filtered by selected language
│   │   │   ├── GenerateButton.jsx  # POST /api/tts, spinner, disabled in flight
│   │   │   ├── AudioPlayer.jsx     # <audio controls src={blobUrl}>
│   │   │   ├── DownloadButton.jsx  # <a download="speech.mp3"> from same blob
│   │   │   ├── ErrorMessage.jsx    # 400/429/503/network → human text
│   │   │   ├── EndpointCard.jsx     # contract renderer
│   │   │   ├── AuthPanel.jsx        # login / register / logout (Phase 7)
│   │   │   └── HistoryPanel.jsx     # replay + download + delete (Phase 7)
│   │   ├── __tests__/App.test.jsx  # RTL — 16 tests (plan 4.1–4.9, 7.7 + extras)
│   │   └── test/setup.js           # jest-dom matchers + blob-URL stub
│   └── vite.config.js              # dev proxy /api → :3000 + vitest config
├── server/                         # Express API (listens on :3000)
│   ├── server.js                   # entry point (only file that listens)
│   ├── data/tts.db                  # SQLite DB (users, generations, favorites) — git-ignored
│   ├── uploads/                     # saved generation MP3s (UUID names) — git-ignored
│   ├── fixtures/beep.mp3           # mock TTS output — short "ding-dong" (3.9 KB)
│   ├── src/
│   │   ├── loadEnv.js              # loads .env (server only — tests never load it)
│   │   ├── db.js                   # SQLite layer (node:sqlite) + schema + helpers
│   │   ├── auth.js                 # scrypt passwords, HS256 JWT, requireAuth/optionalAuth
│   │   ├── app.js                  # hardening (logs, CORS, rate limit) + routes + errors
│   │   ├── contract.js             # ❄️ frozen contract, served at /api/contract
│   │   ├── constants.js            # limits; allow-list derived from catalog
│   │   ├── voiceCatalog.js         # 16 voices / 8 languages
│   │   ├── validation.js           # pure validateTtsPayload()
│   │   ├── services/ttsService.js  # provider port: env-based selection (mock ↔ google)
│   │   ├── services/providers/
│   │   │   ├── errors.js           # shared ProviderError (500|503 mapping)
│   │   │   ├── mock.js             # fixture beep (CI/test default)
│   │   │   ├── espeak.js           # eSpeak-NG WASM — real speech, offline
│   │   │   └── google.js           # Google Cloud TTS REST adapter
│   │   ├── audio/pcmToMp3.js        # PCM → MP3 encoder (lamejs)
│   │   └── routes/                 # health, voices, tts, auth, history, favorites, audio
│   └── tests/                      # Vitest + Supertest — 86 tests
├── .env.example                    # template for env vars (copy to .env)
├── .gitignore
├── TTS-Build-Plan.md               # the phase-by-phase build plan
└── README.md
```

## Quick start

Requires **Node 20.19+** (or 22.12+).

```bash
# install (two terminals, or run each in a tab)
cd server && npm install
cd client && npm install

# environment (no keys needed until Phase 5)
cp .env.example .env

# run the API server          → http://localhost:3000
cd server && npm run dev

# run the web app (new tab)   → http://localhost:5173
cd client && npm run dev

# run the automated tests
cd server && npm test     # Vitest + Supertest — 30 tests
cd client && npm test     # Vitest + RTL — 11 tests
```

## The studio (spec §32)

```
1. App mounts → GET /api/voices → fill language + voice selectors
2. User types → counts update (client-side, capped at 4,000)
3. Generate  → POST /api/tts → blob → URL.createObjectURL → <audio>
4. Download  → same object URL, <a download="speech.mp3">
5. Editing text clears the previous audio (simple + predictable)
```

Error mapping (`ErrorMessage.jsx`): `400` shows the server's validation sentence · `429` → "limit is 10 generations per 15 minutes" · `503` → "temporarily unavailable" · network → "cannot reach the server".

Keyboard order follows DOM order (manual test 4.12): **textarea → language → voice → generate → player**. Layout is responsive down to 375 px (4.11).

## TTS providers (Phase 5)

All providers implement the same port — `synthesize({ text, language, voice }) → Promise<Buffer>` (MP3 bytes) — selected by `TTS_PROVIDER` in `.env` (read per call):

| Provider | Real speech? | Needs key? | Needs network? | Quality |
| --- | --- | --- | --- | --- |
| **`piper`** *(default)* | ✅ **neural, 12 voices** | **no** | **no** (one-time model download) | **human-sounding VITS** |
| `espeak` | ✅ **all 8 languages** | **no** | **no** | classic eSpeak (robotic, intelligible) |
| `mock` | ❌ (fixture beep) | no | no | — |
| `google` | ✅ neural | yes (`TTS_API_KEY`) | yes | natural |

### Real speech without a credit card — `TTS_PROVIDER=espeak`

The eSpeak-NG engine runs **in-process via WebAssembly** (`@echogarden/espeak-ng-emscripten`): no account, no API key, no network, no billing — and it covers every catalog language, including Telugu, Tamil and Hindi. Voices differ by gender for each language.

```bash
cp .env.example .env
# edit .env:  TTS_PROVIDER=espeak
cd server && npm run dev
# health: { "status": "ok", "tts": { "provider": "espeak", "configured": true } }
```

Voice mapping (`providers/espeak.js`): `en-US` → `en-us`, `en-GB` → `en-gb-x-rp`, `en-IN` → `en` (eSpeak has no Indian-English voice), `hi-IN` → `hi`, `te-IN` → `te`, `ta-IN` → `ta`, `es-ES` → `es`, `fr-FR` → `fr`; catalog gender → eSpeak gender (1=male, 2=female). The engine emits 22 050 Hz mono PCM, encoded to MP3 server-side with `lamejs` (`services/audio/pcmToMp3.js`).

Note: eSpeak-NG is **GPL-3.0** — fine for this project; keep it in mind if you ever ship a closed-source product (swap providers, same port).

 markers → VITS ONNX session (`input`/`input_lengths`/`scales`/`sid`) → float32 waveform at the model's sample rate → MP3 via the shared lamejs encoder. Models live in `server/.cache/piper-models/` (git-ignored); `PIPER_MODELS_DIR` overrides the location. Voice models are MIT-licensed (Piper / LibriTTS & friends).

### Google Cloud TTS (neural) — `TTS_PROVIDER=google`

For natural voices later: enable "Cloud Text-to-Speech API" in Google Cloud Console, create an API key, set `TTS_PROVIDER=google` + `TTS_API_KEY` in `.env`, restart. Catalog ids map through the catalog entry itself: `hi-IN-female-1` → `{ languageCode: "hi-IN", ssmlGender: "FEMALE" }` — all 8 languages work without hardcoding vendor voice names. The key is sent in the `x-goog-api-key` header (never a URL), lives only in `.env`, and never reaches the client bundle.

**Error mapping** (all providers): missing key / vendor `401/403` / engine init failure → **500** `TTS provider authentication failed` · timeout (30 s, `TTS_TIMEOUT_MS`) / network / vendor 5xx / no audio → **503** `TTS provider unavailable`. Details go to the server log only; secrets never appear in responses, logs, or the client bundle (verified: bundle grep for `TTS_API_KEY` → **zero** matches, plan test 5.6).

## Accounts, history & favorites (Phase 7 — Level 2)

**Data:** SQLite via built-in `node:sqlite` — zero external services, same SQL as the plan's PostgreSQL schema (swap the driver on deploy). File: `server/data/tts.db` (git-ignored).

**Auth:** JWT HS256 hand-rolled on `node:crypto` (no auth dependency) + scrypt password hashing with per-user salts and constant-time compares. Tokens live 24 h (`TOKEN_TTL_HOURS`); set `JWT_SECRET` in production (random per-process secret with a warning when unset). Login errors are generic — no account enumeration. A separate 20/15-min rate limiter guards `/api/auth/*`.

**History:** authenticated `POST /api/tts` responses are unchanged (streamed `audio/mpeg`), but the server also stores `uploads/<uuid>.mp3` + a `generations` row. `GET /api/history` lists them (newest first); `DELETE /api/history/:id` removes the row AND file — ownership enforced in SQL, so user A touching user B's id gets `404` (chosen over 403 to avoid confirming existence; plan allows either).

**Audio serving:** `GET /api/audio/<uuid>.mp3` — UUID filenames act as unguessable capability URLs (documented tradeoff: public but practically unenumerable; strict pattern check prevents path traversal).

**The documented choice for plan 7.7:** generation does NOT require login — anonymous users get the full studio; signed-in users additionally build a history and can favorite voices.

## Tests

### Server — `cd server && npm test` (102 passing)

| Plan ID | Test | Result |
| --- | --- | --- |
| 1.1–1.2 | health 200 `{status:"ok"}` · unknown route 404 JSON | ✅ |
| 2.1–2.7 | all validation cases (empty/whitespace/4001/no-voice/xx-ZZ → 400; text/plain → 415) | ✅ |
| 3.1–3.6 | voices catalog · 200 `audio/mpeg` · fixture byte-equality · unknown voice 400 · mismatch 400 · regressions | ✅ |
| + | provider failure 503 · catalog sanity · oversized 413 · malformed JSON 400 | ✅ |
| 5.1 | `TTS_PROVIDER=mock` — full round trip still 200 audio (CI rule) | ✅ |
| 5.2/5.3/5.7 (offline equivalent) | **eSpeak engine, for real**: English MP3 scales with text · Telugu & Hindi scripts synthesize · female ≠ male voice bytes · all 8 catalog languages produce audio | ✅ |
| + | espeak provider via route (200 `audio/mpeg`, `X-TTS-Provider: espeak`) · health reports espeak configured · PCM→MP3 encoder unit test | ✅ |
| + (piper) | provider selection · health configured · voices expose engine/quality + active provider | ✅ |
| + (piper) | phoneme→id encoding: ^/$ markers, _ separators, word/phrase breaks, ?/! endings, unmapped chars skipped, empty → null (pure unit tests) | ✅ |
| + (piper) | registry ↔ catalog coherence: 12 neural voices have models, te/ta stay classic | ✅ |
| + (piper) | eSpeak fallback: te-IN via piper provider still 200 MP3 (warned); missing model files → fallback too | ✅ |
| + (piper) | **real VITS** (models on disk): English scales with text · Devanagari Hindi · Spanish male≠female (two-speaker model) · POST /api/tts end-to-end | ✅ *(auto-skip without models)* |
| 5.4 | wrong key (stubbed vendor 403) → **500**, body contains no key; google without key → 500 | ✅ |
| 5.5 | vendor timeout stub (AbortError) → **503** "TTS provider unavailable" | ✅ |
| + | selection (default/mock/google/unknown→mock) · request shape (languageCode + ssmlGender + MP3, key in header only) · vendor 429/500/no-audio → 503 · health reports provider w/o secrets | ✅ |
| 5.2/5.3/5.7 (Google) | real-key integration against Google | ⏳ needs `TTS_API_KEY` — all wiring verified with the vendor HTTP layer stubbed; real-speech criteria are covered by the eSpeak suite above |
| 6.1 | 11th POST /api/tts from one IP → **429** + `Retry-After` + `RateLimit-*` headers, contract body | ✅ |
| 6.2 | health & voices never rate-limited (12 TTS then health 200) | ✅ |
| 6.3 | disallowed origin → **no** `Access-Control-Allow-Origin`; allowed origin echoed; multi-origin `CLIENT_ORIGIN`; evil preflight blocked; 429 keeps CORS for allowed origins | ✅ |
| 6.4 | logs: request id + status + `textChars` length only — never content, never keys | ✅ |
| + | only POST burns quota (GET on the path doesn't) · invalid requests count toward the limit · `X-Request-Id` on every response | ✅ |
| 6.5 | regression: Phases 1–5 suites all still green | ✅ |
| 7.1 | duplicate email register → **409** | ✅ |
| 7.2 | login bad password → **401** (same message for unknown email — no enumeration) | ✅ |
| 7.3 | `GET /api/history` without token → **401** | ✅ |
| 7.4 | user A deletes user B's id → **404**; B's row untouched | ✅ |
| 7.5 | TTS with token → history row; `audioUrl` fetchable **200** with byte-identical audio | ✅ |
| 7.6 | favorite unknown voice → **400** | ✅ |
| 7.7 | anonymous Generate keeps working — no `Authorization` header sent (RTL) | ✅ |
| 7.8 | histories isolated per user (automated two-user test + manual) | ✅ |
| + | register validation (400s) · forged/expired/wrong-secret tokens → 401 · scrypt hashes never store plaintext · favorites idempotent + per-user · owner delete removes file, second delete 404 · path traversal → 404 · anonymous TTS saves nothing | ✅ |

### Client — `cd client && npm test` (16 passing)

| Plan ID | Test | Result |
| --- | --- | --- |
| 4.1 | empty textarea → Generate disabled, zero TTS network calls | ✅ |
| 4.2 | `"Hello world"` → 11 characters, 2 words | ✅ |
| 4.3 | paste 4,001 chars → capped at 4,000 | ✅ |
| 4.4 | change language → voice list filters, voice resets | ✅ |
| 4.5 | voices API failure → ErrorMessage visible, Generate disabled | ✅ |
| 4.6 | TTS 200 blob → `<audio>` with `blob:` src | ✅ |
| 4.7 | TTS 400 → error text parsed from JSON | ✅ |
| 4.8 | network offline → "Network failure" message | ✅ |
| 4.9 | download link has `download` attr + blob href | ✅ |
| + | editing text clears previous audio · request body is trimmed & correct | ✅ |
| 7.7 | logged-out Generate works anonymously (asserts NO Authorization header) | ✅ |
| P7 | login flow → signed in, token stored, `Authorization` on later calls, history loads | ✅ |
| P7 | login failure shows inline error, stays signed out | ✅ |
| P7 | history renders players + downloads; delete removes the row via `DELETE` | ✅ |
| P7 | ★ star toggles favorites (signed out has none); favorites-only filter narrows the list | ✅ |

### Manual (4.10–4.12)

- **4.10 happy path:** verified live — beep plays, file downloads (also `curl -o out.mp3` byte-checks against the fixture)
- **4.11 responsive 375 px:** flex/wrap layout, no horizontal scroll
- **4.12 keyboard order:** DOM order = textarea → language → voice → generate → player

## ❄️ API contract (frozen at Phase 0)

Machine-readable source of truth: [`server/src/contract.js`](server/src/contract.js), served at `GET /api/contract`.

### `POST /api/tts` — convert text to speech

```json
// request
{ "text": "Hello", "language": "en-US", "voice": "en-US-female-1" }
```

| Field | Type | Rules |
| --- | --- | --- |
| `text` | string | **required**, 1–4,000 characters after trim |
| `language` | string | **required**, must be in the allow-list |
| `voice` | string | **required**, voice `id` from `GET /api/voices`, must speak `language` |

| Status | Body | When |
| --- | --- | --- |
| **200** | binary `audio/mpeg` | speech generated |
| **400** | `{ "success": false, "error": "…" }` | validation failed |
| **415** | `{ "success": false, "error": "Content-Type must be application/json" }` | wrong media type |
| **429** | `{ "success": false, "error": "Too many requests" }` | rate limit exceeded (Phase 6) |
| **503** | `{ "success": false, "error": "TTS provider unavailable" }` | provider down / timeout |

### `GET /api/voices` — voice catalog

```json
{ "voices": [ { "id": "en-US-female-1", "name": "Aria (English, US)", "language": "en-US", "gender": "female" } ] }
```

### `GET /api/health` — liveness probe

```json
{ "status": "ok" }
```

## Locked limits & decisions (no TBDs)

| Decision | Value | Why |
| --- | --- | --- |
| **Max text length** | **4,000 characters** | Cheap, matches many TTS vendor quotas |
| **Rate limit** | **10 TTS requests / IP / 15 min** | Abuse protection (enforced Phase 6) |
| **Audio format** | **MP3 (`audio/mpeg`)** | Plays in all browsers, small files |
| Default language | `en-US` | Widest voice coverage |
| Audio transport | Binary stream first; `{ audioUrl }` files optional later | Simple; no server-side file lifecycle yet |
| TTS provider (Level 1) | Mock in tests/CI; one real vendor from Phase 5 | No billing during early phases |
| Error shape | `{ success: false, error: string }` | One shape for every failure |
| Validation | Server-side pure function; client mirrors for UX only | Server is the authority |

## Environment variables

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | server | `3000` | Express listen port (Vite proxies `/api` here) |
| `TTS_PROVIDER` | server | `piper` | `piper` (**neural, offline, free** — default) · `espeak` (classic, all 8 languages) · `mock` (CI-safe) · `google` (neural, needs key) |
| `PIPER_MODELS_DIR` | server | `server/.cache/piper-models` | where the Piper `.onnx` voice models live (git-ignored; fetched by `server/scripts/fetch-piper-models.sh`) |
| `TTS_API_KEY` | server | *(blank)* | Google Cloud TTS API key — only used when `TTS_PROVIDER=google`; **server-side only** |
| `TTS_TIMEOUT_MS` | server | `30000` | vendor call timeout before a 503 |
| `CLIENT_ORIGIN` | server | `http://localhost:5173` | CORS allowlist — comma-separated origins; others get no CORS headers |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MINUTES` | server | `10` / `15` | rate limit for `POST /api/tts` (contract defaults) |
| `LOG_REQUESTS` | server | `1` (on) | set `0` to silence the JSON request log (auto-silent under `NODE_ENV=test`) |
| `JWT_SECRET` | server | *(blank)* | HMAC secret for JWTs — set a long random string in production |
| `TOKEN_TTL_HOURS` | server | `24` | JWT lifetime |
| `DB_PATH` | server | `server/data/tts.db` | SQLite file location (tests use `:memory:`) |
| `TTS_MOCK_LATENCY_MS` | server | `120` | simulated synthesis latency (honest loading states) |

`.env` is git-ignored; `.env.example` is the committed template with `TTS_API_KEY=` left blank.

## What's next

- **Phase 8 — Advanced (Level 3, stretch):** speed/pitch/volume sliders, TXT/PDF upload → text extraction, AI text enhancement, cloud storage + quotas, admin dashboard — each sub-slice independently testable.
- ~~Real neural speech~~ **Done — offline.** `TTS_PROVIDER=piper` gives 12 human-sounding voices with zero keys and zero running costs (run `bash server/scripts/fetch-piper-models.sh` once). A Google Cloud TTS key remains an *optional* upgrade (`TTS_PROVIDER=google`) if hosted voices are ever preferred.
- Full plan: [`TTS-Build-Plan.md`](TTS-Build-Plan.md).

## Development notes

- The Vite dev proxy forwards `/api/*` to `http://localhost:3000` — the browser only ever talks same-origin.
- `client/src/services/api.js` is the only place `fetch` lives; components stay presentational and testable.
- Client tests mock `fetch` globally and stub `URL.createObjectURL` (jsdom has no blob URLs).
- The Express app is built in `src/app.js` and exported without listening, so Supertest tests it directly.
- `.env` is loaded by `server/src/loadEnv.js` (imported first in `server.js`). Tests intentionally skip it — CI always runs the mock, no secrets in GitHub Actions.
- The rate limiter is opt-in under `NODE_ENV=test` (via `RATE_LIMIT_MAX`) so only the hardening suite exercises it; in dev/production the contract default (10/15 min) applies.
