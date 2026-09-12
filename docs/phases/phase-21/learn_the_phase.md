# Phase 21 — Observability & Production Hardening

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 20 (live prod topology) · **Unlocks:** Phase 22 (CI protects what's measured)

## What this phase is

Making the running system *explainable* (spec: structured logging, request IDs, health,
metrics; FR-031):

- **Structured logging** (pino, already the logger — now standardized): every line JSON with
  `requestId`, `method`, `route`, `status`, `durationMs`; request-scoped child loggers through
  the whole pipeline (routes → services → providers); redaction enforced (auth, tokens, keys,
  text previews ≤ 200 chars).
- **Request IDs end-to-end:** `X-Request-Id` generated/echoed (Phase 6) now also propagates
  into provider calls' log lines and into error responses' `details.requestId` — one id from
  browser error UI to log line.
- **Health (final form):** `GET /api/health` (liveness) + `GET /api/health/ready` (real checks):
  - `tts`: catalog loaded? fresh (< 24 h)? → `ok | degraded | failed`
  - `ai`: configured? last-call state? → `ok | disabled | degraded`
  - `db`: libSQL ping < 500 ms → `ok | failed`
  - `idp`: JWKS cache freshness (Clerk reachable on last refresh) → `ok | degraded`
  503 only when a *required* check is `failed` (tts with no cache; db). `disabled` (ai, no key)
  is never a failure.
- **Metrics** (`GET /api/metrics`, Prometheus text format, via `prom-client`, protected by
  the same trust-proxy IP handling / or a `METRICS_TOKEN` header — documented choice):
  - `http_requests_total{route, method, status}` + `http_request_duration_seconds{route, method}`
  - `tts_synthesis_total{outcome}` + `tts_synthesis_duration_seconds` (provider time) and
    `tts_api_overhead_seconds` (ours — the split that proves NFR-002)
  - `ai_enhance_total{operation, outcome}` + `ai_enhance_duration_seconds{operation}`
  - `audio_store_files`, `audio_store_bytes`, `audio_store_evictions_total`
  - `rate_limited_total{route, key_kind}` · `favorites_bytes{}` (per-capacity headroom gauge)
  - `db_query_duration_seconds{repo, op}` · `catalog_age_seconds`
- **Hardening checklist execution:** security headers audit on *all* response types (incl.
  404/500 pages — Phase 18's pitfall), dependency audit (`bun audit` + Dependabot from
  Phase 22), graceful-shutdown drain verification under load, log redaction fuzz test.

## Why we build it this way

- **Observability is the difference between "it's down" and "I know what, where, and when."**
  Every earlier phase produced *signals* (codes, kinds, request ids, durations); this phase
  makes them *observable*: queryable (Prometheus format), correlated (request id), and
  alertable (readiness = the deploy gate). Without it, a 3 a.m. "TTS is down" is a mystery
  hunt; with it, `tts_synthesis_total{outcome="network"} ` climbing + `catalog_age_seconds`
  flat = "the endpoint, not our code."
- **The provider/api latency split is the single most valuable metric in this project.** Our
  code is fast by design (NFR-002 p95 < 300 ms); the *provider* is where the seconds go.
  Measuring them separately means "slow" has a diagnosis attached on day one — and means we can
  prove our overhead is small when a user reports slowness.
- **Readiness as an honest instrument (not a marketing endpoint).** Each check reports its
  *real* state (`degraded` for stale catalog, `disabled` for no AI key) — an all-green
  readiness that hides degradation is worse than none (operators stop trusting it). The
  `disabled ≠ failed` distinction is the feature: the free-AI design (C2) is visible in
  operations, not just in code.
- **Prometheus text format, minimal cardinality.** `route` (not `url`), fixed label sets —
  metrics that don't explode the time series. This is a project-grade dashboard, not a
  data-center scrape farm; the format choice keeps it portable (any Prometheus-compatible
  scraper/grapher, or just `curl | watch`).

## How it works (internals)

```text
logging (final policy)
  pino: level from LOG_LEVEL (info prod / debug dev), redact:
    ["authorization", "*.api_key", "*.token", "req.headers.cookie"]
  child logger per request (requestId, ip, userAgent-truncated) passed via context
  text payloads: preview(text, 200) everywhere; AI inputs/outputs: length + hash, not content
    (SR-11 final form: we can correlate without retaining)

request id
  inbound X-Request-Id honored (trace across proxies) else uuid v4
  → response header + error details + every log line + provider-call log context
  → browser error UI shows it (Phase 10) → user reports it → `grep <id>` finds everything

readiness checks (real, bounded, cached)
  tts:  catalog cache state + lastRefreshAt (no egress per check)
  ai:   config + last-call outcome ring (no call per check)
  db:   SELECT 1 with 500 ms timeout (cheap, real)
  idp:  JWKS cache age (no call per check; refresh-on-401 already calls on demand)
  → 200 { checks } | 503 when required check failed
  (checks never block: each bounded 500 ms; total budget 2 s)

metrics
  prom-client registry; middleware increments http_* (route = matched route pattern, not raw
  url — cardinality discipline); services increment tts_*/ai_* around provider calls;
  store hooks (put/evict) increment audio_store_*; /api/metrics renders + resets process
  start-time baseline
  endpoint auth: METRICS_TOKEN header (static, server env) OR restricted to the platform LB
  (Render health-check-style exposure) (default: token — documented)
```

Alerting rules (documented thresholds for the operator, not shipped as infra):

| Condition | Meaning |
| --- | --- |
| `rate_limited_total` climbing | abuse or a broken client retrying |
| `tts_synthesis_total{outcome="network"}` > 10 in 5 min | edge-tts endpoint trouble (TR-09 in the wild) |
| `catalog_age_seconds` > 48 h | catalog refresh silently failing |
| `http_request_duration_seconds` p95 (api overhead) > 300 ms | *our* code regressed (NFR-002) |
| `audio_store_bytes` near cap | eviction pressure (or a favorite-persistence bug) |
| `db_query_duration_seconds` p95 > 50 ms | Turso latency or a missing index |

## Key concepts you should learn

- **The three pillars (and their order of value here):** logs (correlated narratives), metrics
  (aggregated signals), traces (per-request spans — we approximate spans with request-id
  child loggers; a real tracer (OpenTelemetry) is the documented upgrade path, not v1).
- **Cardinality discipline:** labels are enums (route, op, outcome), never ids/timestamps —
  the difference between a dashboard and a memory leak.
- **Provider-vs-own latency splitting** as a diagnosis instrument (the metric that answers
  "whose problem is this?").
- **Honest readiness:** `degraded`/`disabled` states are *information*; an all-green health
  check that hides them trains operators to ignore it.
- **Redaction as a testable property:** the fuzz test (send secret-shaped payloads, assert
  absence in logs) — policy verified, not assumed.
- **Request id as the correlation spine:** one id, four surfaces (UI, response, logs, provider
  calls) — the 3 a.m. workflow is `grep`.
- **Graceful shutdown under load** (drain ≤ 10 s): what "clean exit" means when 50 requests are
  in flight; why deploy pipelines depend on it.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| pino (kept) + child loggers | Already the logger; structured by default; fast | Adding a second logger (chaos), winston retrofit |
| prom-client + text endpoint | Portable, minimal, no infrastructure prerequisite | OTel full (powerful, heavy for v1 — documented path), in-house counters (no format = no tools) |
| Readiness = cached state + one cheap ping | Checks must not *become* the outage (no egress storm) | Calling every provider per readiness check (egress amplification) |
| METRICS_TOKEN on /api/metrics | One header, zero infra, beats exposing a metrics port | Public metrics (leaks operational detail), scrape-only infra (requires Prometheus deployed) |
| Route-pattern labels | Cardinality | Raw URL labels (series explosion) |

## What gets created

```text
apps/api/src/middleware/metrics.ts, utils/metrics.ts (registry + helpers), routes/metrics.ts
readiness: services/health.service.ts (real checks per the spec above)
logging policy: utils/log.ts final (redact list, preview(), child logger plumbing audit)
scripts/log-redaction-fuzz.mjs (test input → assert)
docs: ops runbook (docs/architecture/observability runbook section): the alert table, the
      grep workflow, the TR-09 incident script ("edge-tts changed the endpoint" → what to do)
tests: readiness states (tts degraded on stale catalog; ai disabled; db failed with socket
       closed); metrics endpoint (auth, format, counter increments); redaction fuzz;
       shutdown drain (in-flight requests complete, no orphans)
```

## Verification checklist (M5 — observability)

- [ ] Every log line in a 50-request session carries a `requestId`; the id in one 429's
      response `grep`s to exactly that request's lines (and no others)
- [ ] Redaction fuzz: payloads with `authorization`, `api_key`, 10 KB text → logs contain
      previews/hashes only (script green)
- [ ] Readiness matrix: fresh → `ready`; kill egress → `tts: degraded` (cached catalog served);
      no cache + egress dead → 503; no AI key → `ai: disabled` with **200** (not failed);
      closed libSQL → `db: failed` + 503
- [ ] Metrics: after a scripted session, all named series present with sensible values;
      provider-vs-overhead split visible (overhead < 300 ms p95 in the test)
- [ ] `/api/metrics` without token → 401; with token → 200 (Prometheus text)
- [ ] Headers audit: CSP/nosniff/HSTS/CORP/X-Request-Id present on 200, 400, 404, 429, 500, 503
- [ ] Shutdown: SIGTERM during 50 in-flight → all complete (≤ 10 s), exit 0, no dangling
      WebSocket sessions (edge-tts aborts visible in logs)
- [ ] Runbook dry-run: simulate "edge-tts 503 storm" (MOCK_TTS_FAIL=network on a dev stack)
      → the documented script reproduces the diagnosis using only metrics + logs

## Common pitfalls

- **Readiness checks that call the providers** → a readiness probe becomes an egress storm
  (and a self-fulfilling outage during provider trouble); checks read *state*, not the network.
- **Logging AI content "for debugging"** → the redaction policy (length + hash) is privacy
  (SR-11) *and* the reason we can ship user text through a third-party model responsibly.
- **Raw-URL metric labels** → series explosion; route patterns are the label, always.
- **All-green readiness as a goal** → the goal is *trustworthy* readiness; `degraded` states
  are success, not failure.
- **No shutdown drain** → deploys drop in-flight generations; the user sees "it broke on
  deploy" and the code is innocent.

## How it connects to the rest of the system

- Phase 22: the redaction fuzz + metrics + readiness tests join CI; `bun audit` gates PRs.
- Phase 24: the failure matrix is executed *with the instrumentation on* — every failure row
  shows its metric/log signature (the matrix gains an "observed as" column).
- Operations (the human): the runbook is the deliverable the on-call person reads at 3 a.m. —
  it must be written for someone who built nothing of this.

## What to remember

1. One request id connects the user's error, the response, and every log line — the 3 a.m.
   workflow is `grep <id>`.
2. Provider latency vs our overhead, measured separately, is the diagnosis instrument that
   answers "whose problem is this?"
3. Readiness reports truth (`degraded`, `disabled`), not optimism; a probe reads state, never
   the network.
4. Redaction is a test, not a promise — the fuzz script is the contract.
5. Metrics with enum labels are a dashboard; metrics with id labels are a memory leak.
