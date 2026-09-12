# API Reference

The complete HTTP contract for the Express API. **This is the contract the web client and the
backend must both satisfy.** Phase column = when the endpoint exists.

- Base URL (dev): `http://localhost:3000/api` (Next dev proxy → `:4000`)
- Base URL: dev `http://localhost:3000/api` (same-origin via the Next dev proxy);
  prod `https://<render-api-host>/api` (the value of `NEXT_PUBLIC_API_URL`; two-origins model,
  DE-05)
- All bodies are JSON (`Content-Type: application/json`) except `POST /api/upload` (multipart/form-data).
- Every response carries `X-Request-Id`.
- Auth (where required): `Authorization: Bearer <Clerk JWT>` (or same-site Clerk cookie).

## 1. Response envelope

```jsonc
// success
{ "success": true, ...payload }

// error (always this shape)
{ "success": false, "error": { "code": "CODE", "message": "Human-safe message", "details": { } } }
```

`details` appears only on 4xx (field-level validation info). `code` is a stable machine-readable
identifier from the shared registry (see §7); the web client maps codes → UI copy.

## 2. Endpoints

### 2.1 `GET /api/health` — *Phase 6*

Liveness. No auth.

```json
200 { "success": true, "status": "ok", "version": "0.1.0", "uptime": 123.4 }
```

### 2.2 `GET /api/health/ready` — *Phase 6 (basic) / 21 (full)*

Readiness. No auth.

```json
200 { "success": true, "status": "ready",
      "checks": { "tts": "ok", "ai": "disabled", "db": "ok" } }
```

`status` is `degraded`/503 when a *required* check fails (TTS catalog never loaded).
`ai: "disabled"` is **not** a failure — it means no key configured. `db` appears from Phase 15.

### 2.3 `GET /api/voices` — *Phase 5*

Voice catalog from the backend (source of truth). No auth.

```json
200 {
  "success": true,
  "voices": [
    { "id": "en-US-AriaNeural",   "name": "English (US) — Aria",  "language": "en-US", "gender": "female" },
    { "id": "en-US-GuyNeural",    "name": "English (US) — Guy",   "language": "en-US", "gender": "male" },
    { "id": "hi-IN-SwaraNeural",  "name": "Hindi (India) — Swara","language": "hi-IN", "gender": "female" }
  ],
  "languages": [
    { "code": "en-US", "label": "English (US)" },
    { "code": "hi-IN", "label": "Hindi (India)" }
  ]
}
```

Errors: `503 TTS_UNAVAILABLE` (catalog unavailable, no cache).

### 2.4 `POST /api/tts` — *Phase 9*

Synthesize text to speech. No auth (IP-rate-limited; 15/min for authenticated callers).

**Request**

```json
{ "text": "Hello, welcome to the Text-to-Speech application.", "voice": "en-US-AriaNeural" }
```

| Field | Type | Rules |
| --- | --- | --- |
| `text` | string | 1–5,000 chars after trim; not whitespace-only |
| `voice` | string | Must be a current catalog `id` |

**Response**

```json
201 {
  "success": true,
  "audioId": "3f6c…",
  "audioUrl": "/api/audio/3f6c…",
  "voice": "en-US-AriaNeural",
  "language": "en-US",
  "format": "mp3",
  "chars": 47
}
```

**Errors**

| Code | Status | Trigger |
| --- | --- | --- |
| `INVALID_TEXT` | 400 | empty / non-string / whitespace-only |
| `TEXT_TOO_LONG` | 400 | > 5,000 chars |
| `INVALID_VOICE` | 400 | voice not in catalog |
| `INVALID_LANGUAGE` | 400 | (reserved) voice/locale mismatch cases |
| `PAYLOAD_TOO_LARGE` | 413 | body > 100 KB |
| `RATE_LIMITED` | 429 | limit exceeded — `Retry-After` header (seconds) |
| `TTS_UNAVAILABLE` | 503 | provider/network failure or timeout |
| `INTERNAL` | 500 | unexpected (request id in logs) |

### 2.5 `GET /api/audio/:id` — *Phase 9*

Streams the temporary MP3. No auth (unguessable UUID).

```text
200  Content-Type: audio/mpeg
    Content-Length: 182341
    <MP3 bytes>

404  { "success": false, "error": { "code": "AUDIO_EXPIRED", "message": "This audio has expired. Generate it again." } }
```

### 2.6 `POST /api/ai/enhance` — *Phase 12*

Free AI text enhancement. No auth (IP-rate-limited 20/hour; per-user key when authenticated).

**Request**

```json
{ "text": "Me like this app very much.", "operation": "correctGrammar" }
```

`operation` ∈ `correctGrammar | summarize | rewrite | makeConversational | simplify`

**Response**

```json
200 {
  "success": true,
  "operation": "correctGrammar",
  "originalText": "Me like this app very much.",
  "enhancedText": "I really like this app.",
  "model": "user-configured model id"
}
```

**Errors**

| Code | Status | Trigger |
| --- | --- | --- |
| `INVALID_TEXT` / `TEXT_TOO_LONG` | 400 | same rules as TTS |
| `INVALID_OPERATION` | 400 | unknown operation |
| `RATE_LIMITED` | 429 | quota (provider free-tier 429s also surface here) |
| `AI_NOT_CONFIGURED` | 503 | no `AI_API_KEY` in the server environment |
| `AI_UNAVAILABLE` | 503 | provider error, timeout, or output failed validation |
| `INTERNAL` | 500 | unexpected |

### 2.7 `GET /api/users/me` — *Phase 14* · **auth required**

Returns (upserting) the app profile.

```json
200 { "success": true, "user": { "id": "user_abc123", "displayName": "Ada Lovelace", "createdAt": "2026-09-01T10:00:00Z" } }
```

Errors: `401 UNAUTHORIZED`.

### 2.8 History — *Phase 15* · **auth required**

`GET /api/history?limit=20&cursor=…`

```json
200 {
  "success": true,
  "items": [
    { "id": "gen_1", "text": "…snippet (first 200 chars)…", "fullTextChars": 1234,
      "language": "en-US", "voice": "en-US-AriaNeural",
      "audio": { "status": "available" | "expired" | "persisted", "url": "/api/audio/…" | null },
      "createdAt": "2026-09-10T09:00:00Z" }
  ],
  "nextCursor": "…" | null
}
```

`GET /api/history/:id` → full item (with full text).
`DELETE /api/history/:id` → `200 { success: true, deleted: true }` (also removes any favorite;
persisted BLOB freed).

Errors: `401`, `404 NOT_FOUND` (or not owned by user — deliberately indistinguishable from
other users' ids), `503` (DB unavailable).

### 2.9 Favorites — *Phase 16* · **auth required**

`POST /api/favorites` → `{ "generationId": "gen_1" }`
→ `201 { success: true, favorite: { "generationId": "gen_1", "createdAt": "…" } }`
(Side effect: the generation's MP3 is persisted as a BLOB if still retrievable; if the audio is
already expired, the favorite is created with `audio: { status: "expired" }` — re-synthesis is
always possible from stored text.)

`GET /api/favorites` → same item shape as history + `audio.url` (served from persisted BLOB via
`GET /api/audio/:id`-style endpoint `/api/favorites/:generationId/audio`).

`DELETE /api/favorites/:generationId` → `200 { success: true, deleted: true }`

Errors: `401`, `404`, `409`-as-`BAD_REQUEST` (already favorited → idempotent no-op is preferred;
documented behavior: **re-POST is an idempotent success**), `503`.

### 2.10 Preferences — *Phase 16* · **auth required**

`GET /api/preferences`

```json
200 { "success": true,
      "preferences": { "language": "en-US", "voice": "en-US-AriaNeural" } | null,
      "recentVoices": ["en-US-AriaNeural", "hi-IN-SwaraNeural"] }
```

`PUT /api/preferences` → `{ "language": "hi-IN", "voice": "hi-IN-SwaraNeural" }`
→ `200 { success: true, preferences: { … } }`
(voice must belong to language → `INVALID_VOICE`/`INVALID_LANGUAGE` 400.)

### 2.11 `POST /api/upload` — *Phase 17* · no auth (IP-limited)

`multipart/form-data`, field `file`.

| Rule | Limit | Error |
| --- | --- | --- |
| Extension | `.txt`, `.pdf`, `.docx` | `FILE_INVALID` 400 |
| MIME | `text/plain`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `FILE_INVALID` 400 |
| Size | 10 MB | `FILE_TOO_LARGE` 413 |
| Readable content | parse fails (corrupt) | `FILE_INVALID` 400 |

```json
200 { "success": true, "fileName": "notes.pdf", "size": 48213,
      "text": "extracted text…", "chars": 4820, "truncated": false }
```

## 3. Status code usage (spec table + additions)

| Status | Meaning in this API |
| --- | --- |
| 200 | Successful request (GET/PUT/DELETE/POST without resource creation) |
| 201 | Resource created (`POST /api/tts` audio, `POST /api/favorites`) |
| 400 | Invalid request (validation, unknown operation, bad file) |
| 401 | Missing/invalid/expired Clerk token |
| 403 | Authenticated but not allowed (foreign resource — used sparingly; 404 preferred for id ownership) |
| 404 | Unknown route or resource (incl. `AUDIO_EXPIRED`) |
| 413 | Body/file too large |
| 429 | Rate limit exceeded (+ `Retry-After`) |
| 500 | Internal server error (registry message only) |
| 503 | External service unavailable (TTS / AI / DB) |

## 4. Rate limits (defaults, all env-tunable)

| Scope | Limit | On exceed |
| --- | --- | --- |
| All `/api/*` | 60 req/min per IP | 429 + `Retry-After` |
| `POST /api/tts` | 10 req/min per IP (15 with valid token) | 429 |
| `POST /api/ai/enhance` | 20 req/hour per IP (per-user id when authed) | 429 |
| `POST /api/upload` | 10 req/hour per IP | 429 |

## 5. Conventions & guarantees

- **Idempotency:** GETs are side-effect-free; `DELETE` is idempotent; re-POST favorite is an
  idempotent success; `POST /api/tts` is **not** idempotent (each call creates a new audio).
- **Pagination:** cursor-based opaque cursors; `limit` 1–50 (default 20).
- **Character encoding:** UTF-8 everywhere (request, response, text, filenames in responses).
- **Time:** ISO-8601 UTC.
- **Stability:** `code` values are stable API identifiers; `message` copy may change; the web
  client must key off `code`, never parse `message`.
- **Versioning:** no version prefix in v1 (`/api/`); a `/api/v2/` is the documented escape hatch,
  not a v1 commitment.

## 6. Postman collection (Phase 23 deliverable)

A Postman collection mirroring §2 with environment variables (`API_BASE`, `CLERK_TOKEN`) and
example requests for every endpoint + the error matrix rows (Phase 19/23).
