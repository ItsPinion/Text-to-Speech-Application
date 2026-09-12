# Phase 08 — TTS Provider Abstraction

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 7 · **Unlocks:** Phase 9 (edge-tts plugs in without touching the API)

## What this phase is

The architectural seam the whole TTS story depends on (tts.md §3): a `TTSProvider` interface, a
factory that picks the concrete engine from env, and a **mock provider** good enough to run the
entire API — and the entire test suite — without any network, any engine, and any key.

```text
routes/tts ─▶ controllers ─▶ TTS service ─▶ TTSProvider (interface)
                                        ├── edge-tts impl   (Phase 9)
                                        └── mock impl       (this phase)
        factory: createTTSProvider(config)  ← TTS_PROVIDER env (default edge-tts)
```

## Why we build it this way

- **Risk is in the dependency, so the boundary goes around the dependency.** edge-tts is an
  *unofficial* consumer endpoint (TR-09): it can break, change, throttle, or disappear. If
  Express is hard-wired to its SDK, every future fix is an app rewrite. If Express talks to an
  interface, the fix is: new adapter file + env flip. The abstraction is not academic — it is
  the mitigation for the project's biggest external risk, and it's why a *free* choice carries
  no *irreversible* commitment.
- **Testability is the bonus that pays for itself daily.** The mock provider gives Phase 19
  deterministic, offline, instant API tests (voices shape, tts pipeline, error mapping) and lets
  every developer run the product with zero network. "The whole system works with zero external
  dependencies" is a property we can assert and CI-verify.
- **The factory is the only place names are spoken.** `TTS_PROVIDER=edge-tts|mock` is read once,
  in the composition root. No other line of code knows which engine is running — that's what
  "provider is a leaf" means in practice.

## How it works (internals)

### The interface (packages/types)

```ts
interface TTSProvider {
  readonly id: string;                                  // "edge-tts" | "mock"
  listVoices(): Promise<Voice[]>;                       // tts.md §3.1 shape
  synthesize(req: { text: string; voiceId: string }): Promise<{
    audio: Uint8Array;                                  // MP3 bytes (mock: tiny valid MP3)
    contentType: string;                                // "audio/mpeg"
  }>;
}
```

Design decisions embedded in the interface:

- **Returns bytes, not URLs/streams/paths.** The service decides storage (AudioStore); the
  provider doesn't. URLs would leak storage decisions; paths are a filesystem leak.
- **`voiceId` is the catalog's id.** The provider resolves it internally; the service never
  parses provider internals.
- **Errors are provider-typed** (`TTSProviderError` with `kind: "network"|"rejected-voice"|"empty"|"unknown"`)
  so the service's mapping to `TTS_UNAVAILABLE` / `INVALID_VOICE` is a small, testable table —
  the provider never speaks HTTP status (providers don't know HTTP).

### The mock provider (this phase)

- `listVoices()`: a fixed, realistic catalog (~8 voices across en-US, en-GB, hi-IN, gu-IN,
  mr-IN, es-ES, fr-FR, de-DE) — small enough to eyeball, rich enough to exercise filtering.
- `synthesize()`: returns a **pre-computed tiny valid MP3** (a short tone) with a
  deterministic delay (150 ms) so loading states are observable; content is length-independent
  (documented: mocks don't model duration).
- Configurable failure modes for tests: `MOCK_TTS_FAIL=network|empty` env → throws the matching
  `TTSProviderError` (how the whole 503 path is tested without a flaky network).

### The factory & wiring

```ts
// apps/api/src/providers/tts/factory.ts
export function createTTSProvider(config: ApiConfig): TTSProvider {
  switch (config.ttsProvider) {
    case "edge-tts": return new EdgeTTsProvider(config);   // Phase 9
    case "mock":     return new MockTtsProvider(config);   // this phase
    default: throw new Error(`unknown TTS_PROVIDER: ${config.ttsProvider}`);
  }
}
// server.ts: app = createApp({ config, providers: { tts: createTTSProvider(config) }, … })
```

Fail-fast on unknown enum values at boot (config validation, Phase 1 pattern).

### What the service gains now (behavior live with mock)

```text
POST /api/tts:
  validate (Phase 7) → catalog lookup (INVALID_VOICE) → provider.synthesize
    → AudioStore.put(bytes) → 201 { audioId, audioUrl, format, … }
GET /api/audio/:id → store (LRU+TTL) → MP3 | 404 AUDIO_EXPIRED
```

With the mock, **the complete API contract is exercisable end-to-end today** — Phase 10's
frontend can even be built against the mock and flip to `edge-tts` by changing one env var.

## Key concepts you should learn

- **Port/adapter thinking:** the interface is the *port*; engines are *adapters*; the service
  is the core that must never know which adapter is installed.
- Interface design: minimal surface (`listVoices`, `synthesize`), value types in/out, errors as
  *typed domain errors* (kind-discriminated), no framework leakage (no `req`, no status codes).
- **Factory + env-driven selection** as the simplest DI: one switch, one env var, boot-time
  fail-fast.
- Test doubles as *runtime* citizens (the mock is also a dev/offline mode, not just a test toy).
- "Adapter error kinds → HTTP codes" mapping tables: small, exhaustive, tested.
- Why bytes-not-URLs (and the storage decision that follows: AudioStore, tts.md §5).

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Interface in `packages/types`, impls in `apps/api` | The contract is shared (web docs, tests); impls are app infrastructure | Impls in a package (forces package to own egress/deps), interface per-app (drift) |
| Bytes return + separate AudioStore | Storage policy is a service decision, swappable (NFR-011) | Provider returns temp file paths (filesystem coupling), URLs (storage leakage) |
| Provider-typed errors + mapping table | Providers stay HTTP-agnostic; mapping is auditable/testable | Providers throw AppErrors directly (layering bleed) |
| Mock as first-class engine (`TTS_PROVIDER=mock`) | Offline dev + deterministic tests + honest degradation option | Test-only mock (duplicate code), live-engine tests (network flake, cost) |

## What gets created

```text
packages/types:  Voice, SynthesisRequest/Result, TTSProvider, TTSProviderError
apps/api/src/providers/tts/{factory.ts,mock.ts,errors.ts}
apps/api/src/services/tts.service.ts   (real pipeline: lookup → synth → store → 201)
apps/api/src/services/audio.store.ts   (in-memory LRU+TTL — tts.md §5)
tests: pipeline with mock (201 path, INVALID_VOICE, MOCK_TTS_FAIL → 503 mapping, store TTL/eviction)
```

## Verification checklist

- [ ] `TTS_PROVIDER=mock bun run dev` → full contract live: voices (mock catalog) → generate →
      201 → `GET /api/audio/<id>` streams a valid MP3 (file plays in browser)
- [ ] Store: 30-min TTL expires (test with shortened TTL); LRU evicts at 200 files; expired id
      → 404 `AUDIO_EXPIRED`
- [ ] `MOCK_TTS_FAIL=network` → 503 `TTS_UNAVAILABLE`; `=empty` → 503; voice rejected → 400
      `INVALID_VOICE` — mapping table fully exercised
- [ ] No import of a concrete provider outside `factory.ts` (grep)
- [ ] `TTS_PROVIDER=bogus` → boot fails with a readable message (fail-fast)
- [ ] No network calls in the full test run (CI-dry-run: run suite with network disabled)
- [ ] Web can generate/play/download against the mock **today** (early win for Phase 10)

## Common pitfalls

- **The interface grows to please one engine** (engine-specific options leaking in: styles,
  descriptions, SSML) → keep v1 minimal; add an `options` bag *only* when a second engine
  actually needs it.
- **Providers returning status codes** ("it's easier") → the layering bleed kills the mapping
  table; providers report *kinds*, the service speaks HTTP.
- **Storing the mock's "MP3" expectation in the UI** → the UI consumes the *response's*
  `format` field, never an assumption (MP3 is current truth, contract allows the field).
- **Forgetting the TTL in tests** → tests run with `AUDIO_TTL_MS` shortened; production keeps
  30 min (config-driven everywhere).

## How it connects to the rest of the system

- Phase 9: `edgeTts.ts` is added beside `mock.ts`; `factory.ts` gains one case; **zero** route,
  controller, service, or client changes.
- Phase 10: frontend integration can proceed against `mock` immediately — de-risking the entire
  UI/backend wiring before egress-dependent code exists.
- Phase 19: the mock *is* the API test foundation; the real engine gets a small, separate,
  network-tagged smoke suite.
- Phase 21: readiness's `tts` check calls `listVoices()` (or the cache) through the same
  interface — provider-agnostic.

## What to remember

1. The abstraction is the mitigation for edge-tts's #1 risk (unofficial endpoint) — it's
   infrastructure, not ceremony.
2. One factory, one env var, zero other names: that's the whole "swappable engine" claim.
3. Providers return bytes + typed error kinds; the service speaks storage and HTTP.
4. The mock provider is a product feature (offline dev, deterministic tests), not a test detail.
5. If you must change this interface for engine #2, the change belongs to *both* engines' needs
   — never to one engine's convenience.
