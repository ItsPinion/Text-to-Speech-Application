# Phase 01 — Monorepo & Development Environment

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 0 · **Unlocks:** Phase 2

## What this phase is

The empty skeleton of the Turborepo: **Bun workspaces**, the Turbo task graph, shared
TypeScript configuration, and two **stub** applications (`apps/web` = minimal Next.js page,
`apps/api` = minimal Express that answers `/api/health`). No features. The goal is a repo where
`bun install && bun run build && bun run lint && bun run dev` all work and *stay* working —
that is the foundation every later phase stands on.

**Toolchain split (recorded decision, restated where it matters):**

- **Bun** = package manager + workspace tool + **dev runtime** (install, `bun run`,
  `bun --watch`).
- **Node 20** = **production runtime for the api** (Render runs `node dist/server.js`); the web
  runs on Vercel's platform runtime (Next-native). Production never runs on Bun — rationale in
  the choices table below.

## Why we build it this way

- **Monorepo (vs polyrepo):** this project has three kinds of knowledge — shared *types/schemas/
  limits* (must never drift between client and server), two deployables (web, api), and
  documentation. A monorepo makes the shared knowledge a dependency (`@tts/validation`) instead
  of copy-paste, and makes cross-app changes (e.g., changing `MAX_TEXT_CHARS`) a single atomic
  commit. The cost — build complexity, "who depends on what" — is managed by Turbo and the
  dependency rules in [architecture/system.md §3](../../architecture/system.md#3-monorepo-structure--dependency-rules).
- **Bun (vs pnpm/npm/yarn):** one toolchain for install + run + dev. Very fast installs
  (global content-addressable cache in `~/.bun/install/cache`, shared across projects, parallel
  resolution), built-in npm-style workspaces (`workspaces` in the root `package.json`) plus the
  `workspace:*` protocol for local packages, and **native TypeScript execution** —
  `bun --watch src/server.ts` needs no tsx/tsc in the dev loop.
  **The honest trade-off:** unlike pnpm, Bun's `node_modules` is *hoisted* (npm-like layout),
  so the package manager will **not** stop an accidental cross-package import. We compensate
  deliberately: the dependency rule (packages never import apps) + an import-boundary lint rule
  + Phase 19's boundary tests. The boundary discipline moves from the tool to the project —
  that is the price of the speed, and it is paid on purpose.
- **Turborepo (vs plain workspace scripts):** a *task graph* with caching — `build web` depends
  on `build @tts/types`; unchanged inputs → cached output. Also one place to declare task
  inputs/outputs so CI and the platform builds (Vercel/Render) trust the same definition. Turbo
  auto-detects Bun from
  `bun.lock` and runs each package's scripts with `bun run`.
- **Node for production:** the api ships as a plain Node process on Render (`tsc` →
  `node dist/server.js`); the web runs on Vercel's platform runtime (Next-native — not even
  *our* Node process). Either way, production never runs on Bun — the zero-compatibility-risk
  choice; Bun's wins (install speed, dev DX, native TS) are exactly where we use it. If we ever
  want Bun in prod, that is a deliberate, tested migration — not the default.

## How it works (internals)

### Layout (fixed in Phase 0)

```text
text-to-speech/
├── apps/
│   ├── web/                  # Next.js 14 (App Router) + Tailwind + TS
│   │   ├── app/{layout.tsx,page.tsx}
│   │   ├── next.config.mjs   # /api/* → api:4000 dev proxy (rewrites)
│   │   ├── tailwind.config.ts, postcss.config.js, tsconfig.json
│   │   └── package.json      # name: "web"
│   └── api/                  # Express 5 + TS (ESM)
│       ├── src/{server.ts,app.ts}   # stub: GET /api/health
│       └── package.json      # name: "api"
├── packages/
│   ├── types/                # @tts/types — Voice, SpeechRequest, ApiError, HistoryItem…
│   ├── validation/           # @tts/validation — zod schemas, MAX_TEXT_CHARS, error-code registry
│   └── config/               # @tts/config — env parsing with defaults
├── docs/                     # this documentation (never imported by code)
├── package.json              # root (below)
├── bun.lock                  # committed lockfile
├── turbo.json                # tasks: build, dev, lint, typecheck, test
├── tsconfig.base.json        # strict: true, target ES2022, per-app extends
├── .env.example
└── .gitignore                # node_modules, .next, .turbo, .env, dist, data/, *.mp3
```

### Root `package.json` (the whole workspace definition)

```jsonc
{
  "name": "text-to-speech",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "bun": ">=1.2" },            // documented expectation; CI's setup-bun is the gate
  "scripts": {
    "dev":          "turbo run dev",
    "dev:web":      "turbo run dev --filter=web",
    "dev:api":      "turbo run dev --filter=api",
    "build":        "turbo run build",
    "lint":         "turbo run lint",
    "typecheck":    "turbo run typecheck",
    "test":         "turbo run test",
    "test:network": "turbo run test:network"
  }
}
```

Per-app dev scripts: web `"dev": "next dev"`; api `"dev": "bun --watch src/server.ts"`
(native TS — no tsx dependency anywhere).

### turbo.json (Turbo 2.x — tasks, not "pipeline")

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "lint":      {},
    "typecheck": { "dependsOn": ["^build"] },
    "test":      { "dependsOn": ["^build"] },
    "test:network": { "cache": false },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

`dependsOn: ["^build"]` = build my **upstream workspace dependencies first** — that one line is
what makes `bun run build` at the root build packages → apps in the right order.

### Shared packages are boring on purpose

- `@tts/types`: `type`-only exports (erased at compile time — zero runtime).
- `@tts/validation`: zod schemas + `MAX_TEXT_CHARS = 5000` + the **error-code → status →
  message registry** (shared by API error handler *and* the web's error mapping — Phase 7/10).
- `@tts/config`: `loadApiEnv()` / `loadWebEnv()` — typed, defaults, fail-fast listing of
  missing vars.

Rule: **packages are side-effect free** and never depend on apps (system.md §3) — enforced by
import-boundary lint + Phase 19 tests, since Bun's hoisting won't block violations for us.

## Key concepts you should learn

- Monorepo vs polyrepo: atomicity, shared code, tooling cost.
- Bun workspaces: the global install cache (content-addressed, shared across projects),
  parallel installs, the `workspace:*` protocol, and the **hoisted node_modules layout** — and
  why that specific property moves import-boundary discipline from the tool to lint + tests.
- Turborepo task graph: inputs/outputs, `^build`, caching, `persistent` tasks (dev); Turbo
  detects the package manager from the lockfile (`bun.lock` → `bun run` per package).
- TypeScript across packages: one `tsconfig.base.json`, per-app extends; bun executes TS
  natively in dev; `tsc` still compiles the api for the Node runtime; Next compiles the web.
- Version pinning without corepack: the expected Bun version is documented in `engines` and
  *enforced* by `oven-sh/setup-bun` in CI (Phase 22); the production Node version is pinned by
  the Render service's base image (Phase 20).
- Root scripts as the only entry point (`bun run build` = `turbo run build`) — contributors
  never learn app-level commands first.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Turborepo 2.x | Task graph + caching; spec-required | Nx (heavier), plain workspace scripts (no graph/cache) |
| Bun | Fast installs (global cache), built-in workspaces + `workspace:*`, native TS dev runner, one toolchain | **pnpm** (strict non-transitive layout — the boundary safety net we give up; kept as the documented fallback if Bun ever misbehaves in our stack), npm (slower, no native TS runner) |
| Node 20 as production runtime (api) | The Render service runs `node dist/server.js`; the web runs on Vercel's platform runtime — zero runtime-swap risk either way | Bun in prod (faster; accepts runtime-compatibility risk for no product benefit) |
| TypeScript strict everywhere | The shared-types strategy only pays off with strictness | TS loose / JS (drift risk) |
| Express 5 + ESM | Modern baseline; native async error propagation (Phase 7 depends on it) | Express 4 (needs wrappers), Fastify (fine, but spec-aligned Express keeps the learning path straight) |
| Next.js 14 App Router | Stable, spec-aligned, RSC not over-used | Next 15/React 19 (also fine — pin at scaffold time), Vite+React (less routing ergonomics) |
| Vitest (shared) | One test runner across apps/packages, TS-native, strong React story | Bun's built-in test runner (fine for pure TS; weaker RTL/React ergonomics), Jest (config tax) |

## What gets created

The tree above + root `.env.example` (all variables documented in
[requirements.md §12](../../requirements.md#12-environments)) + stub health endpoint + a
minimal styled Next page proving Tailwind works. No corepack, no `packageManager` field, no
pnpm artifacts anywhere.

## Verification checklist (M1a)

- [ ] `bun install` from clean checkout (`bun.lock` committed; `--frozen-lockfile` in CI)
- [ ] `bun run build` — packages build, api emits `dist/`, web emits `.next/`
- [ ] `bun run lint` + `bun run typecheck` — zero errors, strict mode on
- [ ] `bun run dev` — web on :3000, api on :4000; browser hits `http://localhost:3000/api/health`
      via the Next dev proxy and gets `200 { status: "ok" }` (proves proxy + cross-app call)
- [ ] `node dist/server.js` boots the api from built output (production-runtime sanity)
- [ ] `@tts/validation`'s `MAX_TEXT_CHARS` is imported by **both** apps (grep check)
- [ ] No `console.log` in packages; no app imported by a package (import-boundary lint rule wired)
- [ ] `git status` clean of artifacts (`.next`, `dist`, `node_modules` ignored)

## Common pitfalls

- **Duplicated limits/constants** in app code instead of `@tts/validation` → the shared-package
  strategy silently dies. (This is the #1 monorepo anti-pattern.)
- **Hoisting hides a boundary violation** (the pnpm safety net is gone by design) → the
  import-boundary lint rule + Phase 19 boundary tests are the replacement; any new
  cross-package import gets reviewed against the dependency rule.
- **`turbo.json` with wrong `outputs`** → builds re-run forever or caches go stale.
- **Committing `.env`** → git-ignored from day one; only `.env.example` is committed.
- **Version drift** → Bun: `engines` + `oven-sh/setup-bun` (CI is the gate); Node: pinned by the
  Render base image (Phase 20). Two runtimes, two pins — don't mix them up.
- **Running the api on Bun in prod "because it's faster"** → the recorded decision is Node in
  prod; changing it is a deliberate, tested migration (Phase 20's note).
- **Circular app↔package imports** → enforced by the dependency rule + a quick import-boundary
  test in Phase 19.

## How it connects to the rest of the system

- Phase 2 polishes the native dev experience (`.env` workflow, git, DX) on exactly this tree —
  no containers (Docker removed, C6).
- Phases 3–5 consume `@tts/types`/`@tts/validation` for every component's contracts.
- Phase 7's error registry and Phase 10's client error mapping both live in
  `@tts/validation` — created now, used forever.
- CI (Phase 22) runs the *same* root scripts this phase establishes (`oven-sh/setup-bun` +
  `bun run …`).

## As-built notes

- **Turbo ≥ 2.4 (we resolved 2.10) refuses to resolve the workspace without a declared
  package manager.** The root `package.json` therefore carries
  `"devEngines": { "packageManager": { "name": "bun", "version": "…" } }` *in addition to*
  `engines.bun` (which is documentation for humans). Pin the exact resolved version there and
  bump it deliberately.
- **Next 14 does not accept `next.config.ts`** (TS config files are a Next 15 feature) — the web
  app uses `next.config.mjs`. If the project upgrades to Next 15, this flips back to `.ts`.
- Verified as-built (first run): `bun install` (513 packages, 3 s) → `bun run build` (5/5) →
  `bun run lint` (5/5, zero warnings) → `bun run typecheck` → `bun run test` (13/13) →
  `bun run dev` (web :3000 + api :4000, proxy round-trip verified) → `node dist/server.js`
  (prod runtime) + graceful SIGTERM drain, all green.
- **C6 changed 2026-09: Docker removed entirely.** Production deployment moved to Vercel (web)
  + Render (api) — see [deployment.md](../../architecture/deployment.md). The "Bun builds, Node
  ships" split now scopes to the api on Render; the web runs on Vercel's platform runtime.

## What to remember

1. The repo root is the product surface: `bun install`, `bun run build/lint/typecheck/test/dev`
   — the commands never change, even when internals do.
2. Shared packages are the *only* place constants and contracts live; apps consume, never define.
3. Turbo's `^build` is the whole build-dependency story.
4. Bun's hoisted `node_modules` is a *chosen* trade-off: the speed is real, and the boundary
   discipline moves from the tool to lint + tests — keep both green.
5. **Bun builds and develops; Node ships.** That split is a decision, not an accident.
