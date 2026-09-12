# Phase 14 — Authentication & User Accounts (Clerk)

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** M3 (AI complete) · **Unlocks:** Phases 15–16 (data needs an owner)

## What this phase is

User accounts via **Clerk** — the identity provider by constraint C3. No custom JWT, no custom
passwords, no credential storage (requirements FR-019…FR-021):

- **Web:** `@clerk/nextjs` — `ClerkProvider` (the Phase 3 slot in `layout.tsx`), Clerk modal
  sign-in/up, `SignedIn/SignedOut` UI, `clerkMiddleware` protecting `/history`, `/favorites`.
- **API:** Clerk JWT verification middleware for protected endpoints
  (`/api/users/me`, history, favorites, preferences); public endpoints unchanged (rate-limited
  by IP as today).
- **App profile:** first authenticated request upserts a `users` row (Clerk user id → display
  name) in Turso — the *only* user data we store (C4: application data only).
- **Errors:** 401 `UNAUTHORIZED` (missing/invalid/expired token), 403 `FORBIDDEN` (reserved for
  role-style rules; ownership mismatches return 404 by design — API.md §2.8).

## Why we build it this way

- **C3 is a risk-elimination constraint.** Authentication is the highest-bug-density code in
  any app (password hashing, refresh rotation, session fixation, leaky endpoints). Clerk removes
  the whole class: hosted auth, MFA, social login, compliant storage. Our job shrinks to
  *verification and integration* — a much smaller, auditable surface.
- **Verification, not trust.** The API never accepts "user id: abc" from a request body. It
  verifies the Clerk JWT **cryptographically** against Clerk's **JWKS** (signature, `iss`,
  `exp`, `aud`) and derives identity from the verified claims (SR-06). The client can do
  whatever it wants; the identity only exists if the signature checks.
- **Clerk cookie vs Bearer — both, deliberately.** Same-origin requests (the entire dev
  experience, via the Next proxy) carry the Clerk *cookie* automatically — good UX, no token
  juggling. **Prod is cross-origin (Vercel → Render)**, so the web client attaches the Clerk JWT
  as `Authorization: Bearer <token>` from `useAuth()` — the Bearer path is the *production* path
  (DE-05). Non-browser callers (curl/Postman, Phase 17 testing) also use Bearer. The middleware
  accepts either; verification is identical — one auth story for every caller.
- **Public core, personal extras (FR-025).** The product's heart (TTS, AI, voices) stays
  usable signed-out — auth *adds* history/favorites/preferences, it never gates the demo.
  This also keeps the anonymous rate-limit story (per-IP) simple and the authenticated story
  (per-user) on top.
- **App-profile upsert, not a user table.** `users.id = Clerk user id` (stable, Clerk-owned).
  We store display name + created-at — application data (C4). Clerk remains the system of record
  for identity; Turso is the system of record for *what they did here*.

## How it works (internals)

### Web

```text
layout.tsx:  <ClerkProvider publishableKey={env.CLERK_PUBLISHABLE_KEY}>{children}</ClerkProvider>
header:      SignedIn → avatar menu (History · Favorites · Sign out) | SignedOut → "Sign in"
clerkMiddleware (middleware.ts):
  protect("/history/:path*", "/favorites/:path*")
  (auth() → redirect to /?sso=1 with modal)
useAuth() (hooks): { user?, isSignedIn, token? }  — token() for API headers (prod cross-origin)
```

### API

```text
middleware/auth.ts
  token = bearer(req) ?? clerkCookie(req)
  !token            → throw AppError(UNAUTHORIZED, 401)
  claims = clerkVerifier.verify(token)     # JWKS: signature + iss + exp + aud
      (cache JWKS; refresh on unknown kid; all failures → UNAUTHORIZED, never "maybe")
  req.user = { id: claims.sub, firstName?: claims["https://clerk.com/..."] }
protected routes:
  users/me       → repo.ensureProfile(req.user) → 200 profile
  (history/favorites/preferences arrive with the same guard in Phases 15–16)
```

Key implementation notes:

- **JWKS verification without a Clerk secret is the "pure" path**; `CLERK_SECRET_KEY` enables
  the `@clerk/express` helpers — we use the helper (it's maintained) but *test the failure
  modes* (bad signature, expired, wrong issuer) with crafted JWTs in the test suite.
- **Failure = 401, always**, with the registry message "Please sign in to continue." Details
  (which claim failed) go to logs only — telling an attacker "your signature failed" vs "your
  token expired" is an unnecessary oracle (SR-06).
- **No session table, no refresh logic, no logout endpoint of our own:** Clerk owns the cookie;
  "sign out" is a Clerk SDK call on the web. The API is stateless about identity (every request
  re-verified) — which is also why horizontal scaling stays clean.
- **Profile upsert is lazy:** first protected call creates the row (idempotent `upsert`), so
  sign-in never 404s "no profile yet" — a subtle UX trap avoided by design.

## Key concepts you should learn

- **JWT anatomy:** header/payload/signature; RS256 vs HS256 (we verify RS256 via JWKS — the
  public key comes from the issuer, so we never share a secret for verification); claims
  (`sub`, `iss`, `aud`, `exp`); why *verification* (signature + issuer + expiry + audience) is
  four separate checks, not one.
- **JWKS:** the issuer's JSON Web Key Set endpoint; key rotation (`kid`); caching strategy;
  what "audience" prevents (a token minted for another app).
- **IdP architecture:** what outsourcing identity buys (MFA, social, compliance, sessions) and
  what it costs (a runtime dependency on the IdP being reachable — mitigated: JWKS cached,
  already-verified requests don't need Clerk… and nothing here re-calls Clerk per request).
- **Stateless API auth:** every request self-contained; the price (re-verification per request)
  and the payoff (no session store, trivial scaling, no "where's the session?").
- **Cookie vs Bearer trade-offs:** first-party same-site convenience vs explicit cross-origin
  control; why we support both (browser + tooling + future clients).
- **401 vs 403 vs 404 for authorization:** unauthenticated → 401; authenticated-but-not-allowed
  → 403; *not yours* → 404 (avoid resource-existence oracles across users — API.md decision).
- **Secret hygiene:** `CLERK_SECRET_KEY` API-only; publishable key is *designed* to be public
  (its name means it); verify no secret in the web bundle (Phase 12's grep discipline extends).

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Clerk | C3; managed MFA/social/sessions; first-class Next.js + Express integrations; free tier | Custom JWT+bcrypt (rejected by C3), Supabase Auth (rejected: Postgres + different IdP shape), NextAuth (would need our own DB + providers; more surface) |
| `@clerk/nextjs` + `@clerk/express` | Official integrations; maintained verification | Hand-rolled JWKS fetch (we'd be maintaining the hard part) |
| Lazy profile upsert | No "sign-in then 404" states; idempotent | Explicit `POST /users` on sign-in (two-step, more failure states) |
| 404 for foreign resources | No existence oracles across users | 403 (leaves the oracle; kept for true role-denials) |
| Accept cookie *or* bearer | One API for browser + tools + future clients | Bearer-only (dev pain), cookie-only (breaks cross-origin + curl) |

## What gets created

```text
apps/web: middleware.ts, layout ClerkProvider, header sign-in UI, hooks/useAuth.ts,
          history/favorites route guards (pages are Phase 15–16; guards land now with redirects)
apps/api/src/middleware/auth.ts  (verifier + req.user)
apps/api/src/routes/users.ts     (GET /api/users/me + upsert)
apps/api/src/repositories/user.repo.ts (skeleton — Phase 15 completes the data layer)
packages/types: AuthUser, ProfileResponse
tests: verifier failure matrix (bad sig / expired / wrong iss / no token / malformed);
       users/me upsert idempotency; cookie-vs-bearer parity; public endpoints still open
.env.example: CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY (with setup notes: Clerk dashboard →
          install `@clerk/nextjs` → copy keys; create app in minutes, free tier)
```

## Verification checklist

- [ ] Sign in (email or social) via modal → header shows avatar; `/history` route no longer
      redirects (page itself lands in Phase 15 — redirect target acceptable placeholder)
- [ ] `curl` with valid Bearer → `GET /api/users/me` 200 profile; without → 401 envelope;
      expired (crafted) → 401; wrong-issuer (crafted) → 401; bad signature (crafted) → 401
- [ ] Cookie path works in-browser (dev same-origin) and Bearer path in cross-origin prod
      topology — identical `req.user` (parity test)
- [ ] Profile upsert idempotent: 5 calls → 1 row
- [ ] Public endpoints (voices/tts/ai) work signed-out; TTS limiter key switches from IP to
      user-id when a valid token is present (15/min path exercised)
- [ ] Sign out → protected API calls 401; UI back to "Sign in"
- [ ] `CLERK_SECRET_KEY` absent from web bundle/image/logs (grep + history); publishable key
      present only where expected
- [ ] JWKS cache behavior: kill Clerk egress mid-session → already-minted tokens still verify
      (cache), new verification degrades to 401 without hanging (timeout-bounded)

## Common pitfalls

- **Trusting `req.body.userId`** (or the cookie's *claims as data* without verification) → the
  entire phase is "verify or 401"; any shortcut re-opens the C3 risk.
- **403/404 confusion** → "not yours" is 404 (no oracle); 403 is reserved and rare.
- **Making auth gate the core** → FR-025: the demo must work signed-out; auth adds, never blocks.
- **Per-request calls to Clerk for identity data** → JWKS is for verification; profile data
  (display name) comes from *our* row, not a Clerk API call per request (latency + coupling).
- **Forgetting the no-JWKS case** (offline, rotated key) → bounded timeout + 401, logged, never
  a hang; readiness (Phase 21) surfaces IdP reachability as a check.

## How it connects to the rest of the system

- Phase 15: `req.user.id` becomes the scoping key for *every* history/favorite query (SR-07) —
  this phase's middleware is the only identity source they receive.
- Phase 16: preferences are per `req.user.id`; the UI's "default voice" reads the profile's
  preferences.
- Phase 18: per-user (vs per-IP) rate-limit keys use `req.user.id` when present.
- Phase 21: auth-failure counters (401 by reason) become a security signal (scanning probes).

## What to remember

1. Identity is verified, never received: signature + issuer + expiry + audience, else 401.
2. Clerk owns *who they are*; Turso owns *what they did here* — the `users` row is a junction,
   not a copy of identity.
3. Stateless per-request verification is the price of clean scaling and simple sessions.
4. Public core, personal extras: sign-in adds history, it never blocks the product.
5. "Not yours" is 404; "who are you?" is 401; "you're not allowed" is 403 — keep the trio
   distinct and the API stays honest.
