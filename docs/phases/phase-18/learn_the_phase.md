# Phase 18 — Rate Limiting & Abuse Protection

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 17 (M4 complete) · **Unlocks:** M5 (production hardening)

## What this phase is

The abuse-protection layer, implemented *before* calling the system production-ready (spec §15,
SR-03…SR-05, SR-10, FR-029/FR-030):

- **Rate limits** (all env-tunable, defaults fixed): general 60 req/min/IP on `/api/*`;
  `POST /api/tts` 10/min/IP (15 with a valid token); `POST /api/ai/enhance` 20/hour/IP
  (per-user when authed); `POST /api/upload` 10/hour/IP (per-user when authed). 429 +
  `Retry-After` (Phase 7's contract now fully wired).
- **Security headers & transport policy:** Helmet (CSP tuned for our same-origin app, nosniff,
  HSTS at the proxy), CORS allow-list (exact origin, not `*`), JSON body 100 KB, upload 10 MB,
  request timeouts (TTS 30 s / AI 60 s already enforced at the adapters — this phase adds the
  *server-wide* idle timeout and connection timeout policy).
- **Input hardening:** trim + control-char strip + code-point max on all text inputs (shared
  schema, Phase 7 — this phase *verifies* it's on every text-bearing endpoint including
  preferences, and adds the upload-side rules from Phase 17).
- **Usage accounting:** per-user AI usage counter (hourly window) in Turso (small
  `usage_counters` table) — the *source* of the per-user AI limit (Phase 12's IP-only limit
  becomes user-aware when authed).
- **Timeouts & resource policy:** server `headersTimeout`/`requestTimeout` set so a slow client
  can't pin a socket; audio store caps (Phase 8) re-verified as the storage-abuse boundary.

## Why we build it this way

- **The cost of abuse here is mostly *the user's own quota* and *our provider goodwill*, not
  our invoices** — edge-tts is free, AI is the user's key. Rate limiting in this project is
  therefore three things at once: (1) protection of the *users* (their free-tier AI caps, the
  edge-tts endpoint's tolerance), (2) protection of the *service* (synthesis is CPU+egress;
  uploads are disk+CPU), and (3) a *signal* (429 with `Retry-After` tells clients how to behave
  — abuse without signal is just outages).
- **Two-tier keys (IP, then user).** Anonymous traffic is keyed by IP (coarse, but the only
  honest key); authenticated traffic is keyed by Clerk user id (precise, and an IP behind NAT
  stops throttling 50 colleagues). The limiter takes a *key function*, so the two tiers are one
  mechanism, not two systems.
- **Limits are configuration, defaults are policy.** Every limit is an env var with a
  documented default; the *defaults* encode the decisions (10 TTS/min is "human typing + retry"
  speed; 20 AI/hour is "below typical free daily budgets"); the *env vars* encode operations
  (raise for a demo day). Changing policy = changing a default in `@tts/config`, with a test.
- **Headers/CORS/size are the "boring 80%":** Helmet + a real CORS origin list + body limits +
  timeouts prevent entire attack classes (MIME sniffing, CSRF-ish cross-origin calls, memory
  via bodies, slowloris-ish socket pinning) with ~40 lines of middleware. The spec lists them
  for a reason: security reviews start here.

## How it works (internals)

```text
rateLimit.ts
  keyFn(req) = req.user?.id ?? `ip:${req.ip}`     # req.ip from trust proxy (behind the platform
                                                   # LB on Render/Vercel: app.set("trust proxy", 1)
                                                   # — documented)
  general  = limiter({ windowMs: 1 min,  max: 60,   standardHeaders: true,
                       legacyHeaders: false, handler → AppError(RATE_LIMITED, 429, Retry-After) })
  tts      = limiter({ windowMs: 1 min,  max: (req) => req.user ? 15 : 10 })
  ai       = limiter({ windowMs: 1 hour, max: (req) => req.user ? 20 : 20,
                       # per-user window counted in Turso when authed (usage_counters),
                       # IP window in memory (express-rate-limit) when anonymous
                       storage: authed ? dbCounter : memory })
  upload   = limiter({ windowMs: 1 hour, max: 10, keyFn: user-or-ip })
  429 response: envelope + Retry-After: <seconds until window end> (integer)

usage_counters (Turso): user_id, window_start (ISO hour bucket), ai_count,
  upsert-on-increment with hourly-bucket reset; read by the AI limiter; also feeds Phase 21
  metrics (usage is observable data, not just a gate)

helmet.ts
  helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"],
    connectSrc: ["'self'"], imgSrc: ["'self'", "data:"], styleSrc: ["'self'", "'unsafe-inline'"]
    # 'unsafe-inline' for style is Tailwind's in-head CSS — scoped, documented; scriptSrc 'self'
    # (no inline scripts — Next's streaming uses nonce where needed; verified at build) } },
    hsts: { includeSubDomains: true, maxAge: 31536000 },  # HSTS also set by the platform; belt+suspenders
    crossOriginResourcePolicy: "same-origin" })
cors:  origin: CORS_ORIGIN.split(",") (exact matches, incl. port), credentials: true
       (Clerk cookie is same-site; credentials only matters if cross-origin ever — allow-list
       stays exact, never "*")
body:  express.json({ limit: "100kb", strict: true })   # JSON routes
       multer limits (10 MB)                             # upload route (Phase 17)
timeouts: server.requestTimeout = 90_000, headersTimeout = 60_000
       # adapters' 30/60 s are the *inner* bounds; these are the *outer* socket bounds
trust proxy: 1 (the platform LB is the single proxy hop) — so req.ip is the real client,
    not the LB's
```

Why `trust proxy` matters: behind Render's/Vercel's load balancer, `req.ip` is the LB's address
unless trust is set — limits would then be *per-proxy* (everyone shares one bucket, or one
bucket per LB instance). Setting it to exactly `1` (one hop) is a security-relevant decision
(more hops = spoofable `X-Forwarded-For`), documented where implemented.

## Key concepts you should learn

- **Rate-limit mechanics:** fixed window (simple, bursty at edges) vs token bucket (smooth) —
  we use fixed windows (predictable `Retry-After`, simple ops) and know the trade-off; in-memory
  (single instance — matches NFR-011) vs shared store (multi-instance; the per-user AI counter
  in Turso is the shared one, for the limit that *needs* to be per-user and survive restarts).
- **Key design:** IP vs user vs device; NAT/coffee-shop implications; why per-user limits beat
  per-IP for fairness *and* why per-IP is still the anonymous backstop.
- **`Retry-After` as API courtesy:** the 429 that tells the truth enables good clients.
- **Header policy:** what each Helmet header does (CSP, nosniff, HSTS, CORP) and the one
  honest exception (inline style for Tailwind) — policy with documented exceptions, not a
  blanket.
- **CORS as an allow-list:** exact origins; why `*` + credentials is broken by spec; the
  allow-list is **load-bearing in prod** (two origins: Vercel → Render, DE-05) and defense in
  depth in dev.
- **Layered input hardening:** schema (shape+length) → trim/control-strip (content hygiene) →
  parser limits (Phase 17) — each layer independent.
- **Timeout budgeting:** inner (adapter 30/60 s) < outer (server socket 90 s) — ordering matters
  or the "timeout" you intended never fires.
- **Trust-proxy security:** one hop, documented; `X-Forwarded-For` spoofing is the failure mode
  when it's misconfigured.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| `express-rate-limit` (memory) + Turso counter for AI | Simple general limits; the *per-user, durable* limit gets real storage | Redis (extra service for a single-instance app — rejected by NFR-011's honesty), all-in-DB (query per request, no) |
| Fixed windows | Predictable Retry-After; ops-simple | Token bucket (smoother, more code, same protection at our scale) |
| Helmet + tuned CSP | Default-on security headers with one documented exception | Hand-rolled headers (drift), no CSP (MIME/sniffing surface) |
| `trust proxy: 1` | Correct IP behind the platform LB, minimal spoof surface | `trust proxy: true` (spoofable), 0 (limits per-proxy — broken) |
| Env-tunable limits, tested defaults | Policy in code (tests), operations in env | Hard-coded (no demo-day flexibility), config-file drift |

## What gets created

```text
apps/api/src/middleware/{rateLimit.ts,security.ts (helmet+cors+timeouts)}
apps/api/src/repositories/usage.repo.ts + schema: usage_counters
config: RATE_LIMIT_* env vars (defaults + docs in .env.example)
tests: window edges (60th vs 61st request); Retry-After correctness (seconds, integer);
       user-vs-IP keys (same IP, two users → independent TTS budgets); AI per-user hourly
       (reset at hour boundary, restart-survival via Turso); 429 envelope shape;
       trust-proxy (X-Forwarded-For honored once, not twice); headers present (CSP/nosniff/
       HSTS/CORP) on all responses incl. errors
```

## Verification checklist (M5 start)

- [ ] 61st general request in a minute → 429 + `Retry-After`; UI shows "slow down — ~Ns"
- [ ] 11th `POST /api/tts` in a minute (anonymous) → 429; authed user gets 15 (both tested)
- [ ] 21st AI request in an hour (authed, new hour boundary tested) → 429; anonymous keyed by
      IP; counter survives api restart (Turso)
- [ ] Two users behind one IP (dev: curl with two tokens) → independent budgets
- [ ] Headers: CSP, X-Content-Type-Options, HSTS, CORP present on 200/400/429/500/503 responses
- [ ] Cross-origin call from `https://evil.example` → CORS rejection (no `Access-Control-*`)
- [ ] 101 KB JSON → 413; 101-byte valid → fine; 10 MB+1 upload → 413 (Phase 17 gate intact)
- [ ] Slow client (accepts nothing) → connection drops at request timeout, worker freed
- [ ] `X-Forwarded-For: 1.2.3.4` through the platform LB: limits key on 1.2.3.4 (once)
- [ ] Load smoke: 100 rps mixed traffic for 2 min → no worker pinning, limits fire as designed

## Common pitfalls

- **Forgetting `trust proxy`** → all anonymous users share the proxy IP's bucket (or worse,
  limits don't work at all) — the #1 "why is my rate limit broken" in proxied deploys.
- **`*` CORS "because dev"** → ships to prod; the allow-list is exact, tested, and the dev
  proxy makes same-origin the real dev path anyway.
- **In-memory per-user limits** → lose on restart, diverge across instances (we're single, but
  the AI limit's *durable* storage is the pattern to copy).
- **Headers that 500 the app** (CSP too strict for Next's inline scripts) → test headers on
  *error* pages too; the error page is where CSP surprises bite.
- **Timeouts in the wrong order** (outer < inner) → the intended timeout never happens; the
  socket kills first with a generic error.

## How it connects to the rest of the system

- Phase 21: every limiter emits counters → `rate_limited_total{route, key_kind}`; usage_counters
  becomes the usage dashboard's source; the load smoke becomes a recurring CI job.
- Phase 20: `trust proxy: 1` is *load-bearing* in the prod topology (the platform LB is that one hop).
- Phase 22: the limits suite runs in CI (window tests are fast — clock injection, not real
  waiting).
- Phase 24: the abuse matrix (each limit, each key kind) is verified with recorded 429s.

## What to remember

1. Limits protect three parties: the service, the *users' own* free quotas, and the free
   endpoints' goodwill — in that order of honesty.
2. Key by user when you have one, by IP when you don't — one mechanism, two keys.
3. 429 without `Retry-After` is a 429 in half.
4. Headers + allow-list + body limits + timeouts = the boring 80% of "this is secure."
5. Behind a proxy, `req.ip` is a decision, not a fact: `trust proxy: 1`, documented.
