# AI Text Enhancement Architecture (Free Models Only)

Covers AR-01…AR-08, FR-014…FR-018, UF-2. This is a **separate concern from TTS** by design:
enhancement happens on text, before synthesis, and can be skipped entirely.

```text
User text
   ├──▶ Direct TTS (always available)
   └──▶ AI enhancement (optional, free-key gated)
              │
              ▼
        Enhanced text ──(user confirms: Apply)──▶ editor ──▶ TTS
```

## 1. The free-only constraint, operationally

"Free AI models only" means: **the project must never require a paid API to run**, and any AI
capability used by default must be obtainable by a normal user at zero cost. Our operational
definition:

1. AI is **off by default** (no key configured) — the app is complete without it (AR-02).
2. When enabled, it targets **free-tier / free-model** endpoints via the user-supplied key.
   Documented, first-class options (both OpenAI-compatible):
   - **OpenRouter** with a `:free`-tagged model (free registration; some free models have
     per-day request caps — the provider enforces them, we surface the 429/503).
   - **Groq** free tier (fast inference, generous free limits, OpenAI-compatible API).
3. The same integration works with any OpenAI-compatible endpoint, including a **local Ollama**
   (`http://localhost:11434/v1`, no key) if the user prefers fully local inference — free by
   nature. We document it as a user choice, not the default (hardware-dependent).
4. No paid model is configured in any example, default, test, or CI path.

This satisfies the constraint while staying honest: "free" here means *the user can access it
for free*, not *zero infrastructure anywhere*.

## 2. Provider abstraction (packages/ai)

```text
packages/ai/
├── prompts/            # versioned prompt templates per operation (pure data + render fns)
│   ├── index.ts        # registry: operation → { system, render(userText), version }
│   └── v1/…
├── providers/
│   ├── types.ts        # AIProvider interface
│   ├── openaiCompatible.ts  # fetch-based client for any OpenAI-compatible chat completions
│   └── none.ts         # explicit "not configured" provider (returns AI_NOT_CONFIGURED)
├── schemas.ts          # zod: request, per-op output validation + caps
├── service.ts          # enhance(text, op, provider, config): prompt build → call → validate
└── index.ts
```

```ts
interface AIProvider {
  readonly id: string;                          // "openai-compatible" | "none"
  generate(req: {
    messages: { role: "system" | "user"; content: string }[];
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<{ content: string; model: string }>;
  // stream() is an optional extension — not required in v1 (TTS output is one-shot)
}
```

Factory in `apps/api`: `AI_API_KEY` present → `openaiCompatible` (base URL/model from env);
absent → `none`. The **AI service** depends only on the interface; the web UI depends only on
the API contract.

## 3. Operations & contracts

| Operation | Purpose | Prompt intent (v1) | Output cap |
| --- | --- | --- | --- |
| `correctGrammar` | Fix grammar/punctuation only | "Edit for grammar and punctuation only. Preserve wording, meaning, language, and tone. No commentary. Return only the corrected text." | ≤ 1.5× input |
| `summarize` | Short summary | "Summarize in the same language. Max N sentences. Preserve key facts; no invention." | ≤ 500 chars |
| `rewrite` | Clearer phrasing | "Rewrite for clarity. Keep meaning and language. No commentary. Return only the text." | ≤ 1.5× input |
| `makeConversational` | Speech-friendly, natural | "Rewrite as natural spoken language. Short sentences, contractions where natural. Keep facts." | ≤ 1.5× input |
| `simplify` | Simpler words | "Simplify vocabulary and sentence structure for a younger/less familiar reader. Keep meaning." | ≤ 1.5× input |

All ops: **return only the resulting text** (no prefaces/quotes) — enforced by prompt *and*
post-processing (strip enclosing quotes/markdown fences if present) *and* zod validation
(AR-05). Validation failure → `AI_UNAVAILABLE` (the provider misbehaved; the user gets "retry").

## 4. Request pipeline (server)

```text
POST /api/ai/enhance { text, operation }
  1. zod validate (text ≤ 5000, op ∈ enum)              → 400
  2. provider = factory()                               → none: 503 AI_NOT_CONFIGURED
  3. rate limit (20/hour per user-or-IP)                → 429 + Retry-After
  4. build messages from versioned prompt (v1)
  5. generate(temperature 0.2, maxTokens per op, 60s timeout)
  6. normalize (trim, strip fences/quotes, collapse 3+ newlines)
  7. zod validate output + caps                         → fail: 503 AI_UNAVAILABLE
  8. 200 { success, operation, originalText, enhancedText, model }
```

HTTP mapping: provider 4xx (quota/auth) → 503 `AI_UNAVAILABLE` (message distinguishes
"rate limit at provider" when detectable so the UI can say "your free-tier limit was reached");
timeout → same; non-JSON / missing `choices` → same. We never return raw provider errors.

## 5. UI contract (review-before-apply, FR-015/FR-017)

- Enhancement is **opt-in and reversible**:
  - panel shows operation picker + "Enhance" (disabled with explanation when `AI_NOT_CONFIGURED`);
  - result renders side-by-side / as a diff-like preview: original vs enhanced;
  - **Apply** replaces editor text (one-step Undo restores it, client-side memory);
  - **Dismiss** discards.
- The API always returns *both* texts — the server never mutates the user's text state.
- After Apply, the normal Generate flow proceeds; nothing about the TTS path changes.

## 6. Model & parameter guidance

- `temperature` 0.2 (deterministic-ish edits; summarization may go 0.4 — per-op config).
- `maxTokens`: capped per operation (e.g., 1024 default; summarize 512) to bound cost/latency.
- Model selection is **the user's** (`AI_MODEL`); docs recommend small free models for edits
  (edits don't need frontier models) and warn that free tiers have per-day caps.
- Context: we send one system + one user message; text ≤ 5000 chars ≈ ≤ ~1,500 tokens — fits
  comfortably in every free-tier context window. No chunking needed in v1 (documented limit:
  very long texts are bounded by MAX_TEXT_CHARS anyway).

## 7. Safety & limitations (documented in phase-13)

- **Hallucination:** summaries can invent; prompts forbid it, and users review before applying.
  This is why Apply is explicit — the UI safeguard is a core requirement, not a nicety.
- **Scope drift:** grammar "correction" can over-edit; output caps + review contain the damage.
- **Language fidelity:** ops must preserve the text's language (prompt-enforced; the TTS voice
  language is chosen separately by the user, so a mismatch would be audible, not silent).
- **No secrets in prompts:** user text is data; provider key is header-only; prompts never log
  user text in full (redaction, SR-11).
- **Abuse:** our rate limit (SR-04) protects the user's *own* free-tier quota as much as our
  cost (the key is the user's).

## 8. What to remember

1. AI is an **optional, swappable leaf** — off by default, on with a free key, never paid.
2. One interface (`AIProvider`) + versioned prompts + validated outputs = replaceable models
   without touching the UI or the API contract.
3. The server returns original + enhanced; **the user decides** (Apply/Dismiss/Undo).
4. Every provider misbehavior is a mapped 503 with a stable code; 4xx is reserved for our own
   validation.
5. The same code runs against OpenRouter, Groq, or local Ollama — that portability is the point
   of the abstraction.
