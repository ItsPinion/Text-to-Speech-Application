# Test Campaign Report — Phases 0–3

**Date:** 2026-09-10 · **Environment:** Node v22.22.3 · **Branch:** `arena/01a08acc-text-to-speech-application`
**Result: 41 / 41 checks passed** — 24 automated (Jest + Supertest) + 14 protocol checks (Postman-equivalent) + 3 static/review checks. Test 3.5's structural half is machine-verified; the audible half ships as `out.mp3` for human playback.

---

## Phase 0 — Foundation & contracts

| ID | Type | Check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 0.1 | Manual | README lists install steps + env vars | ✅ PASS | 10 matching lines (`npm install`, `npm run dev`, `cp .env.example`, `PORT`, `TTS_API_KEY`, `CLIENT_ORIGIN`) |
| 0.2a | Manual | `.env` is git-ignored | ✅ PASS | `git check-ignore -v .env` → `.gitignore:7:.env` |
| 0.2b | Manual | No `.env` tracked in git | ✅ PASS | `git ls-files` has zero `.env` entries |
| 0.2c | Manual | `.env.example` ships blank key | ✅ PASS | `TTS_API_KEY=` with empty value |
| 0.3 | Review | Max length / rate limit / audio format stated, no TBD | ✅ PASS | "4 000 characters" · "10 TTS requests / IP / 15 min" · "MP3 — `audio/mpeg`" · 0 TBD matches in README + docs/API.md |

## Phase 1 — Express skeleton & health

| ID | Type | Check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 1.1 | Automated | `GET /api/health` → 200 `{"status":"ok"}` | ✅ PASS | Jest `tests/health.test.js` |
| 1.2 | Automated | `GET /api/does-not-exist` → 404 JSON, not HTML | ✅ PASS | Jest — body `{success:false,error:"Not found"}`, `content-type: application/json` |
| 1.3 | Protocol | Health while server running | ✅ PASS | `HTTP 200` via live curl/fetch battery |
| 1.4 | Manual | Server stopped → connection refused | ✅ PASS | curl exit 7 / Node `ECONNREFUSED` — the exact client error path the UI maps to "Cannot reach the server" |

Plus hardening guards (part of suite): helmet headers, CORS allowlist for `localhost:5173`, malformed-JSON → 400 envelope.

## Phase 2 — Validation layer

| ID | Input | Result | Server message |
| --- | --- | --- | --- |
| 2.1 | `{}` | ✅ 400 | `Text is required` |
| 2.2 | `{"text":"   "}` | ✅ 400 | `Text is required` (empty after trim) |
| 2.3 | 4 001 chars | ✅ 400 | `Text exceeds the maximum length of 4000 characters` |
| 2.4 | `{"text":"Hi"}` | ✅ 400 | `Voice is required` |
| 2.5 | `language:"xx-ZZ"` | ✅ 400 | `Unsupported language: xx-ZZ` |
| 2.6 | valid body | ✅ 200 `audio/mpeg` | 501 placeholder retired by Phase 3 (regression 3.6) |
| 2.7 | `Content-Type: text/plain` | ✅ 415 | `Content-Type must be application/json` (JSON envelope) |
| 2.8 | repeat via protocol battery | ✅ PASS | 7/7 identical status codes live |

Boundary extras: exactly 4 000 chars → 200 · missing content-type → 415 · envelope shape `{success, error}` asserted.

## Phase 3 — Mock TTS + voices

| ID | Check | Result | Evidence |
| --- | --- | --- | --- |
| 3.1 | `GET /api/voices` → 200, ≥2 voices with `id/name/language/gender` | ✅ PASS | 8 voices, shape-validated, unique ids, includes en-US + hi-IN |
| 3.2 | `POST /api/tts` valid → 200 `audio/mpeg`, body > 0 | ✅ PASS | 10 031 bytes · `Content-Disposition: speech.mp3` · `Cache-Control: no-store` |
| 3.3 | Unknown voice id | ✅ 400 | `Unknown voice: martian-1` |
| 3.4 | Voice/language mismatch | ✅ 400 | `Voice "hi-IN-female-1" does not support language "en-US"` |
| 3.5 | Fixture audio valid & audible | ✅ PASS* | Valid MPEG-1 Layer III: `ff fb` sync, 139 frames, ~0.63 s @128 kbps · *play `out.mp3` to confirm the beep by ear* |
| 3.6 | Regression — Phase 2 suite re-run | ✅ PASS | All 400s hold; valid input now 200 (not 501) |

## How to re-run

```bash
# full automated suite (24 tests)
cd server && npm test

# protocol battery (14 live checks; server must be running)
node server/scripts/protocol-battery.mjs   # 14 live checks (API must be running)
```

**Regression status:** Phases 0–1 checks still green after Phases 2–3 work — no regressions. Phase 4's RTL suite (9 tests) is documented in README and also green.
