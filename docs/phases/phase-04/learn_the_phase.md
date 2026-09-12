# Phase 04 — Text Input & Client-Side Validation

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 3 · **Unlocks:** Phase 5 (generation needs a valid text source)

## What this phase is

The TextInput becomes a real, validated text editor:

- Multi-line textarea, paste-friendly, `CLEAR` button (FR-001, FR-012).
- **Live counts:** characters, words, remaining vs `MAX_TEXT_CHARS` (5,000) (FR-002).
- Client-side validation: empty / whitespace-only → field error; over-limit → hard stop with a
  precise "N characters over" message (FR-009 — the *client* half; the server half is Phase 7).
- The Generate button reflects validation: disabled with reasons, never silently dead.
- Error display in the shared `aria-live` region (FR-008, NFR-009).

## Why we build it this way

- **Validate in the browser to respect the user's time** (no round-trip to discover empty text),
  but **re-validate on the server anyway** — client validation is UX, server validation is the
  contract (SR-02). Both use the *same* zod schema from `@tts/validation`, so the rules cannot
  drift: the client runs it for instant feedback; the server runs it as authority.
- **Counts are derived state.** Characters = `text.length` (code points, see pitfall), words =
  whitespace-split non-empty tokens, remaining = `max - chars`. Computed in the render path from
  one source of truth (`text`). There is no `setChars`, no effect syncing them — a whole class of
  bug is made unrepresentable.
- **The editor is not an API.** It has no idea what TTS is. It owns one string and reports its
  state; the workspace decides when to send it.

## How it works (internals)

```text
TextInput props:  { value, onChange(v), onClear(), error?, disabled? }
workspace:        textState = { value, error? }
derived (render): chars, words, remaining, canGenerate = valid && voiceSelected && !loading
onChange:         setText(v)  →  error cleared on edit (stale errors die with the input)
validate(v):      zod safeParse → issues mapped to { code: INVALID_TEXT|TEXT_TOO_LONG, message }
                   (schema: string, trim, min 1 "Enter some text", max 5000 "Text is N chars over the 5,000 limit")
counts:           chars = Array.from(v).length
                  words = v.trim() === "" ? 0 : v.trim().split(/\s+/).length
Clear:            setText("") + revoke audio object URL + reset ttsState to idle (one action,
                  consistent world — clearing text orphans any previously generated audio)
```

UX details that matter:

- Counts update on every keystroke (cheap: single string ops; 5,000 chars is nothing).
- Counter turns amber near the limit (≥ 90%), red over — before the error text appears.
- Paste of huge content is allowed into the box but the over-limit message tells the user exactly
  how much to cut (we do **not** silently truncate user text — AI/file paths truncate with
  explicit notice; typed text never is).
- `disabled` while a generation is in flight (edit-after-generate still allowed; new text simply
  belongs to the *next* generation — documented behavior).

## Key concepts you should learn

- Controlled components: the textarea renders from state; the DOM is a display, not a store.
- **Derived state**: compute in render; never store what you can derive.
- Form validation patterns: validate on change (after first blur), clear-on-edit, field-level
  vs form-level errors, actionable messages ("123 characters over" not "invalid").
- Shared-schema validation: one zod schema, two runtimes, zero drift.
- Unicode: `String.prototype.length` counts UTF-16 units; emoji/decompose sequences break naive
  counting — count **code points** (`Array.from(text).length`) so "5,000 characters" means what
  users mean. (The server counts the same way — this is in the shared schema's docs.)
- Accessibility: `aria-invalid`, error association (`aria-describedby`), `aria-live` announcement.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Plain controlled `<textarea>` | Zero dependencies, full paste/IME behavior | Rich text editors (content is plain text; a RTE adds 5× the surface) |
| zod in browser (shared schema) | Same rules as server, validated types, tiny (tree-shaken) | Hand-rolled regex checks (drift), shared "rule objects" (weaker typing) |
| Code-point counting | Emoji-safe limits | UTF-16 length (miscounts) |
- Error copy from the shared registry | Same message tone client/server; i18n-ready later | Per-component copy strings |

## What gets created

```text
apps/web/components/TextInput/*   (real contract: counts, validation display, clear)
packages/validation:              textSchema (trim/min/max + code-point max fn) + copy
apps/web: workspace textState wiring; Generate enablement logic
tests (Phase 19 hooks now):        TextInput counts for ASCII/emoji; over-limit message; clear resets
```

## Verification checklist

- [ ] Type → chars/words/remaining update live; 0 chars → 0 words
- [ ] Emoji paste: "😀😀" counts as 2 characters (code points), not 4
- [ ] Empty submit attempt → field error "Enter some text"; no network call (devtools check)
- [ ] 5,001 chars → "1 character over"; Generate disabled; amber→red counter at 90%
- [ ] Clear → text, counts, error, player state all reset together
- [ ] Keyboard: Tab focuses textarea → error announced by screen reader (VoiceOver/NVDA spot check)
- [ ] Server (Phase 7) rejects the same cases with the same codes — cross-check via curl
- [ ] No `setChars`/`setWords` state exists anywhere (grep)

## Common pitfalls

- **Storing counts** and syncing them in effects → stale counts after undo/paste/IME composition.
- **Validating on every keystroke *as error*** before the user finishes a word → validate for
  display continuously, but treat *empty* as an error only on submit attempt (annoyance tax).
- **Silent truncation of typed text** → never; explicit over-limit message instead.
- **Forgetting IME composition** (Japanese/Hindi input methods): don't clear state on `input`
  events that are part of composition — the controlled textarea handles this if you don't fight
  it (no value "corrections" mid-composition).
- **Client rules diverging from server** → the shared-schema rule prevents this; review any
  "temporary" client-only limit as a bug.

## How it connects to the rest of the system

- Phase 5/6: `textState.value` + voice selection feed `POST /api/tts` (Phase 10).
- Phase 7: the same `textSchema` runs server-side; identical codes/messages.
- Phase 12: AI enhancement's Apply writes into this same `textState` (one text, many sources:
  typed, AI-applied, file-uploaded — the editor doesn't care which).
- Phase 17: file extraction fills `textState` with a `truncated` notice banner (separate
  concern, same sink).

## What to remember

1. One source of truth (`text`); everything else (counts, validity) is computed from it.
2. Client validation = courtesy; server validation = law; same schema = no drift.
3. "Characters" means code points — users think in glyphs, not UTF-16 units.
4. Clearing is a state *transition* (text + audio + errors together), not three coincidences.
5. Validation messages are instructions ("123 characters over the limit"), not diagnostics
   ("invalid text").
