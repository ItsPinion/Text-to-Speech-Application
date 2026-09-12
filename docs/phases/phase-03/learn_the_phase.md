# Phase 03 — Next.js Frontend Foundation

**Status:** ✅ implemented & verified (as-built notes below)
**Builds on:** Phase 2 · **Unlocks:** Phases 4–5 (features plug into this shell)

## What this phase is

The full UI **shell** of the TTS workspace with every core component present, wired to **mock
data** — no API calls yet. Design: [architecture/frontend.md](../../architecture/frontend.md).

Layout (responsive: single column → two columns on ≥lg):

```text
┌────────────────────────────────────────────────────────┐
│  Text to Speech                        [Sign in (v2)]  │
├──────────────────────────────────┬─────────────────────┤
│  TextInput (textarea + counts)   │  LanguageSelector   │
│  …                               │  VoiceSelector      │
│  [Clear]                         │  [Generate Speech]  │
│                                  │                     │
│  FileUpload (v2, placeholder)    │  AudioPlayer        │
│  AiEnhancePanel (v2, disabled)   │  [Download Audio]   │
│                                  │                     │
│  ErrorMessage (aria-live)        │                     │
└──────────────────────────────────┴─────────────────────┘
```

## Why we build it this way

- **Shell first, mocks second, real API third (Phase 10):** components can be designed, styled,
  and tested against stable mock shapes *before* the backend exists. The mocks are generated from
  the **shared types** (`@tts/types`), so "mock" and "real" are the same contract — Phase 10 is
  then a swap of data sources, not a redesign.
- **One cohesive client workspace:** the TTS screen is stateful (text, selection, loading,
  audio). We render it as a client component tree; the page/layout shell stays a server
  component. This is an honest, minimal use of the App Router — we are not reaching for SSR to
  solve a problem we don't have (NFR-001: the UI's job is interaction, not initial content).
- **Components own presentation, hooks own behavior, services own I/O** (frontend.md §1): the
  split that makes Phase 19's tests trivial (mock the service, assert the machine).

## How it works (internals)

- **App Router pieces:** `app/layout.tsx` (metadata, future `ClerkProvider` slot, global
  providers), `app/page.tsx` (renders `<TtsWorkspace/>` client root). No API routes in `apps/web`
  — Express is the only API (single source of truth for the contract).
- **Component contracts** (spec §10 responsibilities, implemented as props-in/events-out):

| Component | Props (in) | Events (out) | Notes |
| --- | --- | --- | --- |
| TextInput | `value, onChange, error?, disabled?` | `onClear` | counts rendered here from derived values |
| LanguageSelector | `languages, value, onChange, loading?` | — | native `<select>` |
| VoiceSelector | `voices, value, onChange, loading?, error?` | — | filtered by language in the parent |
| GenerateButton | `status, onCancel?` | `onGenerate` | spinner + Cancel while loading |
| AudioPlayer | `src?, audioId?` | `onStateChange` | owns the `<audio>` element |
| DownloadButton | `enabled, audioId?, url?` | — | hidden/disabled without audio |
| ErrorMessage | `error?: ApiError` | `onDismiss` | single `aria-live` region |

- **Mock service (services/api.ts stub):** same function signatures the real client will have
  (`getVoices()`, `generateSpeech(req)`, `fetchAudio(id)`); returns fixtures with a tiny
  artificial delay so loading states are visible. A `NEXT_PUBLIC_USE_MOCKS=1` flag toggles it
  (removed in Phase 10).
- **Tailwind:** small `ui/` primitives (Button, Select, Spinner, Badge, Card) keep the screen
  consistent; no design-system ambition beyond that.
- **State plumbing:** the workspace root holds the (still shallow) state objects from
  frontend.md §2; Phase 4 deepens `textState`, Phase 5 `voiceState`, Phase 10 `ttsState`.

## Key concepts you should learn

- App Router: server vs client components, the `'use client'` boundary, layouts/pages, why our
  boundary is where it is.
- Component design for *state machines*: props describe a state, events change it — the parent
  owns truth, children render it (avoids the classic "which component owns this state" debates).
- Derived vs stored state (counts derived from text — no sync code exists).
- Accessibility as a component contract (labels, focus, `aria-live`) from the first render.
- Mock-driven development: designing against types, not against a running server.
- Next dev proxy: the browser already calls `/api/...` same-origin in this phase's mocks — the
  URL shape in Phase 10 doesn't change.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| App Router + one client workspace | Interaction-dense screen; SSR buys little here; still get routing/layout/metadata | Making everything RSC with server actions (server actions can't own an in-flight audio fetch lifecycle cleanly), Pages Router (fine but older model) |
| Tailwind CSS | Spec-listed; fast iteration; consistent utility classes | CSS modules (fine), shadcn/ui (pulls more deps than v1 needs; revisit if UI grows) |
| Native `<select>` for language/voice | Free keyboard/screen-reader support; hundreds of voices work fine | Custom listboxes (a11y cost > benefit) |
| Mocks from shared types | Contract parity before integration | Hard-coded mock shapes (drift risk) |
| No state library | ~5 state objects, one screen; React state + hooks is the right weight | Redux/Zustand (revisit if Phase 15+ pages grow) |

## What gets created

```text
apps/web/app/{layout.tsx,page.tsx,globals.css}
apps/web/components/{TextInput,LanguageSelector,VoiceSelector,GenerateButton,
                     AudioPlayer,DownloadButton,ErrorMessage,ui/…}/
apps/web/services/api.ts          (mock implementation, real signatures)
apps/web/services/audio.ts        (object-URL helpers — already real)
apps/web/lib/constants.ts         (re-exports @tts/validation limits)
```

## Verification checklist

- [ ] Page renders the full shell on mobile and desktop (no horizontal scroll)
- [ ] Every component renders with mock data; loading states visible with the fake delay
- [ ] Selects are keyboard-operable; error region announces when populated
- [ ] Lint/typecheck green; no `any` in components
- [ ] Mocks use `@tts/types` shapes (type-level: assigning a mock to `VoicesResponse` compiles)
- [ ] `/api/health` still reachable through the dev proxy (proxy intact after layout changes)

## Common pitfalls

- **Spreading state across siblings** (each component "remembers" its own selection) → parent
  owns state; children are pure.
- **Styling inside logic** (conditional class soup) → small ui primitives + explicit variants.
- **Making the whole app a client component** (putting metadata/Clerk stuff client-side early)
  → keep the boundary at the workspace root.
- **Designing the player for a format we don't produce** → MP3 only (tts.md §6).

## How it connects to the rest of the system

- Phase 4 fills TextInput with real validation behavior (same component, deeper contract).
- Phase 5 swaps mock catalog for the API via `useVoices` (same props).
- Phase 10 replaces `services/api.ts` internals — every component is untouched if this phase's
  signatures were honest.
- Phase 12/17 add AiEnhancePanel/FileUpload into the same right/left columns (slots reserved).
- Phase 14 drops `ClerkProvider` into `layout.tsx` — the slot is pre-wired.

## As-built notes

- Delivered together with Phase 2 (one Arena working session on
  `arena/01a094ee-native-text-to-speech`).
- **Everything in "What gets created" exists**, laid out per frontend.md §1: `components/`
  (TextInput, LanguageSelector, VoiceSelector, GenerateButton, AudioPlayer, DownloadButton,
  ErrorMessage, FileUpload + AiEnhancePanel placeholders, `ui/` primitives = Button, Spinner,
  Badge, Card, Select), `services/api.ts` + `services/audio.ts`, `lib/constants.ts`
  (re-exports `@tts/validation` only), `mocks/voices.ts`.
- **The `'use client'` boundary sits at `components/TtsWorkspace.tsx`** — `app/layout.tsx` and
  `app/page.tsx` stayed server components (metadata intact; ClerkProvider slot pre-wired with a
  comment). The workspace root owns textState/voiceState/ttsState per frontend.md §2; counts
  are derived on render; children are pure props-in/events-out per the contract table.
- **Mocks are the real contract:** `MOCK_VOICES_RESPONSE` is declared AS `VoicesResponse` and
  every fixture is `satisfies Voice[]` — the checklist's type-level proof is the compile
  itself. `services/api.ts` carries the FINAL signatures (`getVoices`, `generateSpeech`,
  `fetchAudio`); Phase 10 flips data sources, not types. Slightly ahead of spec, recorded
  honestly: the real `request()` transport (error-envelope parsing → `ApiError`, timeout,
  abort pass-through) is already implemented and exercisable via `NEXT_PUBLIC_USE_MOCKS=0` —
  it just isn't the default until the backend routes exist (Phases 5/9).
- **The mock is honest about failure too:** mock `generateSpeech` throws registry-backed
  `ApiError`s (`INVALID_TEXT`, `INVALID_VOICE` — same codes and messages the server will send
  via `ERROR_REGISTRY`), so the ErrorMessage region and code-badge rendering are dress-
  rehearsed before Phase 7 exists.
- **The AudioPlayer plays real bytes in the mock phase:** a 11.5 KB MP3 fixture (two-tone
  chime, mono 64 kbps, generated with lamejs) lives at `public/mock/speech-fixture.mp3`;
  `mockFetchAudio` serves it so play/pause/seek/volume/download are genuinely exercisable.
  Custom transport UI on the native `<audio>` element, MP3-only, `aria-valuetext` on the seek
  slider (mm:ss).
- **Object-URL hygiene is real:** the workspace tracks the current blob URL in a ref, revokes
  on replace and on unmount; `services/audio.ts` is final-form (create/revoke/filename
  helpers, `speech-<audioId>.mp3` per FR-007).
- **Accessibility baseline in place:** every control labeled, native `<select>`s, ONE
  `aria-live="assertive"` error region (permanent wrapper so the first announcement fires),
  polite live counts + sr-only generate-status announcements, visible focus rings throughout.
- **Verification executed:** page renders the full shell (SSR HTML checked for every
  component incl. placeholders), no horizontal-scroll layout (single column → `lg:grid-cols`,
  `min-w-0` guards), lint/typecheck/test/build all green repo-wide, **no `any` in
  components/services**, `/api/health` still reachable through the dev proxy, fixture served
  200. Loading states are visible with the mock delays (400/700/250 ms).
- **Deliberate placeholder states:** FileUpload shows the 10 MB limit and a "Phase 17" badge;
  AiEnhancePanel renders the five SHARED `AI_OPERATIONS` with labels, disabled, "Phase 12"
  badge; header holds a disabled "Sign in" button as the Phase 14 slot. The footer states the
  mock-data status so nobody mistakes the shell for the integrated product.

## What to remember

1. Shell first: structure and contracts before behavior; mocks keep you moving without a backend.
2. Parent owns state; children render state and emit events.
3. The `'use client'` boundary is a design decision — put it at the interaction root, not the page.
4. Accessibility is prop-level work from day one; retrofitting `aria` is painful.
5. If Phase 10 requires changing a component's *props* (not just its data source), this phase
   under-specified the contract — fix the contract, not the components.
