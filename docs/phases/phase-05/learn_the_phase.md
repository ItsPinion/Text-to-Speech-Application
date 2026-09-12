# Phase 05 — Language & Voice System

**Status:** ✅ implemented & verified (as-built notes below)
**Builds on:** Phase 4 · **Unlocks:** Phase 6 (the API must serve the catalog this UI consumes)

## What this phase is

Language and voice selection driven **entirely by the backend catalog** (FR-003/004/010):

- On load: fetch `GET /api/voices` (mocked until Phase 10; endpoint designed and stubbed in
  Phase 6 with the same shape).
- **Languages** = deduplicated locales from the catalog (with human labels, sorted).
- **Voices** = catalog entries filtered by the selected language; each shows display name +
  gender hint ("English (US) — Aria · Female").
- Dependent behavior: changing language resets the selected voice to that language's default
  (first in list, or the user's preference in Phase 16); a selected voice that disappears from a
  refreshed catalog is reset safely.
- Loading (skeletons), error (message + retry button), and cached-availability states.

## Why we build it this way

- **The backend is the source of truth for voices** (spec: "the backend should eventually be the
  source of truth" — we make it *always* so). The browser hard-codes zero voices. Consequences:
  adding a language = provider change, not app change; A/B voice sets are server-side; the UI
  can never offer a voice the API can't synthesize (a whole class of 400s disappears).
- **Dependent selectors are a classic API-driven UI pattern:** `language → voices(language) →
  selectedVoice`. Getting the reset semantics right (when does selection reset? preserve if
  still valid) is the whole design problem — the widgets are trivial.
- **Catalog lifecycle lives in the service, not the component** (tts.md §4): fetch once, cache
  in memory with a TTL, retry with backoff, serve stale on refresh failure. The component just
  renders `{ voices, languages, loading, error }`.

## How it works (internals)

```text
useVoices():
  state: { status: idle|loading|ready|error, voices, languages, stale? }
  on mount: GET /api/voices
    200 → ready (cache in module-level memory, TTL 5 min client-side; server caches 24 h)
    failure → retry once (1 s backoff) → error state with retry()
  refresh(): explicit (UI refresh icon) or when a TTS call returns INVALID_VOICE
    (catalog drift → force refresh, then re-validate selection)

voiceState (workspace):
  { language, voice }
  language change → voice := defaultVoice(language)
  catalog (re)load → keep selection if present, else reset to defaults
  derived: voicesForLanguage = voices.filter(v => v.language === language)
```

REST design decisions (documented, used by Phase 6):

- **One endpoint, `GET /api/voices`**, returns voices *and* derived languages. Rationale: the
  UI needs both atomically (a language with zero voices is meaningless); two endpoints create a
  consistency window; the payload is small (hundreds of voices × 4 fields).
  Alternatives: `GET /api/languages` + `GET /api/voices?language=` (more "REST-pure", more
  round-trips, more drift — rejected and recorded in architecture decisions).
- Voice `id` is the **provider short name** (`en-US-AriaNeural`) — stable within a provider,
  opaque to the UI; the UI never parses it.

## Key concepts you should learn

- REST resource design: what *is* the resource (the catalog, as a whole, at a moment in time)?
  Representations vs resources; when to combine vs split endpoints; idempotency of GETs.
- **API-driven UI:** components as pure functions of server state; loading/error/empty/ready
  as first-class render states (the "four states" habit).
- Dependent/conditional form controls and reset semantics.
- Client caching of reference data: TTL, stale-while-revalidate, invalidation on 400-signal
  (INVALID_VOICE → catalog changed).
- Server-side catalog caching (24 h TTL, stale-on-refresh) — a reference-data pattern that keeps
  provider egress near zero.
- Internationalization of *data* (labels per locale) vs i18n of the *UI* (out of scope, v1).

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Single catalog endpoint (voices + languages) | Atomic consistency, one round-trip, tiny payload | Separate languages/voices endpoints (more REST-pure, more complexity — recorded rejection) |
| Voice id = provider short name | Stable, human-debuggable, maps 1:1 to synthesis calls | Surrogate ids (extra mapping layer, no benefit at this scale) |
| Client TTL 5 min + server 24 h | Two cache layers with honest staleness | No client cache (egress on every page load), infinite client cache (voice removals invisible) |
| `useVoices` hook as sole owner | One fetch lifecycle, testable in isolation | Fetch inside components (duplicate lifecycles), global store (overkill) |

## What gets created

```text
apps/web/hooks/useVoices.ts            (fetch/cache/retry/refresh)
apps/web/components/LanguageSelector/* (real contract)
apps/web/components/VoiceSelector/*    (real contract: filtered list, gender hint, reset)
services/api.ts: getVoices() signature (mock now, real in Phase 10)
Phase 6 handoff: GET /api/voices implemented against the same @tts/types shape
```

## Verification checklist

- [ ] First load: skeleton → populated selects; zero network calls on re-mount within TTL
- [ ] Language change resets voice to that language's default; re-selecting the previous
      language restores *defaults*, not stale picks (documented; preferences override in Phase 16)
- [ ] Simulated 503: error state + working Retry; no broken empty selects
- [ ] Simulated catalog refresh that removes the selected voice → selection auto-resets, no crash
- [ ] Voice list shows name + locale + gender; search-by-keyboard (type-ahead in native select)
- [ ] Network tab: exactly one `/api/voices` per cold load; INVALID_VOICE handling path exercised
      (Phase 10, against real API)
- [ ] Catalog shape in `@tts/types` compiles against the real endpoint's response (Phase 10 gate)

## Common pitfalls

- **Hard-coding a fallback voice list "just in case"** → the backend is the source of truth;
  "just in case" lists become stale lies. Error state + retry instead.
- **Selecting a voice, then a language, then re-selecting the old language expecting the old
  voice** → define reset semantics explicitly (we do: defaults/preferences, never ghosts).
- **Client and server disagreeing about languages** (UI shows a locale the catalog dropped) →
  single catalog endpoint + refresh-on-400 prevents it.
- **Unbounded select performance** with 500+ voices → native selects handle hundreds fine; if
  it ever stutters, add filter-as-you-type (v2, not now).
- **Caching the *selected* voice across languages** → per-language defaults, not global memory.

## How it connects to the rest of the system

- Phase 6: this phase's shape **is** the `GET /api/voices` contract (API.md §2.3).
- Phase 9: the `voice` id travels in `POST /api/tts`; the API re-checks catalog membership
  (defense in depth — the UI *should* only offer valid ids, and it re-validates anyway).
- Phase 16: user preferences (default language/voice, recent voices) plug into the *reset
  semantics* defined here — the hook already consults a "default provider" function.
- Phase 19: `useVoices` is unit-tested with a mocked service (TTL, retry, invalidation paths).

## As-built notes

- Delivered on the Arena session branch (`arena/01a094ee-native-text-to-speech`), one session
  with Phases 2–4.
- **`hooks/useVoices.ts` is the sole catalog owner**, exactly per the doc's state machine:
  module-level cache (5-min TTL) → re-mounts inside the TTL render ready on the FIRST render
  with zero network calls; expired cache renders immediately flagged `stale: true` and
  revalidates in the background (stale-while-revalidate); failure → ONE automatic retry after
  1 s → hard-error state with `retry()`; a refresh failure with data on screen keeps serving
  it, flagged stale — the "serve stale on refresh failure" rule. `refresh()` is exposed for
  the explicit UI button and the future INVALID_VOICE signal (Phase 10).
- **Defaults flow through exported helpers** (`selectDefault`, `defaultVoiceFor`) — Phase 16
  preferences swap ONE function; callers never change.
- **The workspace owns only the selection** (`{ language, voice }`) plus the reconciliation
  effect: on every catalog (re)load, keep the selection only if the voice is still present
  FOR THE (possibly re-derived) language; otherwise reset to defaults — never ghosts.
  Language change always resets to that language's first voice (FR-004).
- **Four-states UI in the selectors card:** loading skeletons (selectors), ready (selects +
  generate), hard error (red panel, code badge, message, working Retry — no broken empty
  selects), stale (amber "may be outdated" badge). A catalog meta row shows the
  source-of-truth note and an always-available refresh icon-button ("Refresh voice catalog").
- **VoiceSelector shows the gender hint** ("English (US) — Aria · Female"; omitted when
  unknown); LanguageSelector unchanged (already the Phase 3 contract). Zero hard-coded voices
  in the app: the old inline fixture-loading effect is gone; everything flows through the
  hook → `getVoices()` (mock internals until Phase 10, same signature).
- **Tests — 11 new (41 total green), all checklist behaviors simulated:** hook tests
  (load-once; TTL cache with zero refetch; fake-timer time-travel past the TTL for the
  stale/revalidate path; double-failure → error → manual retry recovery; refresh-replaces;
  refresh-failure-serves-stale; default helpers) and workspace tests (default selection +
  gender hint; language away-and-back restores DEFAULTS not stale picks; refresh removing the
  selected voice auto-resets; hard error renders retry and recovers). Service module mocked
  via `vi.mock("@/services/api")` — the hook is agnostic to mock-vs-real, exactly the
  Phase 10 swap property.
- **SSR note (expected behavior):** the catalog fetch is client-side, so the SSR HTML shows
  the loading skeleton; selects populate after hydration. The four-states render IS the design.

## What to remember

1. The API owns the catalog; the UI renders it. Zero hard-coded voices in `apps/web`.
2. Dependent selectors are 10% widgets, 90% reset semantics — decide those on paper first.
3. Reference data gets cached at both ends with *different* TTLs (client 5 min, server 24 h) —
   and honest staleness beats fake freshness.
4. A 400 `INVALID_VOICE` from synthesis is a *catalog drift signal* → refresh, re-select, retry.
5. The "four states" (loading / ready / error / empty) are the real design of any API-driven UI.
