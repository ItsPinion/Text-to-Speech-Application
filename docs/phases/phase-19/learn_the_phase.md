# Phase 19 — Automated Testing

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 18 · **Unlocks:** Phases 20–24 (production work on a verified base)

## What this phase is

The test pyramid, executed at every level the spec calls for (spec §17 "Testing", M5):

1. **Frontend** (Vitest + React Testing Library + jsdom): component + hook tests.
2. **Backend** (Vitest + Supertest against `createApp()`): API contract + error architecture.
3. **Integration:** web→api→provider with the **mock TTS/AI providers** (offline, deterministic)
   plus a small **network-tagged** suite against real edge-tts (opt-in, flake-tolerant).
4. **AI:** prompt → (stub) model → output validation, per operation.
5. **Contract tests:** the shared package *is* the contract — tests prove client and server
   compile against the same schemas/codes/limits.

Runners: `bun run test` at the root (Turbo task, depends on builds). CI gate: all green on PR
(Phase 22 makes it enforce it; this phase *builds the suites*).

## Why we build it this way

- **The architecture was designed for these tests.** `createApp(deps)` (Phase 6) means API tests
  inject the mock provider — no ports, no network, no env files. The state machines (Phases
  10–12) are testable as machines (feed transitions, assert states). The shared package means
  "client and server agree" is a *compile-time + test* property. Testing this project is fast
  precisely because earlier phases paid for testability; the pyramid here is cheap, and that's
  the point of the earlier design choices.
- **Determinism is the product of this phase.** No real network in the default suite (mock
  providers everywhere, clock injection for windows/TTLs, fake timers where needed). The real
  world gets its own *tagged, opt-in* suite — flakiness is quarantined, not tolerated.
- **The error matrix is a test list.** Phase 0's error matrix (requirements §6) is not prose —
  it's the backend suite's skeleton: one test per row, asserting code + status + envelope.
  Similarly, each phase's verification checklist became a test plan along the way; this phase
  consolidates the ones not yet covered.
- **Contract tests prevent the #1 monorepo failure** (drift between apps): a test asserts the
  web's error map keys exactly match the server registry's codes; a test asserts `ttsRequestSchema`
  accepts/rejects the same fixtures in both runtimes; a test asserts the voices response shape
  from the real (mock) provider matches `@tts/types` fixtures.

## How it works (internals)

### Test map (where each concern lives)

| Concern | Level | Tooling | Notes |
| --- | --- | --- | --- |
| TextInput counts/validation (incl. emoji code-points) | component | RTL | Phase 4 checklist |
| Language/Voice dependent selection + reset | component/hook | RTL + hooks | Phase 5 semantics |
| `useTts` machine: happy, 400, 429, 503, abort, expired | hook | Vitest (mocked api) | transitions + side effects (revoke) |
| `useVoices` TTL/retry/drift-refresh | hook | fake timers | |
| AudioPlayer events (play/pause/seek/ended/error) | component | mocked media element | Phase 11 |
| Download anchor (`speech-<id>.mp3`) | component | RTL | |
| AiEnhancePanel: apply/dismiss/undo, disabled-off | component | RTL | FR-015 behavior |
| api.ts: envelope decode, ApiError, timeout, abort merge | unit | fetch mock | Phase 10 |
| health/ready (both tiers) | API | Supertest | |
| voices: shape, catalog-cache, stale-serve on refresh failure | API + service | Supertest + fake timers | |
| **error matrix (every row)** | API | Supertest | code+status+envelope; details only on 4xx |
| tts pipeline (mock provider): 201, store TTL/LRU, AUDIO_EXPIRED, INVALID_VOICE, MOCK_TTS_FAIL→503 | API + service | Supertest | clock injection for TTL |
| ai pipeline: 5 ops × (valid, oversized→cap, malformed→503, none-provider→503, 429 path) | API + service | stub server | |
| upload: formats, rejections, truncation, cleanup-on-exception | API | Supertest (multipart) + fs fixtures | fault injection |
| auth: verifier failure matrix (bad sig/expired/wrong iss), cookie-vs-bearer parity, users/me upsert | API | crafted JWTs + Supertest | Phase 14 |
| history/favorites/prefs: scoping matrix (2 users), pagination edges, idempotency, cascade, BLOB cap | API | Supertest + temp libSQL file | |
| rate limits: window edges, keys (ip/user), Retry-After, trust-proxy | API | clock injection | no real waiting |
| AI output validation: normalize (fences/quotes), caps per op, language-preservation fixtures | unit (packages/ai) | Vitest | pure — no network |
| **Contract tests:** registry↔client map parity, schema parity fixtures, types fixtures | unit | Vitest | the drift firewall |
| **Network-tagged (opt-in):** real edge-tts listVoices (required locales) + one synthesis (plays: MP3 magic bytes + non-trivial size) | API | `--tag network` | CI runs on main only, with tolerance (retry once, fail-with-report) |
| E2E (optional stretch): Playwright — type→generate→play→download against the deployed stack (or local dev) | e2e | Playwright | M5 stretch; manual verification (Phase 24) is the formal gate |

### Patterns that keep the suite fast & honest

- **Clock injection:** TTLs (30-min audio), windows (rate limits), and catalog refresh take a
  `now()`/timers object from config — tests advance time in milliseconds; the suite runs in
  seconds.
- **Temp libSQL:** every DB test opens a temp file (or in-memory) libSQL + runs migrations —
  isolated per test file, zero prod contact.
- **Stub AI server:** a tiny in-process HTTP server implementing `/chat/completions` with
  scripted responses (200/401/429/timeout/garbage) — the adapter's whole surface, offline.
- **Fixtures over screenshots:** assertions are on state, codes, bytes (MP3 magic `ID3`/`0xFF`
  F3 header), and attribute values — not pixels.
- **Names = spec:** tests are titled by requirement/flow id (`FR-009: over-length text is
  rejected client-side`) so coverage of the requirements is *visible* in the test list.

## Key concepts you should learn

- **Test pyramid & where it earns its keep:** many cheap unit tests (machines, schemas), fewer
  integration (Supertest with injected deps), fewest e2e (real browser + deployed stack) — cost and
  signal per level.
- **Dependency injection for tests** without a framework: `createApp(deps)` + provider mocks —
  the Phase 6/8 seams are the test architecture.
- **State-machine testing:** enumerate states × events → assert next state + side effects; the
  table *is* the spec (Phases 10–12 machines).
- **Time in tests:** fake timers vs clock injection — when to use each (clock injection when the
  code *takes* time as input; fake timers when it uses `Date.now`/`setTimeout` internally).
- **Fault injection** (the `MOCK_TTS_FAIL` env, stub-server scripted failures, fs faults): the
  error matrix only has teeth if failure is *scriptable*.
- **Contract testing in monorepos:** shared package as contract; parity tests as the enforcement
  that the contract wasn't edited in only one place.
- **Flake management:** deterministic default suite + tagged opt-in network suite + retry-once
  with reported failure — flakiness is isolated, reported, never "fixed" by loosening
  assertions.
- **Coverage as a map, not a number:** the requirements ids in test names are the coverage map;
  % coverage is a side metric (we target ≥ 80% on packages/api services + packages/*, reviewed
  per PR).

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Vitest everywhere | One runner, TS-native, fast, works for React (via @vitejs/plugin-react + jsdom) and Node | Jest (config duplication across apps), node:test (weaker React story) |
| Supertest on `createApp()` | Real HTTP semantics, zero ports/env | Testing services directly only (misses middleware — the error envelope *is* middleware) |
| RTL for components | Behavior-level (user-visible), not implementation | Enzyme (dead), raw DOM (painful) |
| In-process stub AI server | Full adapter surface offline, per-test scripts | Recording fixtures (brittle), live free-tier in CI (quota + flake) |
| Network suite tagged, main-only | Real-engine confidence without PR flake | No network tests (blindness), network in PRs (red builds) |

## What gets created

```text
vitest.config.ts per app + packages (web: jsdom + react plugin; api: node env)
apps/api/test/{helpers (app factory with mocks, clock, temp db, stub ai server),
               suites per the test map}
apps/web/test/{…component + hook suites}
packages/ai/test, packages/validation/test
playwright.config + e2e specs (stretch, M5)
CI inputs (Phase 22): `bun run test` (default tags) on PR; + `bun run test:network` on main
```

## Verification checklist (M5 — testing)

- [ ] `bun run test` green from clean checkout in < 5 min (timed; the suite is fast by design)
- [ ] Error matrix: every row in requirements §6 has a passing test named after it
- [ ] Two-user scoping matrix (history/favorites/prefs) passes; a deliberate scoping bug
      (temporarily remove a `userId` filter) fails a test (mutation spot-check)
- [ ] Clock-injected TTL/window tests: no test takes > 50 ms of wall clock
- [ ] Network suite: `bun run test:network` passes with egress; **fails gracefully** (one
      retry, clear report) without
- [ ] Contract tests fail when: a code is added server-side without the client map (simulate),
      a schema limit changes in one app (simulate)
- [ ] Coverage report generated per app; services/packages ≥ 80% (published with the run)
- [ ] E2E (stretch): local dev (`bun run dev`) → type→generate→play→download passes headless
      (or documented manual equivalent if the sandbox can't run a browser)

## Common pitfalls

- **Testing implementation, not behavior** (asserting internal state shapes of the DOM) →
  behavior assertions (visible text, emitted events, machine states).
- **Real sleep for time logic** → the suite slows to minutes and starts flaking; clocks are
  injected.
- **One giant integration test** ("the whole flow") → named, small, per-concern tests; the flow
  gets an e2e *once*, at the top of the pyramid only.
- **Mocking the thing you're testing** (mock the TTS service *inside* a tts service test) →
  mock at the *provider* boundary, test the service's real logic.
- **Fixing flakes by loosening assertions** → the tagged-network pattern exists to contain
  flakiness; loosening the deterministic suite is a regression, not a fix.

## How it connects to the rest of the system

- Phase 20: the PaaS deploys (Vercel + Render) run *from a green suite*; CI green + network
  suite = the deploy gate.
- Phase 21: metrics/test parity — the same scenario names appear in Phase 24's manual matrix
  (automation first, manual verification as the formal record).
- Phase 22: CI runs exactly what this phase defines (PR: default tags; main: + network).
- Phase 24: every "failure scenario" row in the final matrix has a test behind it — the manual
  pass is a *confirmation*, not a discovery.

## What to remember

1. The test suite is fast because earlier phases paid for seams (createApp, providers, clocks)
   — testability is an investment, this phase is the dividend.
2. The error matrix and the requirements ids *are* the test plan — if a row has no test, the
   row is fiction.
3. Deterministic by default; the real world is a tagged, quarantined suite.
4. Mock at provider boundaries, never at the thing under test.
5. Contract tests are the monorepo's immune system: drift becomes a red build, not a user bug.
