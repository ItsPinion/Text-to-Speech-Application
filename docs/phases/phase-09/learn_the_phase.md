# Phase 09 — Free TTS Engine Integration (edge-tts)

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 8 · **Unlocks:** Phase 10 (real end-to-end speech)

## What this phase is

`edgeTts.ts` — the real `TTSProvider` implementation — plus the live catalog lifecycle, and the
system's first moment where **actual human-quality speech** comes out of `POST /api/tts`.

Everything around it was built in Phase 8 (interface, factory, store, pipeline). This phase's
scope is precisely: *talk to the real engine, honestly.*

## Why edge-tts (recap, with the honest caveat)

- **Free + keyless + neural quality + 40+ locales** — the only combination that satisfies C1
  with a usable product (tts.md §2). The required languages (en, hi, gu, mr, es, fr, de) are all
  in its catalog.
- **The caveat (TR-09, accepted in Phase 0):** edge-tts automates the speech endpoint that
  Microsoft's Edge browser uses for Read Aloud. It is *not* a licensed API: no SLA, the
  endpoint may change or be rate-limited/blocked, and Microsoft could close it. We accept this
  because (a) it's the best free option, (b) the abstraction (Phase 8) makes replacement a
  leaf-swap, and (c) the UX treats failures as first-class (503 + retry, NFR-004). This phase
  documents the failure symptoms so the team recognizes them instead of debugging blindly.

## How it works (internals)

### The engine, technically

- The client opens a **WebSocket** to Microsoft's consumer synthesis endpoint
  (`speech.platform.bing.com`, `…/consumer/speech/synthesize/readaloud/…/v1`), sends a
  JSON config (`text`, `voice` short name, audio format, plus the security token/SecretKey the
  service hands out), and receives **MP3 audio frames** streamed back, ending with a
  `turn.end` event. The voice list comes from a sibling endpoint of the same family.
- We use the maintained **`edge-tts` npm package** (rather than hand-rolling the WebSocket
  protocol) — hand-rolling the secret-key dance is fragile precisely where the upstream
  maintainer absorbs the breakage. The package is a *leaf dependency of the adapter file*;
  nothing else in the app imports it.
- Output format: `audio-24khz-48kbitrate-mono-mp3` (the package default) → `audio/mpeg` in our
  contract. Bitrate/format is an adapter detail (tts.md §6): the response's `format: "mp3"` is
  what the client ever sees.

### The adapter (apps/api/src/providers/tts/edgeTts.ts)

```text
listVoices():
  fetch catalog from the service family → normalize to Voice[]
  (id = shortName, name = friendly display, language = locale, gender from metadata)

synthesize({ text, voiceId }):
  open stream → send config { text, voice: voiceId, format: default }
  collect frames until turn.end → Uint8Array (MP3)
  map failures:
    WebSocket/timeout (30 s AbortSignal) / connection refused / non-2xx   → kind "network"
    provider rejects voice / empty turn without audio                     → kind "rejected-voice" | "empty"
    anything else                                                         → kind "unknown"
  (kinds → HTTP codes in tts.service, Phase 8 mapping table — unchanged)
```

- **Timeouts:** 30 s hard cap per synthesis (`AbortSignal`); the catalog fetch has a 10 s cap.
  A hung engine must never pin a worker (SR-03).
- **Resilience:** transient network errors get one internal retry (250 ms backoff) *inside the
  adapter* before surfacing as `network` — synthesis is idempotent per input, so a retry is
  safe; the *user-facing* retry remains the user's button (no invisible retries that surprise
  with latency).

### Catalog lifecycle (goes live for real, tts.md §4)

```text
boot: listVoices() → in-memory catalog + derived languages; on failure → backoff retries
      (5 s, 30 s, 120 s…) while serving nothing (ready endpoint: tts "degraded")
refresh: every 24 h; refresh failure → keep stale catalog (log warn; readiness "degraded")
GET /api/voices: always served from memory (sub-millisecond); never direct egress
```

### Real-world failure symptoms (ops table — what "it broke" looks like)

| Symptom | Likely cause | System behavior | Action |
| --- | --- | --- | --- |
| All syntheses 503 within minutes | Endpoint changed / blocked | 503 + catalog still served | Check adapter version; upstream issue tracker |
| Catalog stale, synthesis OK | Refresh 403/changed | Stale-serve logged | Same |
| 503s only for large texts | Per-request throttling | 429-ish 503 `TTS_UNAVAILABLE` | Rate limit lower; chunking (not v1) |
| Voices changed/renamed | Catalog churn | `INVALID_VOICE` for old ids | Refresh; clients re-select (Phase 5 drift path) |

## Key concepts you should learn

- Consuming a **WebSocket streaming protocol** from Node (frames, terminal events, abort).
- **Adapter pattern in production code:** isolating a flaky/unofficial dependency in one file
  with explicit failure kinds.
- Reference-data caching with backoff + stale-serve (the catalog *is* the resilience strategy).
- The difference between **internal retry** (transparent, bounded, idempotent) and **user retry**
  (explicit, user-controlled) — and when each is appropriate.
- Egress security: the adapter is the only code with the endpoint URL; no keys involved (that's
  the whole point of edge-tts), but the *pattern* (one file, one dependency, one network surface)
  is the same discipline as any secret-bearing integration.
- Latency budgeting: provider time dominates (NFR-003 < 10 s for 1 k chars) — our overhead must
  stay in the tens of ms, so we measure it (Phase 21 metrics separate provider vs api latency).

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| `edge-tts` npm package | Maintained protocol handling; breakage absorbed upstream | Hand-rolled WebSocket (fragile secret dance), Python sidecar (extra runtime for no benefit) |
| Default 48 kbps mono MP3 | Voice clarity at small size; player-friendly | Higher bitrate (size for no audible gain in mono speech) |
| One internal retry on network kind | Absorbs blips; idempotent input | No retry (brittle), N retries (latency surprise) |
| Catalog 24 h refresh + stale-serve | Egress ~0; churn tolerated | Per-request catalog (egress), 1 h refresh (churn pain without benefit) |

## What gets created

```text
apps/api/src/providers/tts/edgeTts.ts    (the adapter — the only file touching edge-tts/WS)
factory.ts: + "edge-tts" case (default now)
config: TTS_PROVIDER default "edge-tts"; timeouts (TTS_TIMEOUT_MS=30000, CATALOG_REFRESH_H=24)
tests: adapter unit tests with mocked WebSocket (happy, frame-error, timeout, rejected-voice);
       smoke test (network-tagged, opt-in): real listVoices() returns ≥ required locales
docs: update architecture/tts.md "as-built" notes if any detail differs from design
```

## Verification checklist (M2 engine gate)

- [ ] `TTS_PROVIDER=edge-tts` → `GET /api/voices` returns the **real** catalog; required
      locales present (en, hi, gu, mr, es, fr, de)
- [ ] `POST /api/tts` with 100 chars → 201 → audio **plays audibly** in the browser (human
      check, multiple voices including a non-Latin script: hi-IN)
- [ ] 5,000-char text → completes < 30 s (budget) or clean 503 (never a hang)
- [ ] Network disabled → 503 `TTS_UNAVAILABLE` with mapped message; catalog still served from
      cache; readiness shows `tts: degraded`
- [ ] Bad voice id → 400 `INVALID_VOICE`; whitespace text → 400 `INVALID_TEXT`
- [ ] Two identical texts → two audio ids (no caching of synthesis in v1 — documented; optional
      optimization, not committed)
- [ ] Egress from the deploy target: edge-tts + AI + Turso endpoints reachable from Render
      (verified in Phase 20 when the service exists)
- [ ] No edge-tts import anywhere except `edgeTts.ts` (grep)

## Common pitfalls

- **Treating a 503 as a bug** — for an unofficial endpoint, 503 is an *expected failure mode*;
  the bug is if it's not a clean 503.
- **Letting the adapter grow options** (rate, pitch, style) ahead of need → v1 speaks text +
  voice; customization is a v2 interface extension (spec §16 optional feature).
- **Trusting catalog gender metadata blindly** → it's display data; render "unknown" gracefully
  when absent (happens for some voices).
- **Testing against the real endpoint in unit suites** → unit tests mock the WebSocket; the
  real thing gets an opt-in, network-tagged smoke test only (CI cost/flake control).
- **Forgetting the abort on client cancellation** (Phase 10 cancels the HTTP request) → the
  adapter must propagate `AbortSignal` so a cancelled user request kills the WebSocket, not just
  the Express handler.

## How it connects to the rest of the system

- Phase 10: this is the first phase where the *whole* documented flow is real — the frontend's
  `POST /api/tts` returns actual MP3 bytes to play.
- Phase 12: AI-enhanced text flows through this exact pipeline unchanged (text is text).
- Phase 18: the TTS rate limiter (10/min/IP) sits in front of this adapter — protecting both the
  user's quota experience and the endpoint from abuse.
- Phase 21: provider-vs-api latency split, `tts_success_total` / `tts_failure_total{kind}`,
  catalog-staleness gauge — all keyed on the adapter's boundaries.

## What to remember

1. One file owns the unofficial endpoint; the rest of the system owns *around* it.
2. 503 is the expected shape of "the free thing is down" — design the UX for it, don't fear it.
3. Catalog caching is the resilience layer: voices stay available even when egress isn't.
4. Timeouts are policy: 30 s synthesis / 10 s catalog — a hang is a 503, never a stuck worker.
5. The swap path is real: if edge-tts dies, `TTS_PROVIDER` + a new adapter file is the whole
   migration. That's the bet we made in Phase 8, now earned.
