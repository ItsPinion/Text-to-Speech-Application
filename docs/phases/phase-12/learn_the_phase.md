# Phase 12 — Free AI Text Enhancement

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 11 (M2 done) · **Unlocks:** Phase 13 (prompt/model architecture)

## What this phase is

AI text enhancement, wired end-to-end under the **free-models-only constraint** (ai.md):

- `POST /api/ai/enhance` live: five operations (`correctGrammar`, `summarize`, `rewrite`,
  `makeConversational`, `simplify`), server-side key management, output validation + caps,
  rate limiting, honest 503s.
- `openaiCompatible.ts` adapter: one fetch-based client for **any** OpenAI-compatible chat
  completions endpoint — OpenRouter free models, Groq free tier, or local Ollama (user's choice
  via `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`).
- `AiEnhancePanel` (Phase 3's reserved slot): operation picker, enhance button, **review panel
  with Apply / Dismiss / Undo** (FR-015), and the disabled state with explanation when no key is
  configured (FR-016).
- `useAiEnhance`: a second async state machine with the same discipline as `useTts`.

The architectural split is the point: **AI touches text; TTS touches audio; they meet only in
the editor.** Enhancement is optional, skippable, and its absence never degrades the core.

## Why we build it this way

- **Constraint C2 operationally:** the app is complete with zero AI configuration (feature off,
  explained). A user who wants AI adds a *free* key to the server's `.env` and it works. No
  paid service is ever on the required path — and the code *cannot* drift into that state,
  because there is no paid integration to accidentally rely on.
- **One adapter, many free backends.** OpenAI-compatible chat completions is the lingua franca
  of free inference (cloud free tiers *and* local Ollama). One ~80-line fetch client serves all
  of them; model selection is data (`AI_MODEL`), not code. This is what makes "free models only"
  durable: the constraint is about *which* models the user points at, and our surface doesn't
  care as long as they're free.
- **Review-before-apply is a hard requirement, not a UX preference.** LLMs hallucinate;
  "corrections" can change meaning; summaries can invent. The only safe design is: the server
  returns *both* texts, the user compares, the user decides (Apply), with one-step Undo. This
  phase's UI contract encodes that (ai.md §5).
- **Output validation is server-side.** Prompts ask for "text only"; models still wrap in
  quotes, add "Sure! Here is…", or overshoot length. The server normalizes (strip fences/
  quotes, trim) then validates (non-empty string + per-op caps) — failure means *the provider
  misbehaved* → 503 `AI_UNAVAILABLE`, user keeps their original text untouched.

## How it works (internals)

### Server (ai.md §4 pipeline, executed)

```text
POST /api/ai/enhance { text, operation }
  validate (shared schema: text ≤ 5000, op enum)        → 400 INVALID_TEXT/TEXT_TOO_LONG/INVALID_OPERATION
  provider = createAIProvider(config)
    AI_API_KEY absent → provider "none" → 503 AI_NOT_CONFIGURED (stable, tested)
  rate limit 20/hour per (user | IP)                    → 429 + Retry-After
  messages = promptRegistry[operation].render(text)     (Phase 13 refines; v1 prompts work now)
  out = provider.generate({ messages, temperature: 0.2, maxTokens: cap[op], signal: 60 s })
  normalized = stripFences/quotes(out).trim()
  zod: string, non-empty, length ≤ cap[op]              → fail: 503 AI_UNAVAILABLE
  200 { operation, originalText, enhancedText, model }
error mapping: timeout/HTTP≥400/bad-JSON/empty → 503 AI_UNAVAILABLE
  (provider 429 → 503 with message noting free-tier limit was hit — it's still *their* service
   being unavailable to us right now; ops detail in logs only)
```

### The adapter (providers/ai/openaiCompatible.ts)

```text
POST {AI_BASE_URL}/chat/completions
  headers: Authorization: Bearer ${AI_API_KEY}   (Ollama: any non-empty value; some endpoints need "ollama")
  body:   { model: AI_MODEL, messages, temperature, max_tokens, stream: false }
  200 → choices[0].message.content
  non-200/timeout/malformed → AIProviderError { kind: "quota" | "timeout" | "bad-response" | "network" }
```

No SDK dependency (the API is plain HTTP/JSON); the client is testable by pointing at a stub
server in tests.

### Client (useAiEnhance + AiEnhancePanel)

```text
aiState: { status: idle|loading|review|error, operation, original?, enhanced?, error? }
idle → choose op + Enhance (enabled iff text non-empty & provider not known-off)
      → loading (button spinner; editable? no — text frozen during call, like generate)
      → 200 → review { original, enhanced } → Apply | Dismiss
Apply:  textState.value := enhanced (one-step Undo restores `original` in memory)
        → panel → idle; hint "Enhanced text applied — Undo available"
Dismiss: panel → idle; nothing changed
error:  code-driven copy (NOT_CONFIGURED → "Add a free AI key (see docs) to enable enhancement";
        RATE_LIMITED → seconds; AI_UNAVAILABLE → "AI service hiccup — retry"; 60s timeout → same)
Provider-off detection: GET /api/health/ready exposes checks.ai = "disabled" → panel renders
disabled state proactively (no 503 round-trip needed to learn the feature is off)
```

## Key concepts you should learn

- **LLM inference basics:** chat completions shape (system/user/assistant), tokens vs chars
  (~4 chars/token), `temperature` (0.2 = low variance, stable edits), `max_tokens` as a hard
  output bound, context window (our ≤5k-char input fits trivially), why `stream:false` is
  enough for edit operations.
- **Prompt engineering for *transformation* tasks:** role + task + hard constraints (same
  language, no commentary, text-only output) + output discipline; versioning prompts so a
  regression can be bisected.
- **Structured-output hygiene:** "text only" is a request, not a guarantee — normalize, then
  validate, then *still* let a human apply it. Three layers of defense.
- **Feature-gating by readiness:** `checks.ai` from the health endpoint drives proactive UI
  state instead of trial-and-error 503s (the readiness pattern from Phase 6 paying off).
- **Abort propagation for AI** (same as TTS: user cancel kills the upstream HTTP call; 60 s
  server timeout as the outer bound).
- **Free-tier economics:** limits belong to the provider (per-day request caps); our rate limit
  (20/hour) protects the user's own quota as much as anything we own.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| OpenAI-compatible HTTP adapter (no SDK) | Serves OpenRouter/Groq/Ollama; zero deps; trivially testable | Per-provider SDKs (3 codebases for 1 protocol), paid-specific SDK (violates C2) |
| `none` provider as first-class | "Feature off" is an explicit, testable state, not an error path | `if (key) … else throw` (scattered, ugly) |
| Proactive disable via readiness check | No 503 needed to tell the user the feature is off | Try-and-fail (worse UX, more load) |
| Server returns original + enhanced | Client can never be the only place the original survives (undo, audit) | Enhanced-only (loses undo, confuses "what changed?") |
| v1: no streaming for AI | Edit ops are short; one-shot keeps the machine simple | Streaming (nice for long rewrites; v2 extension point on `AIProvider.stream()`) |

## What gets created

```text
packages/types:  AiOperation, AiEnhanceRequest/Response, AIProvider, AIProviderError
packages/ai (skeleton; Phase 13 completes): prompts/v1 (5 ops), service.ts (pipeline)
apps/api/src/providers/ai/{factory.ts,openaiCompatible.ts,none.ts}
apps/api/src/{routes,controllers,services}/ai.*   (endpoint + service per the pipeline above)
apps/web/hooks/useAiEnhance.ts, components/AiEnhancePanel/*
.env.example: AI_BASE_URL / AI_API_KEY / AI_MODEL (documented: free tiers, Ollama example)
tests: adapter vs stub server (200/401/429/timeout/bad-JSON); pipeline caps & 503 mapping;
       "none" provider; panel Apply/Dismiss/Undo; readiness-disabled state
```

## Verification checklist (M3 gate)

- [ ] **No key:** readiness shows `ai: disabled`; panel disabled with explanation; core fully
      usable (full TTS flow re-verified)
- [ ] **Free key (OpenRouter `:free` or Groq):** all 5 ops return sensible, same-language edits;
      review panel shows both texts; Apply replaces + Undo restores; Dismiss no-ops
- [ ] Caps enforced: summarize of 5k chars → ≤ 500 chars; others ≤ 1.5× (test with boundary
      fixtures); model overshoot → 503 (stub server test)
- [ ] 429 path: 21st request in an hour → 429 with seconds; provider-side free-tier 429 → 503
      with "free-tier limit" copy
- [ ] Kill the AI endpoint → 60 s → 503 `AI_UNAVAILABLE`; user text untouched; retry works
- [ ] Ollama (local, keyless) works with the same endpoint code (integration note, user-run)
- [ ] Cancel mid-enhance → no error, state → idle, upstream request aborted (log-verified)
- [ ] Enhanced text → Generate → correct speech (the two features compose)
- [ ] No `AI_API_KEY` in the web bundle or logs (grep the bundle; Render/Vercel env audit)

## Common pitfalls

- **Auto-applying "to be convenient"** → violates FR-015; the review step is the product's
  safety property.
- **Prompt bloat** (asking the model to also "improve the title, maybe translate…") → one op,
  one task; scope drift is where quality goes to die.
- **Trusting model output shape** → the 503-on-invalid-output path is load-bearing; test it.
- **Using AI for something TTS should handle** (e.g., "make it sound friendlier" = voice/style
  problem, not text) → keep the split: text vs audio.
- **Logging user text + model output in full** → redaction (200-char previews) applies to AI
  payloads too (SR-11).

## How it connects to the rest of the system

- Phase 13 turns this phase's v1 prompts into the versioned `packages/ai` architecture and
  adds the model-selection guidance — same surface, deeper structure.
- Phase 15: enhanced generations carry the same history record (a `via_ai: true` flag — small
  honest provenance addition, no new requirements).
- Phase 18: the AI limiter (20/hour) and text cap are already in force here.
- Phase 21: `ai_latency_ms` histograms, `ai_errors_total{kind,code}` — keyed on the adapter.

## What to remember

1. Off by default, on with a free key, never paid: the constraint is an architecture, not a
   procurement decision.
2. One protocol (OpenAI-compatible) serves every free backend we'll ever name.
3. Original + enhanced always returned; Apply is the user's act; Undo is one step.
4. Model output is untrusted input: normalize → validate → cap → *then* show it to a human.
5. The readiness endpoint lets the UI know the feature is off *before* the user finds out the
   hard way.
