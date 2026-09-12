# Phase 10 — Frontend ↔ Backend Integration

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phases 9 + 3 · **Unlocks:** Phase 11 (polished audio experience), M2 milestone

## What this phase is

Replace **all** mocks with the live API (frontend.md §5): `services/api.ts` becomes the real
client, the workspace's state machines drive the real request lifecycle, and the product's core
loop — type → generate → (audio arrives) — works end-to-end against the Express server with the
real (or mock) TTS engine.

Scope:

- Real `api.ts`: fetch wrapper (envelope decode, `ApiError` from the shared registry, 45 s
  client timeout, `AbortController` support).
- `useTts`: the generation state machine (`idle → loading → ready | error`), cancel, retry.
- `useVoices`: live catalog (replacing the mock), TTL cache, drift refresh on `INVALID_VOICE`.
- Loading/error/empty states rendered per the Phase 3 contracts — **no component prop changes**
  (if props must change, fix the Phase 3 contract first).
- Audio plumbing: `audioUrl` → fetch blob → object URL → `<audio>` (player polish is Phase 11;
  here, playback-of-a-real-file works).
- Env: `NEXT_PUBLIC_API_URL` (`/api` via dev proxy; public origin in prod).

## Why we build it this way

- **The contract is the product.** Phases 5–9 made the API honest; this phase proves the other
  half: the client is a *good citizen* of that contract — it decodes the envelope once, renders
  from `error.code`, and never invents its own meanings. Client and server were built from the
  same types/schemas/registry; integration should feel like plumbing, not translation. If it
  doesn't, the gap is a contract defect — find and fix it in the shared package.
- **Cancellation is a first-class state, not an edge case.** Generation takes seconds (provider
  time). Users change their minds; the correct behavior is *kill the in-flight request and its
  provider work* (server-side `AbortSignal` propagation, Phase 9), not "let it finish in the
  background". Abort ≠ error: cancelled requests never show an error banner.
- **One client, one error shape.** `ApiError { code, message, status, requestId }` is the only
  error type the UI ever sees. The `requestId` is surfaced in the error UI's "details" (collapsed)
  so a user can report it and ops can find the log line (SR-11 correlation made user-accessible).

## How it works (internals)

```text
services/api.ts
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api"

  async function request<T>(path, { method, body, signal, parse }):
    controller = merge external signal + AbortSignal.timeout(45_000)
    res = await fetch(API_BASE + path, { headers: { "Content-Type": "application/json",
             ...(authHeader()) }, body, signal: combined })
    if (!res.ok):
      data = await res.json().catch(() => null)
      throw new ApiError(data?.error ?? { code: "BAD_REQUEST", message: safeGeneric(res.status) },
                         res.status, res.headers.get("X-Request-Id"))
    return parse ? parse(await res.blob()) : (await res.json()) as T

  getVoices()        → request<VoicesResponse>("/voices")
  generateSpeech(r)  → request<TtsResponse>("/tts", { method:"POST", body: r, signal })
  fetchAudio(id)     → request<Blob>(`/audio/${id}`, { parse: identity })
```

`useTts` state machine (the heart of the screen):

```text
idle ──generate(valid text+voice)──▶ loading { request, abort }
loading ──201──▶ ready { audioId, audioUrl, blob, blobUrl }
loading ──ApiError──▶ error { error }            (message from code; action: retry/edit/slow-down)
loading ──user cancel──▶ idle                    (NO error state; spinner off; player cleared)
ready/error/idle ──new generate──▶ loading        (revoke previous blobUrl first)
ready ──AUDIO_EXPIRED on replay──▶ error { code:"AUDIO_EXPIRED" } → "expired, regenerate"
```

Rules:

- **Single-flight:** while `loading`, Generate is disabled (no queue, no double-submits — the
  machine makes double-submit unrepresentable).
- **Revoke discipline:** every new `ready` and every `idle` transition revokes the prior object
  URL (memory; frontend.md §2).
- **INVALID_VOICE → catalog drift:** on this code, `useVoices.refresh()` runs, the selection
  resets to the new default, and the user's text is preserved; a hint explains why the voice
  changed (Phase 5 semantics, now live).
- **429:** message includes `Retry-After` seconds when present ("Please wait ~42 seconds").
- **503:** "Speech service is temporarily unavailable — try again." + Retry button (NFR-004).
- **Network/timeout:** "You appear to be offline…" + Retry (distinct from 503 — *our* network
  vs *their* service).

## Key concepts you should learn

- Fetch in depth: `AbortController` (including *merging* a user abort with a timeout signal),
  `AbortSignal.timeout`, response body as a stream (we consume fully — no streaming in v1).
- **Client-side error taxonomy:** server error (code) vs transport error (offline/timeout) vs
  user intent (abort) — three different things, three different UIs.
- State machines for async UI: naming states, listing transitions, making illegal states
  unrepresentable; the machine *is* the component's logic and the test's fixture.
- Object URL lifecycle (create/revoke) and its failure modes (leaks, revoked-during-playback).
- CORS reality: dev is same-origin via the Next proxy (CORS never fires); **prod is two origins
  (Vercel + Render)**, so the CORS allow-list (SR-05) is load-bearing in production — the client
  targets `NEXT_PUBLIC_API_URL` and sends the Clerk Bearer token (Phase 14).
- Contract debugging: when integration is painful, the question is "which shared artifact is
  wrong?" (type, schema, code, message) — never "patch the client to tolerate the server."

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| `fetch` (no axios) | Zero deps; `AbortSignal` is native and better than axios cancellation; the client is ~60 lines | Axios (cancellation API is weaker), ky (fine, same shape, extra dep) |
| 45 s client timeout (vs 30 s server) | Client timeout is the *outer* bound (network + queue + provider) | No timeout (spinner forever), 10 s (false failures on slow links) |
| Error map from shared registry | Copy parity; code is the switch | Per-component strings (drift), parsing messages (fragile) |
| Module-level catalog cache in `useVoices` | Survives component re-mounts within a session; TTL 5 min | Refetch per mount (egress), React context (same, more ceremony) |

## What gets created

```text
apps/web/services/api.ts        (real client — replaces mock internals; signatures unchanged)
apps/web/hooks/{useTts.ts, useVoices.ts}   (live implementations)
apps/web: workspace wiring (single-flight, blobUrl lifecycle, drift refresh, 429/503/offline UI)
tests (Phase 19 seed): api.ts decode paths (envelope, error, timeout, abort);
                       useTts machine (happy, 400, 429, 503, abort, expired)
```

## Verification checklist (M2 gate — the core loop is real)

- [ ] Cold load → real catalog in selects (or cached); zero mock references (grep)
- [ ] Type 200 chars → Generate → spinner → real MP3 appears; `<audio>` plays it
- [ ] Cancel mid-generation: request aborted (devtools: canceled), state → idle, **no** error
      banner, server log shows the request ended (abort propagated)
- [ ] Empty text → field error, no request; 5,001 chars → over-limit, no request
- [ ] Force `INVALID_VOICE` (edit catalog in mock or stale pick) → refresh + reset + hint
- [ ] Force 429 (hit limit) → message with seconds; force 503 (network off) → service message;
      unplug Wi-Fi → offline message. Each has Retry where sensible.
- [ ] `X-Request-Id` visible in error details; matching log line found via that id
- [ ] Two fast generates: second disabled until first settles (single-flight)
- [ ] Memory: blob URL revoked on replace (devtools memory check, no growing blob list)
- [ ] Works in dev (proxy, same-origin) and against a cross-origin API (CORS + Bearer path,
      verified in Phases 14/20)

## Common pitfalls

- **Client "fixing" server errors** (special-casing a message string) → render from `code`;
  the registry is the only source of copy.
- **Forgetting to abort on unmount** → requests outlive the screen (and, without server
  propagation, the provider call).
- **Object URL leaks** (never revoking) → the classic Next/React audio leak; test it.
- **Treating abort as error** → the "error" banner on Cancel is the #1 UX smell of abort
  handling.
- **Loosening CORS in prod** → the exact-origin allow-list (`CORS_ORIGIN` on Render) is the
  design; if you're debugging CORS in prod, check that setting — don't widen it to `*`.

## How it connects to the rest of the system

- Phase 11 takes the `ready` state and makes the audio *experience* (custom player, download).
- Phase 12 adds a second, parallel machine (`useAiEnhance`) with the same discipline.
- Phase 14: `authHeader()` is the single insertion point for the Clerk JWT — everything else
  unchanged.
- Phase 19: this phase's verification checklist is the integration test plan.

## What to remember

1. Integration difficulty is a contract bug report — go to the shared package, not the client.
2. Three kinds of "failure": server error (code), transport (offline/timeout), intent (abort) —
   three UIs.
3. The state machine is the component; draw it before coding it.
4. Revoke what you created; abort what you started; single-flight what you send.
5. The request ID in the error UI is the bridge between a confused user and a log line.
