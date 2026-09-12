# Phase 24 — Final System Verification

**Status:** 🔨 execution pending (the plan below is the design; execution produces the recorded
evidence that closes the project)
**Builds on:** Phases 23 (instruments) + 22 (the deployed system) · **Unlocks:** project close

## What this phase is

The end-to-end proof that the *shipped system* does what [requirements.md](../../requirements.md)
says — executed against the CI-deployed stack (prod URLs + the native dev stack), with every result
**recorded** (screenshots, response bodies, metric snapshots, timestamps). The spec's Phase 24
flows are the skeleton; this document makes them a *verified checklist* with an expected
signature for each row (the metric/log signature from Phase 21's observability work).

Three verification bodies:

1. **Happy paths** (the product, performed): core TTS, AI enhancement, history/favorites,
   uploads.
2. **Failure matrix** (the contract, performed): every requirements §6 row, provoked
   deliberately, observed honestly (the TR-09 "edge-tts down" drill included).
3. **System properties** (the NFRs, measured): latency budgets, limits firing, security
   posture, degradation behavior, observability under fault.

## Why we build it this way

- **Verification is a *separate phase* because "tests pass" ≠ "the system works."** Unit/API
  suites verify parts; this phase verifies *the composition* — the deployed web talking to the
  deployed API talking to the real providers, under real failure. The delta is exactly where
  integration bugs live (proxy config, env variance, egress reality, browser policy).
- **Every row needs an *expected signature*, not just "it works."** A 503 is only verified if
  you saw the 503 *and* the `tts_synthesis_total{outcome="network"}` increment *and* the log
  line with the request id *and* the readiness flip to `degraded` — the observability (Phase
  21) turns each check from an assertion into a *corroborated observation*. A row that passes
  without its signature is a row that wasn't checked.
- **Failure is provoked, not awaited.** Waiting for edge-tts to break is not a plan. The mock
  provider's fault modes (`MOCK_TTS_FAIL`), the stub AI server's scripted failures, kill
  egress (network namespace / host firewall), crafted JWTs, and a load loop are the *tools of
  provocation* — the system is failed on purpose, on schedule, with the runbook's incident
  script following for the big one.
- **Recording is the deliverable.** The spec's "short project demonstration" and the
  presentation's evidence slides come from this phase's record: timestamps, screenshots,
  response bodies, metric curves. A verified system with no record is an unverified system to
  the next reader — the record *is* the claim.

## How it works (internals) — the matrices

### 1. Happy paths (execute in order; each ends in a recorded artifact)

| # | Flow | Steps (abridged from requirements UFs) | Success signature |
| --- | --- | --- | --- |
| H1 | Core TTS | load → voices (real catalog) → type 200 chars → en-US voice → generate | 201 with audioId; MP3 plays; `tts_synthesis_total{outcome="ok"}` +1; time-to-audio recorded (NFR-003 check: ≤ 10 s for ≤ 1 k chars) |
| H2 | Download | download button | `speech-<audioId>.mp3` saved; plays externally; hash matches the fetched blob |
| H3 | Seek/volume | pause at 30%, seek +10 s, volume 50%, mute/unmute | behavior correct; no console errors; memory: one blob (devtools snapshot) |
| H4 | Multi-language | hi-IN + gu-IN + de-DE voices, same text | each plays in its language (human confirmation recorded); catalog filters correct |
| H5 | AI enhance | text → makeConversational → review → Apply → Undo → re-Apply → generate | review shows both texts; Apply/Undo exact; generated speech from *enhanced* text; `via_ai=1` in history; `ai_enhance_total{operation="makeConversational",outcome="ok"}` +1 |
| H6 | AI without key | (dev stack, no AI_* env) → readiness | `ai: disabled`, 200; panel disabled with explanation; H1 still fully works |
| H7 | Auth + history | sign in (Clerk) → 3 generations → /history | 3 rows newest-first; play/replay; foreign-id attempt → 404 (two accounts) |
| H8 | Favorites | star fresh generation → force TTL expiry → play from /favorites | BLOB persisted at star; plays after expiry; unstar → gone; delete generation → cascade |
| H9 | Preferences | set default hi-IN/voice → reload | preselect applied; set cross-language voice → 400; stored voice removed (catalog edit on dev) → graceful fallback, no error state |
| H10 | Uploads | .txt (emoji), .pdf (2 pages), .docx; truncation case (12k chars) | editor prefilled; counts right; truncated flag + notice; corrupt file → FILE_INVALID; scanned PDF → "no extractable text" |
| H11 | Full chain | upload → AI enhance → generate → favorite | all four compose without special handling (the "one sink" design's final proof) |

### 2. Failure matrix (provoked; each row = required columns)

Provocation tool in parentheses; expected: HTTP + code (API.md) + UI behavior + observability
signature. Rows (requirements §6, all of them):

| Row | Provocation | Expected (abridged) |
| --- | --- | --- |
| empty text | UI submit / curl `{}` | 400 INVALID_TEXT; field error; no provider call (log: no tts_synthesis attempt) |
| over-length | 5,001 chars (UI blocks pre-flight; curl bypasses) | client: over-limit message; server: 400 TEXT_TOO_LONG with "1 character over" |
| invalid voice | curl ghost voice id | 400 INVALID_VOICE; (UI path: drift refresh + reset + hint) |
| invalid language | curl voice/locale mismatch | 400 INVALID_LANGUAGE |
| malformed request | curl `text/plain` body / broken JSON / missing field | 400 BAD_REQUEST; envelope intact; no stack in body |
| payload too large | 101 KB JSON / 10 MB+1 upload | 413 (both gates, separate routes) |
| rate limited | 61st general / 11th tts / 21st ai / 11th upload (per key kinds: IP + user) | 429 + integer Retry-After; UI "wait ~Ns"; `rate_limited_total{…}` +1 |
| unauthorized | protected endpoint: no token / expired (crafted) / bad sig / wrong iss | 401 UNAUTHORIZED (all four); log reason (not in body) |
| not found | unknown route / foreign generation id / expired audio id | 404 (envelope) / 404 (no oracle) / 404 AUDIO_EXPIRED |
| TTS unavailable | kill api egress (or MOCK_TTS_FAIL=network on dev) | 503 TTS_UNAVAILABLE; retry button; readiness `tts: degraded`; catalog still served; `tts_synthesis_total{outcome="network"}` climbing; **incident script dry-run** (runbook) |
| AI unavailable | stub server: 500 / timeout / garbage JSON | 503 AI_UNAVAILABLE; original text untouched; no partial-apply |
| AI not configured | H6 (no key) | 503 AI_NOT_CONFIGURED on direct call; readiness `ai: disabled` (200) |
| network failure (client) | browser offline mid-generate | offline message + retry; no error banner on *cancel* (distinct row: user cancel → idle, no error) |
| DB down | close libSQL (dev: rename file; prod: revoke token) | history/favorites endpoints 503; **core TTS still works** (the degradation boundary, NFR-004 — recorded explicitly) |
| provider free-tier quota | (live, when it happens, or stub 429) | 503 with "free-tier limit" copy; user text safe |

### 3. System properties (measured, recorded)

| Property | Method | Budget / expected |
| --- | --- | --- |
| API overhead p95 | metrics `tts_api_overhead_seconds` over a 100-request session | < 300 ms (NFR-002) |
| Time-to-audio | H1 (≤1 k chars) on the live stack | < 10 s (NFR-003; provider-dependent, recorded honestly) |
| Voice list | cold load timing | < 500 ms rendered (NFR-001; cached re-load < 100 ms) |
| Limits under load | 100 rps mixed for 2 min (Phase 18 smoke, on the live dev stack) | limits fire per key; no worker pinning; recovery clean |
| Security posture | headers on 200/400/404/429/500/503; CORS from foreign origin; bundle grep (no secrets); image history audit | Phase 18/20 checklists green, re-run on the final build |
| Graceful degradation | TTS-down and DB-down drills (above) | core usable in both; messages actionable; readiness truthful |
| Shutdown/deploy | SIGTERM under load on the local api process (Render redeploy = prod analog) | drain ≤ 10 s, exit 0, no orphaned provider sessions |
| Rollback | Phase 22 drill re-run on the final stack | pointer-rollback, readiness 200 < 60 s |
| Observability | the 3 a.m. test: provoke a 503 storm, diagnose using *only* metrics + logs + runbook | diagnosis (which endpoint, which failure kind, when it started) in < 5 min without code |
| Accessibility | keyboard-only full flow; screen-reader spot check (error announcements, seek slider) | NFR-009 baseline pass |
| Privacy | log dump of a full session (including AI) | previews/hashes only; no full user text; no keys (redaction fuzz re-run) |

## Execution plan (the ritual)

```text
T-1 day:  final build from main (images tagged); deploy via CI; readiness green;
          screenshots + Postman collection re-synced (Phase 23 gates green)
Day, AM:  H1–H11 (happy paths) — recorded with artifacts per row
Day, PM:  failure matrix (all rows) — each provoked, each signature captured
          + TTS-down incident drill (runbook, timed) + rollback drill
          + system properties (load, security, shutdown, 3 a.m. test, a11y, privacy)
Close:    record assembled (docs/verification/final-<date>.md + artifacts/):
          every row: PASS/FAIL + signature links; FAILs → new issues (none blocking close
          may remain — the rule: close only with the matrix green)
          presentation + demo delivered from the record (Phase 23's derived artifacts)
          DoD (requirements §13) ticked line by line — the checklist, not the spirit
```

## Key concepts you should learn

- **Verification vs testing:** tests verify *parts under control*; verification verifies the
  *composition under reality* (deployed, egressed, proxied, browsed). The phase split is the
  epistemology: different claims, different evidence standards.
- **Expected signatures:** a checked system shows up in *multiple independent instruments*
  (HTTP + UI + metrics + logs + readiness). One instrument can lie (a cached 200, a swallowed
  error); three agreeing is verification.
- **Provocation:** you verify failures by *causing* them — fault injection (mocks, stubs,
  crafted tokens, killed egress) is a skill, and the plan lists the tool per row so "we'll
  see what happens" never substitutes for "we will make this happen."
- **The degradation boundary as a testable property:** "core works when AI/DB/TTS are down"
  is a *spec* (NFR-004), so it gets a *test* (the drills) — availability claims are either
  executed or they're marketing.
- **The 3 a.m. test:** observability is proven by diagnosing a fault *blind* (metrics + logs +
  runbook only, timed). If the diagnosis takes an hour, the Phase 21 work failed, regardless
  of how good the dashboards look.
- **Close = matrix green + record assembled:** the project ends with evidence, not sentiment;
  the DoD is ticked line by line, and a FAIL creates an issue, not an excuse.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Verify on the CI-deployed stack (primary) + native dev stack (fault tools) | Real composition for the happy paths; fault provocation needs the dev stack's injectable failures (MOCK_TTS_FAIL, file ops) — both topologies verified, honestly | Verify only on local (not the shipped system), only on prod (can't safely provoke faults against shared infra) |
| Recorded evidence (markdown + artifacts) | The record *is* the claim; presentation/demo derive from it | "It works" (unfalsifiable), screenshots-only (no signatures) |
| Full matrix, no sampled rows | The contract is the matrix; a sampled "verification" is a sample, not a verification | Sampling (feels efficient, loses the guarantee the matrix exists to give) |
| Runbook dry-run inside the matrix | The incident script is part of the system (Phase 21/22 deliverable) — untested runbooks are fiction | Runbook as paperwork |

## What gets created

```text
docs/verification/final-<date>.md      (the record: every row, status, signatures, timestamps)
docs/verification/artifacts/           (screenshots, response bodies, metric snapshots, logs)
docs/verification/matrix-results.csv   (machine-readable: row, status, signature, notes)
issues (GitHub): any FAILs, with reproduction from the record
presentation + demo (delivered; Phase 23's derived artifacts, now with live evidence)
```

## Verification checklist (the phase verifies *itself*)

- [ ] H1–H11 all PASS with artifacts; H6 (AI-off) and H11 (full chain) explicitly recorded
- [ ] Failure matrix: every requirements §6 row executed, provoked, signature-captured; the
      TTS-down row includes the timed runbook drill
- [ ] System properties: all budgets met or *recorded as honest misses with owners* (an
      unmet NFR at close is a documented decision, not a surprise — but the *default* is:
      meet them)
- [ ] 3 a.m. test passed (< 5 min, blind, from runbook + metrics + logs only)
- [ ] Record assembled; matrix-results.csv parses; presentation/demo delivered from it
- [ ] DoD (requirements §13) ticked line by line; zero open FAILs blocking close
- [ ] The repo a stranger clones can be understood from the docs alone (the Phase 23 cold-read
      test, one final time, on the finished system)

## Common pitfalls

- **Verifying on the dev stack and calling it done** → the deployed composition (proxy, env,
  egress, TLS) is where integration bugs live; both stacks, honestly labeled.
- **One-instrument verification** ("the UI showed success") → signatures, always: HTTP + UI +
  metric + log, agreeing.
- **Sampled matrices** → the matrix *is* the contract; a sampled check is a sample.
- **Untested runbooks** → the incident drill is in the matrix for exactly this reason.
- **Closing on sentiment** → close on the CSV: green rows, recorded evidence, DoD ticked.

## How it connects to the rest of the system

- This phase is the *consumer* of everything: the contract (Phase 0), the seams (Phases 6–8),
  the observability (Phase 21), the delivery (Phase 22), the instruments (Phase 23). If a row
  fails, the diagnosis walks back through those phases — the record's "FAIL → issue" loop
  targets the right layer because every layer was built to be testable.
- It is also the project's *memory*: the record is what future-you (and the grader, and the
  next developer) read to know that the system was not just built, but *proven*.
- And it is the last lesson of the 24 phases, which is the first phase's lesson in new clothes:
  requirements are the contract (Phase 0); verification is the contract, kept (Phase 24).

## What to remember

1. Tests verify parts; verification verifies the composition, deployed, under provoked
   failure — different claims, different evidence.
2. A verified row has a signature: HTTP + UI + metric + log + readiness, agreeing.
3. Failures are provoked on schedule — mocks, stubs, crafted tokens, killed egress. "We'll see
   what happens" is not a plan.
4. The degradation boundary (core survives TTS/AI/DB failure) is a spec, so it is a test.
5. The project closes with a record, not a feeling: matrix green, artifacts linked, DoD ticked
   line by line — and the runbook that proved itself at the exact moment it was needed.
