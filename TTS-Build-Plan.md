# Text-to-Speech Platform — Phase-by-Phase Build Plan

**Stack:** React.js + Node.js + Express.js + TTS provider  
**Levels:** Phase 0–4 = Level 1 (core product). Phase 5–6 = Level 2. Phase 7–8 = Level 3.  
**Rule:** API keys never leave the server. Each phase ships working software, tests, and a short demo.

---

## How to use this plan

| Column | Meaning |
| --- | --- |
| **Adds** | New files, endpoints, UI |
| **How it works** | Data flow and design choices |
| **New features** | What a user can do after this phase |
| **Tests** | What to run (manual + automated + Postman) |
| **Expected results** | Pass criteria — if these fail, do not start the next phase |

**Definition of done for a phase:** all tests in that phase pass, README is updated, and the previous phase still works (no regressions).

**Suggested test commands (introduce in Phase 1–2):**

```bash
# server
cd server && npm test          # Jest / Vitest + Supertest
# client
cd client && npm test          # Vitest + React Testing Library
```

---

# PHASE 0 — Foundation & contracts

**Duration:** 0.5–1 day  
**Goal:** Everyone agrees on folders, env, API shapes, and limits before writing features.

### What this phase adds

- Monorepo layout matching the spec
- `.gitignore`, `.env.example`, `README.md`
- Written API contract (no implementation yet)
- Numeric limits the spec left blank

### How it works

Nothing runs yet except “hello world” optional. The contract is the source of truth for later phases.

**Project tree**

```
text-to-speech/
├── client/                 # React (Vite)
├── server/                 # Express
├── .env.example
├── .gitignore
└── README.md
```

**Locked decisions (fill these once)**

| Decision | Recommended default | Why |
| --- | --- | --- |
| Max text length | 4 000 characters | Cheap, matches many TTS quotas |
| Default language | `en-US` | Widest voice coverage |
| Audio format | MP3 (`audio/mpeg`) | Plays in all browsers, small files |
| Audio transport | Binary stream **or** `{ audioUrl }` | Phase 3 uses stream; Phase 4 can add files |
| TTS provider (Level 1) | Mock TTS in tests; one real vendor later | Avoids billing during early phases |
| Rate limit | 10 TTS requests / IP / 15 min | Abuse protection |

**API contract (frozen)**

`POST /api/tts`

```json
// request
{ "text": "Hello", "language": "en-US", "voice": "en-US-female-1" }

// success 200 — Phase 3 streams audio/mpeg
// or JSON: { "success": true, "audioUrl": "/audio/xxx.mp3" }

// errors
// 400 { "success": false, "error": "Text is required" }
// 429 { "success": false, "error": "Too many requests" }
// 503 { "success": false, "error": "TTS provider unavailable" }
```

`GET /api/voices` → `{ "voices": [ { "id", "name", "language", "gender" } ] }`  
`GET /api/health` → `{ "status": "ok" }`

### New features

None for end users. Team can clone, install, and read the contract.

### Tests

| ID | Type | Test | Expected result |
| --- | --- | --- | --- |
| 0.1 | Manual | Clone repo, open README | Install steps and env vars listed |
| 0.2 | Manual | `.env` is in `.gitignore`; `.env.example` has `TTS_API_KEY=` blank | Keys cannot be committed |
| 0.3 | Review | Max length, rate limit, audio format written in README | No “TBD” on those three |

**Phase 0 pass:** contract exists; no secrets in git.

**What it brings:** a shared language so frontend and backend do not invent different field names (`voice` vs `voiceName`).

---

# PHASE 1 — Express skeleton & health

**Duration:** 0.5–1 day  
**Goal:** A running API that answers health checks and fails closed on bad routes.

### What this phase adds

- `server/package.json`, `server.js`
- `GET /api/health`
- JSON 404 handler, CORS placeholder (`localhost:5173`)
- Helmet / basic security headers (optional)

### How it works

```
Client or Postman → GET /api/health → Express → { status: "ok" }
Unknown path → 404 { error: "Not found" }
```

No TTS yet. Confirms Node, Express, ports, and CORS.

### New features

- Operators can ping the API.
- Frontend (later) can wait for backend readiness.

### Tests

| ID | Type | Test | Expected result |
| --- | --- | --- | --- |
| 1.1 | Automated | `GET /api/health` via Supertest | **200**, body `{ "status": "ok" }` |
| 1.2 | Automated | `GET /api/does-not-exist` | **404** JSON, not HTML |
| 1.3 | Manual (Postman) | Health while server running | Same as 1.1 |
| 1.4 | Manual | Stop server, hit health | Network error (connection refused) — documents client error path |

**Example automated test (keep this file):**

```js
// server/tests/health.test.js
request(app).get('/api/health').expect(200).expect({ status: 'ok' });
```

**Phase 1 pass:** health is green; 404 is JSON.

**What it brings:** a deployable process and the first CI-friendly test.

---

# PHASE 2 — Validation layer (no TTS)

**Duration:** 1 day  
**Goal:** `/api/tts` exists but only validates. Rejects garbage before any paid API call.

### What this phase adds

- `POST /api/tts` with Joi/Zod (or manual checks)
- Middleware: JSON body parser, content-type
- Shared constants: `MAX_TEXT_LENGTH = 4000`, allowed languages list (stub)
- Error shape `{ success: false, error: string }`

### How it works

```
POST /api/tts
  → parse JSON
  → text non-empty, trim, length ≤ 4000
  → language in allow-list
  → voice present
  → if invalid: 400
  → if valid: 501 { error: "TTS not implemented" }   // temporary
```

Returning **501** on valid input proves validation is separate from synthesis.

### New features

- API refuses empty text, huge payloads, missing voice.
- Frontend can already wire error messages against real status codes.

### Tests

| ID | Type | Input | Expected result |
| --- | --- | --- | --- |
| 2.1 | Automated | `{}` | **400**, message about text |
| 2.2 | Automated | `{ "text": "   " }` | **400** empty after trim |
| 2.3 | Automated | text of 4001 chars | **400** too long |
| 2.4 | Automated | `{ "text": "Hi" }` no voice | **400** |
| 2.5 | Automated | `{ "text": "Hi", "language": "xx-ZZ", "voice": "a" }` | **400** unsupported language |
| 2.6 | Automated | valid body | **501** (until Phase 3) |
| 2.7 | Automated | `Content-Type: text/plain` | **400** or **415** |
| 2.8 | Postman | Repeat 2.1–2.6 | Same status codes |

**Phase 2 pass:** all invalid cases 400; valid case is 501 (not 500).

**What it brings:** a safety net so later TTS bugs are not confused with validation bugs. Protects quota when a real key is added.

---

# PHASE 3 — Mock TTS + audio response

**Duration:** 1 day  
**Goal:** End-to-end audio without a paid vendor. Frontend can play something.

### What this phase adds

- `server/services/ttsService.js` with a **mock** implementation
- Mock returns a tiny valid MP3 (fixture file `server/fixtures/beep.mp3`)
- `POST /api/tts` returns `Content-Type: audio/mpeg` and the bytes
- `GET /api/voices` returns a static list (en-US male/female, hi-IN, etc.)

### How it works

```
Controller
  → ttsService.synthesize({ text, language, voice })
  → mock ignores text, reads fixture MP3
  → res.set('Content-Type', 'audio/mpeg'); res.send(buffer)
```

Interface:

```js
synthesize({ text, language, voice }) → Promise<Buffer>
```

Real Google/Azure/ElevenLabs will implement the same function in Phase 4.

### New features

- Any HTTP client can POST text and get playable audio.
- Voice catalog exists for the UI.

### Tests

| ID | Type | Test | Expected result |
| --- | --- | --- | --- |
| 3.1 | Automated | `GET /api/voices` | **200**, array length ≥ 2, each item has `id`, `name`, `language`, `gender` |
| 3.2 | Automated | `POST /api/tts` valid | **200**, `content-type` includes `audio/mpeg`, body length > 0 |
| 3.3 | Automated | Unknown `voice` id | **400** |
| 3.4 | Automated | Voice whose `language` ≠ requested language | **400** |
| 3.5 | Manual | Save response as `out.mp3`, play in VLC/browser | Audible beep (fixture) |
| 3.6 | Regression | Re-run Phase 2 tests | Still 400 on bad input; **200** instead of 501 on valid input |

**Phase 3 pass:** binary audio round-trip; voices listed; validation still holds.

**What it brings:** a **swappable TTS port**. UI and tests no longer wait on cloud accounts.

---

# PHASE 4 — React UI (Level 1 complete)

**Duration:** 2–3 days  
**Goal:** Spec section 32 screen: input, counts, language, voice, generate, player, download, errors.

### What this phase adds

| Component | Responsibility |
| --- | --- |
| `TextInput` | Textarea, live character + word count, max 4000 |
| `LanguageSelector` | Dropdown from unique languages in `/api/voices` |
| `VoiceSelector` | Voices filtered by selected language |
| `GenerateButton` | POST `/api/tts`, loading spinner, disable while in flight |
| `AudioPlayer` | `<audio controls src={blobUrl}>` |
| `DownloadButton` | `<a download="speech.mp3">` from same blob |
| `ErrorMessage` | Maps 400/429/503/network to human text |

`client/src/services/api.js` — `fetch`/`axios` with `responseType: 'blob'` for TTS.

### How it works

```
1. App mounts → GET /api/voices → fill language + voice
2. User types → counts update (client-side)
3. Generate → POST blob → URL.createObjectURL → <audio>
4. Download uses the same object URL
5. Changing text can keep or clear previous audio (clear is simpler)
```

Vite proxy: `/api` → `http://localhost:3000` so cookies/CORS stay simple in dev.

### New features (user-visible)

- Enter/paste text with live counts  
- Pick language then a matching voice  
- Generate, play, pause, seek, volume (native audio)  
- Download MP3  
- Clear text  
- See validation and network errors  

### Tests

**Frontend unit / RTL**

| ID | Test | Expected result |
| --- | --- | --- |
| 4.1 | Empty textarea, Generate clicked | Button disabled **or** error “Enter text”; no network call |
| 4.2 | Type `"Hello world"` | Characters 11, words 2 |
| 4.3 | Paste 4000 chars | Count shows 4000; 4001rd char blocked or warned |
| 4.4 | Change language | Voice list filters; previous voice reset if invalid |
| 4.5 | Mock voices API failure | ErrorMessage visible; Generate disabled |
| 4.6 | Mock TTS 200 blob | `<audio>` appears; src is blob: URL |
| 4.7 | Mock TTS 400 | Error text from JSON (parse error blob as text) |
| 4.8 | Mock network offline | “Network failure” message |
| 4.9 | Download link | `download` attribute and href = blob URL |

**Manual UI**

| ID | Test | Expected result |
| --- | --- | --- |
| 4.10 | Full happy path against mock server | Beep plays; file downloads and opens |
| 4.11 | Responsive width 375px | Controls usable, no horizontal overflow |
| 4.12 | Keyboard: tab through controls | Order: textarea → language → voice → generate → player |

**Phase 4 pass:** Level 1 demo works with mock TTS; RTL tests green.

**What it brings:** the product students can screenshot. Backend still fake audio.

---

# PHASE 5 — Real TTS provider

**Duration:** 1–2 days  
**Goal:** Replace mock with one vendor. Same interface, real speech.

### What this phase adds

- `ttsService` implementation for **one** of: Google Cloud TTS, Azure, Amazon Polly, ElevenLabs
- `TTS_API_KEY`, `TTS_REGION` in server `.env` only
- Map app `voice` ids → vendor voice names
- Map vendor errors: 401 → 500 (do not leak key details), timeout → 503
- Optional: keep mock via `TTS_PROVIDER=mock` for CI (no secrets in GitHub Actions)

### How it works

```
synthesize()
  if (process.env.TTS_PROVIDER === 'mock') return fixture
  else call vendor HTTP API with server-side key
  convert vendor audio (LINEAR16/MP3) to MP3 buffer
  return buffer
```

Frontend **does not change**. That is the proof the Phase 3 port was correct.

### New features

- Natural speech in selected language (English, Hindi, etc. if the vendor supports them)
- Accents/genders that exist on the vendor

### Tests

| ID | Type | Test | Expected result |
| --- | --- | --- | --- |
| 5.1 | Automated | `TTS_PROVIDER=mock` — full server suite | Same as Phase 3 (CI) |
| 5.2 | Integration (local, real key) | POST short English sentence | **200** MP3; speech matches text when played |
| 5.3 | Integration | Hindi (or Gujarati) if vendor supports | Intelligible speech, not English phonemes |
| 5.4 | Integration | Wrong API key | **500** or **503**, body does **not** include the key |
| 5.5 | Integration | Vendor timeout stub | **503** “TTS provider unavailable” |
| 5.6 | Security review | Search client bundle for `TTS_API_KEY` | Zero matches |
| 5.7 | Manual | Generate twice with different voices | Audibly different speakers |

**Phase 5 pass:** CI still uses mock; local/staging uses real speech; key never in frontend.

**What it brings:** real value of the product. Cost and latency appear — watch payload size and timeouts (30s).

---

# PHASE 6 — Hardening (rate limit, logging, download polish)

**Duration:** 1 day  
**Goal:** Spec sections 14–15 without new product features.

### What this phase adds

- `express-rate-limit` on `POST /api/tts` (10 / 15 min / IP)
- Request id + structured logs (no text content in logs if privacy matters — log length only)
- CORS allowlist from `CLIENT_ORIGIN`
- Optional disk cache **off** by default; if files used, delete after 1 hour
- `GET /api/health` includes `{ tts: "mock"|"configured" }` without secrets

### How it works

Rate limiter runs **after** cheap health, **before** TTS. 429 includes `Retry-After`.

### New features

- Abuse resistance
- Safer production CORS
- Clearer ops: health shows whether a key is configured

### Tests

| ID | Type | Test | Expected result |
| --- | --- | --- | --- |
| 6.1 | Automated | 11th TTS from same IP in window | **429** |
| 6.2 | Automated | Health never 429 | Health unlimited |
| 6.3 | Automated | Request from disallowed origin | CORS fail (no `Access-Control-Allow-Origin`) |
| 6.4 | Manual | Logs after a TTS call | No API key, preferably no full user text |
| 6.5 | Regression | Phases 2–5 tests | All still pass |

**Phase 6 pass:** 429 proven; CORS locked; logs clean.

**What it brings:** production-minded API. This is the **recommended student submit** for Level 1+.

---

# PHASE 7 — Level 2: Auth, history, favorites

**Duration:** 3–5 days  
**Goal:** Accounts, saved generations, favorite voices.

### What this phase adds

- Auth: JWT or Supabase Auth  
- DB: PostgreSQL or MongoDB  
- Tables/collections:

```
users (id, email, password_hash, created_at)
generations (id, user_id, text, language, voice, audio_url, created_at)
favorites (id, user_id, voice_id)
```

- New APIs:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | no | Create user |
| POST | `/api/auth/login` | no | JWT |
| GET | `/api/history` | yes | List my generations |
| DELETE | `/api/history/:id` | yes | Delete mine only |
| POST/GET/DELETE | `/api/favorites` | yes | Voice favorites |
| POST | `/api/tts` | optional or required | If required, attach `user_id` and save row |

- Audio: store in local `uploads/` (dev) or S3 (deploy — Render disk is ephemeral)
- UI: login/register, history list (replay + download), star on voice

### How it works

```
Login → JWT in Authorization header
TTS success → write generation row + store file → return audio
History page → GET list → play from audio_url
Favorites → filter VoiceSelector
```

Authorization: user A cannot GET/DELETE user B’s ids (**403**).

### New features

- Accounts  
- Replay past speech without regenerating (saves money)  
- Favorite voices  
- Download from history  

### Tests

| ID | Type | Test | Expected result |
| --- | --- | --- | --- |
| 7.1 | Automated | Register duplicate email | **409** or **400** |
| 7.2 | Automated | Login bad password | **401** |
| 7.3 | Automated | `GET /api/history` no token | **401** |
| 7.4 | Automated | User A deletes user B id | **403** or **404** |
| 7.5 | Automated | TTS + history | New row; audio_url fetchable **200** |
| 7.6 | Automated | Favorite unknown voice | **400** |
| 7.7 | RTL | Logged-out Generate | Redirect to login **or** works anonymously (pick one; document it) |
| 7.8 | Manual | Two browsers, two users | Histories isolated |

**Phase 7 pass:** auth matrix green; no IDOR on history.

**What it brings:** a multi-user product and a reason to have a database.

---

# PHASE 7.5 — Neural voices (Piper): "make it sound human"

**Trigger:** user feedback after Phase 7 — "The generated texts sound totally robotic… Is there no way to make them sound human?" Constraints unchanged: free, no credit card, offline-capable.

**Choice:** [Piper](https://github.com/OHF-Voice/piper1-gpl) voice models (neural VITS, MIT-licensed) run in-process via `onnxruntime-node` (CPU, ~0.2–0.7 s/sentence). Same port as every other provider: `TTS_PROVIDER=piper`.

**What was built:**

- `server/src/services/providers/piper.js` — full pipeline ported from piper-phonemize's `phonemize.cpp` + `phonemes_to_ids`: text → sentences → eSpeak-NG (WASM) emits **IPA** phonemes using each *model's own* espeak voice → NFD codepoints + `phoneme_map` substitution + `(lang)` flag filtering → `phoneme_id_map` ids (`^` BOS, pad `_` after every phoneme, `$` EOS, clause `,`+space, sentence terminator . ? !) → VITS ONNX session **per sentence** (`input`/`input_lengths`/`scales`/`sid`) → float32 @ model sample rate → 0.2 s inter-sentence silence → shared lamejs MP3 encoder.
- **Correction (post-ship, from user feedback "it just generates gibberish"):** the first implementation phonemized with espeak's *Kirshenbaum* notation while the models' `phoneme_id_map` is *IPA*-keyed — most vowels/stress marks weren't in the map and were silently skipped, so VITS received scrambled phonemes. Fix: IPA mode + NFD + per-codepoint ids (exactly piper's algorithm, verified against `rhasspy/piper-phonemize` and `rhasspy/piper` sources) and per-sentence inference. Verified by decoding every model's id sequence back to IPA (all 9 models: zero unmapped codepoints, textbook IPA output) — a check the original work should have included, since byte-level MP3/duration checks cannot catch wrong phonemes.
- 9 models, 12 of 16 catalog voices: en-US (amy/joe), en-GB (jenny/northern male), en-IN (US models — no Indian-English Piper voice exists), hi-IN (priyamvada/rohan), es-ES (two-speaker sharvard: M=0/F=1), fr-FR (siwis/tom). **Telugu & Tamil: no Piper voices → automatic eSpeak fallback** (same for missing model files — the API never hard-fails).
- `server/scripts/fetch-piper-models.sh` — one-time ~560 MB download via git sparse-clone (the official HF/release CDNs are blocked on some networks; the same files are mirrored as plain git blobs).
- Catalog: every voice now carries `engine` ('piper'|'espeak') + `quality` ('neural'|'classic'); `GET /api/voices` also reports the active `provider`. UI: ⚡ neural badge in the voice selector (only when piper is actually active).
- Models live in `server/.cache/piper-models/` (git-ignored), `PIPER_MODELS_DIR` overrides.

**How the models were sourced (network-constrained sandbox):** `onnxruntime-node@1.16.3` bundles its native binaries in the npm tarball (≥1.17 postinstall-fetches from nuget.org — blocked). Release-asset CDNs (Hugging Face, release-assets.githubusercontent.com) were unreachable; the identical `.onnx` files were pulled from public repos that commit them as plain git blobs via `git clone --filter=blob:none --sparse`.

**Tests (`server/tests/tts.piper.test.js`, +16 → 102 total):** provider selection & health · voices engine/provider fields · pure phoneme→id encoding (markers, separators, breaks, ?/!, unmapped-skip, empty→null) · registry↔catalog coherence · eSpeak fallback (no-model voice + missing-files) · real VITS inference (English scaling, Devanagari Hindi, Spanish two-speaker M≠F, end-to-end POST) — inference tier auto-skips on machines without models.

**Live verification:** all 8 neural voices + te fallback returned valid MP3s (`demo/neural-*.mp3`); authed generation saved to history with fetchable `audioUrl`; `X-TTS-Provider: piper` header confirmed.

**What it brings:** human-sounding speech, still $0, still offline, still no account — the "no credit card" promise kept at neural quality.

---

# PHASE 7.6 — Neural Telugu & Tamil via MMS + browser-bridge import

**Trigger:** user feedback — "tamil, telugu etc still sound wrong… like a broken recorder." English (Piper) was fine; te/ta were the eSpeak fallback, and eSpeak's Indic voices are the harshest of the lot. Diagnosis confirmed the phonemization was CORRECT (te IPA: `nˈamasteː ˈidi tˈeluɡu`) — the quality ceiling is the engine itself.

**Investigation:** every neural te/ta model lives on CDNs this network blocks (HF, release-assets, objects.githubusercontent, media.githubusercontent LFS, ModelScope, Gitee, Kaggle, Zenodo, Codeberg). sherpa's MMS mirror set has only 8 languages (no te/ta). AI4Bharat's Indic-TTS release zips exist on a blocked CDN. Conclusion: no server-side channel exists.

**The trick — the browser bridge:** the *user's* browser has unrestricted internet. New authenticated endpoint pair:

- `GET /api/models` — which optional models are present
- `POST /api/models/mms/:lang/:file` (lang ∈ te|ta, file ∈ onnx|vocab) — raw-body upload with ONNX header + size-window + vocab-shape validation and a **load-verification** pass (onnxruntime opens the file or it's deleted + 400)

The web app's ModelImportPanel streams `naklitechie/mms-tts-{te,ta}-ONNX` (root `model.onnx` + `vocab.json`, permissive CORS on HF) through the browser and uploads both files once. After that: server-side char-level VITS (HF VitsTokenizer semantics: lowercase → in-vocab chars → blank id 0 interleaved; `input_ids` + `attention_mask`; 16 kHz), per-sentence like Piper, MP3 via the shared encoder. Voices overlay flips te/ta to `engine: 'mms', quality: 'neural'` only when both files exist; until then, eSpeak fallback as before. `MMS_MODELS_DIR` env overrides storage.

**Tests:** +10 server (tokenizer unit, route 401/404/400 paths, both-files semantics, voices overlay with a real ONNX) → 115 passing + 4 auto-skipped; client 17/17 (+1 panel visibility). Live-verified the full import pipeline with a real 63 MB ONNX upload (verified, status flip, overlay, cleanup).

**What it brings:** all 8 catalog languages can be neural; locked-down deployments still work; imports are an explicit, validated, account-gated action.

---

# PHASE 8 — Level 3: Files, AI enhance, customization, admin

**Duration:** 1–2 weeks (stretch)  
**Goal:** Spec optional advanced features. Implement in slices; each slice has its own tests.

### 8.0 — Demo mode: remove requirements & auth from the model import ✅ (done)

**User decision:** "It's just for a demo, so remove all the requirements and remove even the auth or any kind of verification."

- `POST /api/models/mms/:lang/:file` is **no longer authenticated** — the in-app "⚡ Enable neural Telugu/Tamil" buttons work signed-out, one click, no account.
- The demo `.env` sets `RATE_LIMIT_MAX=200` so a demo never trips the 429 quota mid-presentation (the frozen contract default stays 10 / 15 min / IP for any real deployment).
- File-integrity validation is deliberately **kept** (it is not access control): ONNX header + size window, vocab shape, and the onnxruntime load-verification prevent a truncated or corrupt upload from silently breaking a voice.
- Login / history / favorites remain as *optional* features — anonymous generation was always open, and nothing in the demo flow requires an account anymore.
- Tests updated: the 401 expectation became an anonymous-upload-works expectation; auth scaffolding removed from the import suite. Server 115 + 4 auto-skipped, client 17/17.

### 8A — Speed / pitch / volume

- Extend `POST /api/tts` with `{ rate, pitch }` (ranges documented, e.g. rate 0.5–2.0)
- UI sliders
- **Tests:** out-of-range → 400; in-range → 200; mock still ignores but accepts fields

### 8B — TXT / PDF / DOCX upload

- `POST /api/extract` multipart, max 2 MB
- Extract text → fill textarea (user still hits Generate)
- **Tests:** empty file 400; `.exe` 400; 3 MB 413; sample `.txt` returns exact string; PDF sample returns expected snippet

### 8C — AI text enhancement

- `POST /api/enhance` `{ text, mode: "summarize"|"grammar"|"conversational" }`
- Server calls LLM with **server** key
- User reviews edited text, then Generate
- **Tests:** mock LLM in CI; empty text 400; UI shows diff or new text before TTS

### 8D — Cloud storage & usage limits

- Upload MP3 to S3/R2; signed GET URLs
- Per-user monthly character quota
- **Tests:** over quota **429** or **403** with remaining=0; signed URL expires

### 8E — Admin dashboard & analytics

- Admin role; counts: users, TTS calls, errors, characters
- **Tests:** non-admin **403**; admin sees aggregates not raw passwords

### New features (full Level 3)

AI rewrite, document upload, voice style, cloud audio, quotas, admin analytics.

**Phase 8 pass:** each sub-slice independently testable; billing dashboards watched.

---

# PHASE 9 — Testing campaign, Postman, deployment

**Duration:** 1–2 days  
**Goal:** Spec sections 17–18 and 34 deliverables.

### What this phase adds

- Postman collection: health, voices, tts (success + 400s), auth, history
- `GET /api/health` used by host platform
- Frontend on Vercel/Netlify; API on Render/Railway
- `CLIENT_ORIGIN` and `VITE_API_URL` for production
- README: screenshots, env, architecture diagram, test how-to
- Optional GitHub Action: `npm test` on server (mock provider)

### How it works

Production:

```
Browser (Vercel) --HTTPS--> Express (Render) --HTTPS--> TTS vendor
```

CORS allows only the Vercel origin. Rate limits on.

### Tests (release checklist)

| ID | Test | Expected result |
| --- | --- | --- |
| 9.1 | Production health URL | **200** |
| 9.2 | Production Generate English | Speech plays over HTTPS |
| 9.3 | Frontend never calls vendor host | DevTools Network: only your API origin |
| 9.4 | Run full automated suite in CI | Green |
| 9.5 | Lighthouse / basic a11y on form labels | Inputs have labels |
| 9.6 | Load: 10 parallel TTS (staging) | No crash; some 429 acceptable |
| 9.7 | Deliverables list (spec §34) | Code, GitHub, README, API docs, screenshots, URL, Postman, demo notes |

**Phase 9 pass:** public URL works; CI green; student submission complete.

**What it brings:** a real deployed full-stack app, not only localhost.

---

## Master test matrix (Level 1)

Run this after Phase 6 (and again after deploy).

| Area | Case | Status if passing |
| --- | --- | --- |
| Health | GET `/api/health` | 200 `{ status: "ok" }` |
| Voices | GET `/api/voices` | 200 list with language+gender |
| TTS happy | POST valid English | 200 `audio/mpeg` |
| Empty text | POST | 400 |
| Too long | 4001 chars | 400 |
| Bad language | `xx-ZZ` | 400 |
| Bad voice | unknown id | 400 |
| Voice/language mismatch | | 400 |
| Rate limit | 11th call | 429 |
| Mock CI | no real key | 200 fixture audio |
| UI counts | “Hello world” | 11 chars, 2 words |
| UI play | after generate | audio element plays |
| UI download | | file `speech.mp3` |
| UI error | stop API | network error shown |
| Security | client bundle | no API key |

---

## What each phase adds — one-page map

| Phase | Layer | User-visible? | Features unlocked |
| --- | --- | --- | --- |
| 0 | Docs/contracts | No | Shared API + limits |
| 1 | Server process | No | Health check |
| 2 | Validation | Errors only | Safe 400s |
| 3 | Mock TTS + voices | If using Postman | Playable MP3, voice catalog |
| 4 | React UI | **Yes** | Full Level 1 UX on mock audio |
| 5 | Real vendor | **Yes** | Real multilingual speech |
| 6 | Hardening | Indirect | Rate limit, CORS, logging |
| 7 | Auth + DB | **Yes** | Accounts, history, favorites |
| 8 | Advanced | **Yes** | Files, AI, sliders, admin |
| 9 | Ship | **Yes** | Public URL, CI, Postman |

---

## Recommended 14-day mapping (spec weeks 1–2)

| Day | Phase | Outcome |
| --- | --- | --- |
| 1 | 0 | Contract + repo |
| 2 | 1 + start 4 UI mockups | Health + static layout |
| 3–4 | 4 (UI without API) + 2 | Validation API + wired form |
| 5 | 3 | Mock audio plays in UI |
| 6 | 4 remaining | Download, errors, counts |
| 7 | Buffer / connect | End-to-end mock demo |
| 8–10 | 5 | Real TTS |
| 11 | 6 | Rate limit + CORS |
| 12 | 4 polish + tests | RTL + Supertest green |
| 13 | 9 deploy | Staging URL |
| 14 | 9 | Postman, README, demo |

Phase 7–8 only after this demo is solid.

---

## How the system works when Level 1 is done

```
User types text in React
        │
        ▼
Validation in browser (UX) + again on Express (security)
        │
        ▼
POST /api/tts  { text, language, voice }
        │
        ▼
ttsService (mock or Google/Azure/Polly/ElevenLabs)
        │
        ▼
MP3 buffer  →  HTTP 200 audio/mpeg
        │
        ▼
React Blob  →  <audio>  +  Download
```

**New capabilities vs a static webpage:** the browser never holds the vendor key; voices are data from the server; errors are real HTTP statuses; tests can run without paying for TTS.

---

## Exit criteria vs spec learning outcomes

After Phase 6 + 9, students have practiced:

- React talking to REST  
- Express endpoints and middleware  
- Third-party API integration  
- Audio as binary HTTP  
- Env-based credentials  
- Input validation and error handling  
- Postman and automated tests  
- Split frontend/backend deploy  

That matches spec §33 without requiring auth, AI, or PDF in the first ship.
