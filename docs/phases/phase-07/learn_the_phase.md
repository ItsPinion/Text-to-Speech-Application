# Phase 07 — Backend Validation & Error Architecture

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 6 · **Unlocks:** Phase 8 (providers can assume clean, typed input)

## What this phase is

Before any TTS engine is attached, the API is made **robust on its own** (spec §13): every
request is validated, every failure has a stable code, a status, and a safe message, and no
internal detail ever leaks. The TTS-specific paths (`INVALID_VOICE` from catalog lookup,
`TTS_UNAVAILABLE`) are wired against the stub, so Phase 9 changes *provider behavior*, not error
shape.

Deliverables:

1. **Validation middleware** over the shared zod schemas (`@tts/validation`): body shape,
   content-type, text rules (empty/whitespace/5,000 code points), operation enum, pagination
   params, multipart limits (Phase 17).
2. **Typed error system:** `AppError(code, message, status, details?)` + the shared
   **error-code registry** (code → status → user-safe message). The registry is the single
   source for the API's error handler *and* the web client's message map (Phase 10) — the two
   can never drift.
3. **Central error handler + 404 handler** (Express 5 async-safe) producing the envelope
   `{ success:false, error:{ code, message, details? } }`.
4. **Safe-by-default logging:** 4xx logged at warn with field details; 5xx at error with
   `requestId`; request bodies truncated (200-char preview); redaction list (auth, tokens, keys).
5. **HTTP status discipline** per the spec table: 400/401/403/404/429/500/503 (+ 413 bodies).

## Why we build it this way

- **Errors are an API contract.** The frontend renders *from codes*, never by parsing messages
  (API.md §5). That's only possible if codes are stable, complete, and registered in one place —
  hence the registry in the *shared* package.
- **Validate at the edge, assume-clean inward.** After middleware + service-level checks (voice
  membership), services never re-check "is text a string" — they operate on a *parsed* domain
  object. This is the payoff of shared schemas: `ttsRequestSchema.parse(req.body)` yields a
  `TtsRequest` that downstream code trusts.
- **One handler decides status.** Controllers/services *throw domain errors*; exactly one
  middleware maps them to HTTP. Status codes therefore appear in one file — auditable,
  consistent, and impossible to "accidentally 500" with a raw throw (raw throws are *by design*
  500-INTERNAL: a bug is a 500).
- **Defense in depth with the client:** Phase 4's client validation uses the same schemas.
  Users get instant feedback; forged requests still hit the same rules server-side. The server
  never trusts the client (SR-02) — this phase is where that sentence becomes code.

## How it works (internals)

```text
validate(schema, source = "body")
  parsed = schema.safeParse(req[source])
  !success → throw AppError(firstRelevantCode(issues), message, 400, { fields: issueMap })
  code resolution:
    text empty/whitespace  → INVALID_TEXT
    text too long          → TEXT_TOO_LONG   (message includes how many chars over)
    unknown operation      → INVALID_OPERATION
    shape/content-type     → BAD_REQUEST
  (catalog-dependent checks are NOT here — they need runtime state, so they live in services:
   voice not in catalog → INVALID_VOICE; language/voice mismatch → INVALID_LANGUAGE)

error handler (last middleware)
  AppError            → status + registry message (+ details if 4xx)
  SyntaxError (json)  → 400 BAD_REQUEST "body is not valid JSON"
  body-limit error    → 413 PAYLOAD_TOO_LARGE
  rate-limit error    → 429 RATE_LIMITED + Retry-After (from the limiter)
  415 content-type    → 400 BAD_REQUEST (spec's content-type requirement)
  everything else     → log.error({ err, requestId }) → 500 INTERNAL (registry message only)

response always: { success:false, error:{ code, message, details? } } + X-Request-Id
```

Worked examples (these become the Phase 19 test cases):

| Request | Result |
| --- | --- |
| `POST /api/tts` `{}` | 400 `INVALID_TEXT` `details:{ text:["Enter some text."] }` |
| `POST /api/tts` 6,000 chars | 400 `TEXT_TOO_LONG` "Text is 1,000 characters over the 5,000 limit." |
| `POST /api/tts` voice `xx-XX-Nope` | 400 `INVALID_VOICE` (catalog check in service) |
| `POST /api/tts` `Content-Type: text/plain` | 400 `BAD_REQUEST` (content-type) |
| `POST /api/ai/enhance` op `translate` | 400 `INVALID_OPERATION` |
| 101 KB JSON body | 413 `PAYLOAD_TOO_LARGE` |
| 11th `/api/tts` in a minute | 429 `RATE_LIMITED` + `Retry-After: 51` (limiter installed in Phase 6/18; contract here) |
| provider throws `ECONNRESET` | 503 `TTS_UNAVAILABLE` (mapping defined Phase 8/9; path exists now) |

## Key concepts you should learn

- **Error classification:** caller-fault (4xx) vs our-external-fault (503) vs our-bug (500) —
  and why the *response* to each is different (retryable? user action? log alert?).
- Typed errors vs stringly-typed errors: `code` as a *discriminant* the client switches on.
- Zod at the edge: `safeParse` in middleware, `parse` (throwing) where you want the domain
  object; mapping issues → per-field `details`.
- Express error middleware mechanics (4-arg signature; ordering; why it must be last; Express 5
  async forwarding).
- Safe error responses: what's OK to show users (messages from a registry) vs what's only for
  logs (stacks, ids, internals); request-id as the correlation key between UI and logs.
- Rate-limit contract: 429 + `Retry-After` (seconds) — client renders "try again in Ns".
- Content-type validation as an explicit requirement (spec §13) — strict `express.json` + 415
  handling.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Shared error registry in `@tts/validation` | Client and server compile against the same codes; drift = compile error | Server-only codes + client string matching (drift), error classes duplicated per app |
| `AppError` + one central mapper | Status decided in one place | Per-route `res.status()` (scattered, inconsistent) |
| zod (shared) | Runtime + static types from one schema | joi/class-validator (no shared story), manual checks (unmaintainable) |
| Let unknown throws → 500 | A crash *is* a bug; hiding it is worse than a 500 + logged id | Blanket 200-with-error (masks bugs) |

## What gets created

```text
packages/validation:  errorRegistry (code → { status, message }), schemas (tts, ai, pagination, prefs)
apps/api/src/middleware/{validate.ts,error.ts}   (complete; 404 handler included)
apps/api/src/utils/errors.ts (AppError)
tests (grown into Phase 19 suite): the worked-example table above, each row = one test
```

## Verification checklist

- [ ] Every worked-example row returns exactly the documented code/status/envelope
- [ ] No stack trace, file path, or driver error appears in any 4xx/500/503 response (grep
      responses for `at /`, `Error:`, SQL strings)
- [ ] `details` present on validation 400s; absent on 5xx
- [ ] 429 responses carry `Retry-After` (seconds, integer)
- [ ] Logs: every request line has `requestId`; 5xx lines have `err.stack`; no key/token values
      (redaction test: send `Authorization: Bearer s3cret` → not present in logs)
- [ ] Client (Phase 10) error map is generated from the *same* registry — unit test asserts
      parity
- [ ] Status code coverage vs spec table: 200/201/400/401*/403*/404/429/500/503 reachable
      (*401/403 paths land in Phase 14; the handler mapping exists now)

## Common pitfalls

- **Leaking the "real" error** (`message: err.message` from a provider) → registry messages
  only; internals to logs with `requestId`.
- **Treating all 5xx as 500** → external service down is *503* (different retry semantics,
  different ops alert).
- **Validating catalog membership in the schema** → schemas can't see runtime catalogs; keep
  those checks in services (they produce different codes anyway).
- **Client/server message divergence** → one registry; if copy must differ per surface, that's
  a translation layer, never a second source.
- **Forgetting `Retry-After`** → 429 without it forces clients to guess; the spec's status
  table implies it.

## How it connects to the rest of the system

- Phase 8/9: provider errors are *normalized to AppErrors in one place* (the TTS service's
  error-mapping step) — the registry already knows `TTS_UNAVAILABLE`.
- Phase 10: the web client's `ApiError` type + message map come from the shared registry; the
  ErrorMessage component switches on `code`.
- Phase 14: `UNAUTHORIZED`/`FORBIDDEN` mappings are already in the registry; the auth middleware
  just throws them.
- Phase 21: the same codes become metrics dimensions (`api_errors_total{code="…"}`).

## What to remember

1. Error codes are API identifiers; messages are copy. The client switches on codes, always.
2. One registry (shared package) is the firewall between "what the API means" and "what we tell
   humans".
3. 4xx = fix your request · 503 = I can't right now · 500 = I'm broken (and now I'm logged).
4. Validation produces *typed domain objects*; everything after the edge can trust them.
5. `Retry-After` is part of the 429 contract, not a courtesy.
