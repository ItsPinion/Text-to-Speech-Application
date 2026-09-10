# API Contract — FROZEN (Phase 0)

> This document is the **source of truth** for every later phase.
> Frontend and backend must not invent different field names — if a change is
> needed, update this file first, then the code, in the same commit.

## Conventions

- Base path: `/api`
- Content type: `application/json` (except successful `POST /api/tts`, see below)
- **Error shape (every non-2xx response):**

```json
{ "success": false, "error": "Human readable message" }
```

- Success responses use `"success": true` where a body carries more than audio bytes.

## Locked decisions

| Decision | Value | Why |
| --- | --- | --- |
| Max text length | **4 000 characters** | Cheap, matches many TTS quotas |
| Default language | `en-US` | Widest voice coverage |
| Audio format | **MP3 (`audio/mpeg`)** | Plays in all browsers, small files |
| Audio transport | Binary stream (Phase 3) **or** `{ audioUrl }` (Phase 4+) | Stream keeps Phase 3 simple; files come later |
| TTS provider (Level 1) | Mock TTS in tests; one real vendor from Phase 5 | Avoids billing during early phases |
| Rate limit | **10 TTS requests / IP / 15 min** | Abuse protection (enforced in Phase 6) |

---

## `GET /api/health`

Liveness/readiness probe. Never rate-limited.

```json
// 200
{ "status": "ok" }
```

From Phase 6 the body also includes the provider state **without secrets**:

```json
{ "status": "ok", "tts": "mock" | "configured" }
```

## `GET /api/voices`

Static voice catalog for the UI (live since Phase 3 — 8 voices across
en-US, en-GB, hi-IN, es-ES, fr-FR, de-DE; data: `server/src/data/voices.js`).

```json
// 200
{
  "success": true,
  "voices": [
    { "id": "en-US-female-1", "name": "Aria", "language": "en-US", "gender": "female" },
    { "id": "en-US-male-1",   "name": "Orion", "language": "en-US", "gender": "male" }
  ]
}
```

## `POST /api/tts`

Synthesize speech.

**Request**

```json
{ "text": "Hello", "language": "en-US", "voice": "en-US-female-1" }
```

| Field | Type | Rules |
| --- | --- | --- |
| `text` | string | required, non-empty after trim, ≤ 4 000 chars |
| `language` | string | required, must be in the language allow-list (e.g. `en-US`) |
| `voice` | string | required, must be a known voice id, and its language must match `language` |

**Success — Phase 3+ (binary transport)**

```
200
Content-Type: audio/mpeg
<mp3 bytes>
```

**Success — alternative (URL transport, Phase 4+, if files are enabled)**

```json
{ "success": true, "audioUrl": "/audio/xxx.mp3" }
```

**Errors**

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "success": false, "error": "Text is required" }` | missing/empty/oversized text, unknown language, unknown voice, voice/language mismatch |
| 429 | `{ "success": false, "error": "Too many requests" }` | rate limit exceeded (Phase 6; includes `Retry-After`) |
| 503 | `{ "success": false, "error": "TTS provider unavailable" }` | vendor down/timeout |
| 500 | `{ "success": false, "error": "Internal server error" }` | unexpected — never leaks key or vendor details |

**Placeholder (Phase 2 only, retired):** a *valid* body returned `501 { "success": false, "error": "TTS not implemented" }` until Phase 3 connected the mock provider; it now returns the MP3 stream above.

---

## Status code map (client `ErrorMessage` contract)

| Code | Client message |
| --- | --- |
| 400 | Show server `error` text (validation feedback) |
| 429 | "Too many requests — please wait a few minutes." |
| 503 | "Speech service unavailable — try again shortly." |
| network error | "Cannot reach the server — check your connection." |
