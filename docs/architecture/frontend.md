# Frontend Architecture (Next.js)

Covers FR-001…FR-013, FR-015…FR-016 (UI side), FR-019…FR-024 (UI side), FR-026…FR-028 (UI side),
NFR-001/009, SR-01 (client side).

## 1. Framework shape

- **Next.js App Router** (React 18, TypeScript strict), Tailwind CSS for styling.
- The app is essentially a **single-page UI** around one workflow; we use App Router for its
  routing ergonomics, layouts, and first-class metadata, while treating the main page as a
  client-driven workspace.
- **Server vs client components:** the layout and page shell are server components; the TTS
  workspace (everything stateful) is one cohesive client component tree. Data fetching is client-
  side via the API client (§5) because the interesting states (loading/cancel/error/progress) are
  inherently client concerns. No SSR of TTS state.

```text
apps/web/
├── app/
│   ├── layout.tsx            # ClerkProvider, global providers, metadata
│   ├── page.tsx              # main TTS workspace (server shell → client root)
│   ├── history/page.tsx      # v2 (phase 15)
│   ├── favorites/page.tsx    # v2 (phase 16)
│   └── api/ (none — web has no API routes; Express is the API)
├── components/
│   ├── TextInput/            # textarea + counts + validation display (FR-001/002/009)
│   ├── LanguageSelector/     # (FR-003)
│   ├── VoiceSelector/        # (FR-004)
│   ├── GenerateButton/       # loading/cancel (FR-005/013)
│   ├── AudioPlayer/          # play/pause/seek/volume/progress (FR-006)
│   ├── DownloadButton/       # (FR-007)
│   ├── ErrorMessage/         # code → message mapping, aria-live (FR-008)
│   ├── AiEnhancePanel/       # v2 (phase 12): ops, review, apply/dismiss/undo
│   ├── FileUpload/           # v2 (phase 17)
│   └── ui/                   # Button, Select, Spinner, Badge… (small, unstyled-primitives)
├── hooks/
│   ├── useVoices.ts          # fetch/cache catalog, loading/error states
│   ├── useTts.ts             # generate lifecycle (state machine, abort, retry)
│   ├── useAiEnhance.ts       # v2: enhance lifecycle + review state
│   └── useAuth.ts            # v2: Clerk session wrapper
├── services/
│   ├── api.ts                # fetch wrapper: errors, timeouts, cancellation, JSON + blob
│   └── audio.ts              # blob → object URL, download helper
├── lib/
│   └── constants.ts          # re-exports shared limits from @tts/validation
└── types/                    # re-exports from @tts/types
```

**Rule:** business knowledge lives in `packages/*` (types, schemas, limits). `apps/web` contains
presentation + orchestration only. No zod schema, no limit constant, and no error-code list is
defined inside `apps/web`.

## 2. State model (Phase 4 baseline)

One workspace state object per concern, held in the workspace root and passed down (context is
not needed at this scale):

```text
textState:    { value, chars, words, remaining, error? }   // counts are DERIVED, never stored
voiceState:   { voices[], languages[], language, voice, loading, error? }
ttsState:     { status: idle|loading|ready|error, audioId?, audioUrl?, blobUrl?, error? }
aiState:      { status, operation, original?, enhanced?, error? }   // v2
```

Principles:

- **Derived state** (chars/words/remaining) is computed from `text` on render — no sync bugs,
  no stale counts (Phase 4 learning goal).
- **Status machines** (`idle → loading → ready | error`) for anything async; the UI renders from
  the machine, so double-submits and half-states are unrepresentable.
- Cancelling sets `status: idle` and clears `error`; generating new speech revokes the previous
  object URL (memory hygiene).
- Undo for AI apply: one-step client-side memory of the pre-apply text (FR-015) — deliberately
  simple, documented.

## 3. Component responsibilities (spec §10, implemented)

| Component | Owns | Must never |
| --- | --- | --- |
| TextInput | textarea, counts, clear button, field error display | call the API |
| LanguageSelector | language list (derived from catalog), selection | know voice internals |
| VoiceSelector | voices for selected language, selection | fetch data |
| GenerateButton | submit + loading + cancel affordance | validate (validation is state-driven) |
| AudioPlayer | `<audio>` element behavior, controls, progress, volume | fetch |
| DownloadButton | trigger `.mp3` download from existing blob | fetch (blob already in memory) |
| ErrorMessage | render `ApiError` → human message + action | decide retry policy (hook decides) |

Dependent selectors: language change → `voice` resets to the first voice of that language;
catalog reload preserves selection if still valid, else resets (FR-004).

## 4. Accessibility baseline (NFR-009)

- Every control labeled (`<label>` or `aria-label`); selects are native `<select>` (free keyboard
  + screen-reader support).
- Error region: one `aria-live="assertive"` container; validation errors announced.
- Counts are `aria-live="polite"` (or visually available static text); focus visible everywhere.
- Keyboard: entire flow operable without mouse (Tab order: text → language → voice → generate →
  player controls → download).
- Audio player: buttons have accessible names; seek slider exposes `aria-valuetext` (mm:ss).

## 5. API client (services/api.ts)

```text
request(path, { method, body?, signal?, type: "json"|"blob" })
  → fetch(NEXT_PUBLIC_API_URL + path, { headers, body, signal, timeout: AbortSignal.timeout(45s) })
  → !res.ok → parse error JSON → throw ApiError { code, message, status, requestId? }
    (unparseable body → ApiError { code: "BAD_REQUEST", message: generic })
  → ok → json or blob
```

- **CORS in dev:** avoided by the Next dev proxy (`/api/*` → `:4000`); `NEXT_PUBLIC_API_URL` is
  `/api` in dev and the public origin in prod. One env var, two deployments.
- **Cancellation:** `useTts` holds an `AbortController`; Cancel button and component unmount
  abort; aborts are treated as *user intent*, not errors (no error banner).
- **Retries:** no automatic retry for user-facing generation (user controls it); the voices
  fetch retries once with backoff inside `useVoices` (cheap, idempotent GET).
- **Auth (v2):** a tiny cookie/token bridge is unnecessary — the browser sends the Clerk cookie
  on same-site requests, and for cross-origin prod the client additionally attaches the Clerk
  JWT from `useAuth()` as `Authorization: Bearer`. Server accepts either (documented in
  backend.md §6).
- No secrets anywhere in this file or any client code (SR-01). The only public key is Clerk's
  publishable key (designed to be public).

## 6. Audio handling (services/audio.ts)

- `fetchBlob(url)` → `URL.createObjectURL(blob)` → set on `<audio src>`; **revoke** on replace
  and on unmount.
- Download: anchor with `download="speech-<id>.mp3"` pointing at the object URL (FR-007);
  filename from the audio id returned by the API.
- `AUDIO_EXPIRED` (404 with that code) on re-play attempts → message "audio expired, regenerate".
- Player is a **custom UI on the native `<audio>` element** (spec wants play/pause/seek/volume/
  progress with design control); native `controls` are the fallback if JS playback is unavailable.

## 7. Styling & layout

- Tailwind CSS, responsive single-column on mobile → two-column on ≥lg (editor left, controls +
  player right).
- Loading: skeleton for catalog; button spinner + disabled generate while loading.
- Empty/first-run: helpful placeholder in the textarea ("Type or paste up to 5,000 characters…").

## 8. Testing strategy (executed in Phase 19)

- **Component:** TextInput counts/validation; Language/VoiceSelector dependent behavior;
  GenerateButton states; AudioPlayer with a mocked `<audio>` (play/pause/seek events);
  DownloadButton anchor attributes.
- **Hook:** `useTts` state machine with a mocked API client (success, 400, 429, 503, abort,
  expired audio); `useVoices` cache + retry.
- **Contract:** response shapes validated against `@tts/types` via type-level tests + a fixture
  snapshot, so API drift fails the build, not the user.

## 9. What to remember

1. Web owns **presentation and orchestration**; packages own **knowledge** (types/schemas/limits).
2. One status machine per async concern; the UI is a pure function of it.
3. Counts are derived; object URLs are revoked; aborts are not errors.
4. The browser holds no secrets and makes no provider calls — ever.
5. Accessibility is part of the component contract, not a later pass.
