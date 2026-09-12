# Text-to-Speech — Turborepo Full-Stack Project

A web application that converts written text into natural-sounding speech, with free AI text
enhancement. The user enters or pastes text (or uploads a file later), picks a language and voice,
optionally runs a free AI enhancement, then generates, plays, and downloads audio.

| Layer | Technology |
| --- | --- |
| Monorepo | Turborepo + Bun workspaces + TypeScript (strict) |
| Toolchain | Bun (package manager + dev runtime) · Node 20 (production runtime) |
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend | Express 5 + TypeScript |
| TTS | **edge-tts** (free, no API key) behind a `TTSProvider` interface |
| AI enhancement | Free cloud models (user-supplied free-tier key) behind an `AIProvider` interface |
| Authentication | **Clerk** (identity provider — no custom JWT, no custom passwords) |
| Database | **Turso (libSQL/SQLite)** + **Drizzle ORM** (application data only) |
| Deployment | **No Docker** (C6) — Vercel (web) + Render (api); local = native `bun run dev` |
| Testing | Vitest, React Testing Library, Supertest |
| CI/CD | GitHub Actions |

**Project status:** *Design complete.* Requirements, architecture, API design, and per-phase
learning documents are delivered in this repository. Application implementation starts at Phase 1
and follows the phase order in [docs/phases/](docs/phases/README.md).

---

## 1. Hard constraints

These constraints were fixed before design and override all later choices:

1. **No paid TTS API may be required to run the project.** The default engine (edge-tts) is free
   and keyless.
2. **Free AI models only.** AI text enhancement uses only models the user can access for free.
   The user may supply a free-tier API key (e.g., OpenRouter free models or Groq's free tier);
   if no key is configured, the AI feature is disabled and returns a clear `503 AI_NOT_CONFIGURED`
   — the rest of the app keeps working.
3. **Clerk is the identity provider.** No custom JWT issuance, no custom password storage.
4. **Turso (libSQL) + Drizzle ORM** stores application data. No PostgreSQL. Only
   application-specific user data and relationships live in Turso (app profile, speech history,
   favorites, voice preferences).
5. **Turborepo monorepo** with `apps/web`, `apps/api`, and shared `packages/*`.
6. **No Docker (chosen 2026-09):** PaaS deployment — Vercel (web) + Render (api). There are no local services to containerize: TTS is a remote endpoint, the DB is hosted Turso.

## 2. Key architectural decisions

| Area | Decision | Why | Main alternative (and why rejected) |
| --- | --- | --- | --- |
| Repo layout | Turborepo monorepo | Shared types/schemas/config across apps; one lockfile; atomic cross-app changes | Polyrepo (sync pain), Nx (heavier than needed) |
| Package manager | Bun (install + workspaces + dev runtime); Node 20 ships the api in prod | Fast installs, built-in workspaces + `workspace:*` protocol, native TS dev runner, one toolchain — while production stays on a runtime with zero compatibility risk (Render runs `node dist/server.js`; the web runs on Vercel's platform runtime) | pnpm (strict non-transitive layout — with Bun's hoisting, boundary discipline moves to import-boundary lint + tests), npm |
| Frontend | Next.js App Router | RSC, mature ecosystem, strong DX for UI-centric app | React + Vite (fine, but Next chosen per spec), SPA-only (no SSR needed but Next adds routing/UX ergonomics) |
| Backend | Express 5 | Familiar, minimal, spec-aligned; v5 gives native async error forwarding | Fastify (fast but different ecosystem), NestJS (heavy for this scope) |
| TTS engine | edge-tts (default) | Free, no key, excellent quality, 40+ languages | Paid cloud TTS (violates constraint); Piper/espeak-ng (documented as local fallback options behind the same interface) |
| TTS coupling | `TTSProvider` interface + factory | Engine is swappable via one env var; testable with a mock provider | Hard-coding one SDK (spec explicitly warns against this) |
| AI | `AIProvider` interface → OpenAI-compatible free-tier endpoint | Keyless-to-key upgrade path; same code works with any compatible free provider; server owns the key | Local LLM (heavy, not required by constraint); paid API (violates constraint) |
| Auth | Clerk | Managed IdP; first-class Next.js + Express integrations; no credential handling by us | Custom JWT/passwords (explicitly rejected); Supabase Auth (rejected: pulls in Postgres) |
| Database | Turso + Drizzle | SQLite-compatible, hosted, TS-native schema + queries; file-based local dev | PostgreSQL (explicitly rejected), Prisma (works, but Drizzle is lighter and libSQL-first) |
| Audio storage | Temporary in-memory store + TTL (default) | Spec says permanent storage is not required; history stores metadata; favorited audio persisted as BLOB on demand | Always-persist in DB (waste), object storage (extra service) |
| Deployment | PaaS: Vercel (web) + Render (api), no Docker | No local services to containerize (TTS = remote, DB = hosted); free tiers; platforms provide TLS, builds, rollback | Docker Compose (original design; removed 2026-09 — loses the self-host story + container-hardening section, and prod becomes two origins) |

## 3. Documentation map

```text
text-to-speech/
├── README.md                        ← you are here
├── docs/
│   ├── requirements.md              ← Phase 0: full requirements catalog (FR/NFR, flows, DoD)
│   ├── architecture/
│   │   ├── system.md                ← system architecture, data flows, env model, security
│   │   ├── frontend.md              ← Next.js app architecture
│   │   ├── backend.md               ← Express app architecture
│   │   ├── tts.md                   ← TTS domain, edge-tts, provider abstraction
│   │   ├── ai.md                    ← AI enhancement architecture (free-only)
│   │   └── deployment.md            ← Vercel + Render deployment (no Docker)
│   ├── api/
│   │   └── API.md                   ← complete API reference (all phases, status codes)
│   └── phases/
│       ├── README.md                ← phase index + status
│       └── phase-00 … phase-24/
│           └── learn_the_phase.md   ← one learning doc per phase
```

## 4. Phase index

| Phase | Title | Learning doc |
| --- | --- | --- |
| 00 | Requirements, Scope & Engineering Rules | [docs/phases/phase-00/learn_the_phase.md](docs/phases/phase-00/learn_the_phase.md) |
| 01 | Monorepo & Development Environment | [docs/phases/phase-01/learn_the_phase.md](docs/phases/phase-01/learn_the_phase.md) |
| 02 | Development Environment & Local Workflow | [docs/phases/phase-02/learn_the_phase.md](docs/phases/phase-02/learn_the_phase.md) |
| 03 | Next.js Frontend Foundation | [docs/phases/phase-03/learn_the_phase.md](docs/phases/phase-03/learn_the_phase.md) |
| 04 | Text Input & Client-Side Validation | [docs/phases/phase-04/learn_the_phase.md](docs/phases/phase-04/learn_the_phase.md) |
| 05 | Language & Voice System | [docs/phases/phase-05/learn_the_phase.md](docs/phases/phase-05/learn_the_phase.md) |
| 06 | Express Backend Foundation | [docs/phases/phase-06/learn_the_phase.md](docs/phases/phase-06/learn_the_phase.md) |
| 07 | Backend Validation & Error Architecture | [docs/phases/phase-07/learn_the_phase.md](docs/phases/phase-07/learn_the_phase.md) |
| 08 | TTS Provider Abstraction | [docs/phases/phase-08/learn_the_phase.md](docs/phases/phase-08/learn_the_phase.md) |
| 09 | Free TTS Engine Integration (edge-tts) | [docs/phases/phase-09/learn_the_phase.md](docs/phases/phase-09/learn_the_phase.md) |
| 10 | Frontend ↔ Backend Integration | [docs/phases/phase-10/learn_the_phase.md](docs/phases/phase-10/learn_the_phase.md) |
| 11 | Audio Player & Download | [docs/phases/phase-11/learn_the_phase.md](docs/phases/phase-11/learn_the_phase.md) |
| 12 | Free AI Text Enhancement | [docs/phases/phase-12/learn_the_phase.md](docs/phases/phase-12/learn_the_phase.md) |
| 13 | AI Prompt & Model Architecture | [docs/phases/phase-13/learn_the_phase.md](docs/phases/phase-13/learn_the_phase.md) |
| 14 | Authentication & User Accounts (Clerk) | [docs/phases/phase-14/learn_the_phase.md](docs/phases/phase-14/learn_the_phase.md) |
| 15 | Database & Speech History (Turso + Drizzle) | [docs/phases/phase-15/learn_the_phase.md](docs/phases/phase-15/learn_the_phase.md) |
| 16 | Favorites & Voice Preferences | [docs/phases/phase-16/learn_the_phase.md](docs/phases/phase-16/learn_the_phase.md) |
| 17 | File Upload & Text Extraction | [docs/phases/phase-17/learn_the_phase.md](docs/phases/phase-17/learn_the_phase.md) |
| 18 | Rate Limiting & Abuse Protection | [docs/phases/phase-18/learn_the_phase.md](docs/phases/phase-18/learn_the_phase.md) |
| 19 | Automated Testing | [docs/phases/phase-19/learn_the_phase.md](docs/phases/phase-19/learn_the_phase.md) |
| 20 | Production Deployment (Vercel + Render) | [docs/phases/phase-20/learn_the_phase.md](docs/phases/phase-20/learn_the_phase.md) |
| 21 | Observability & Production Hardening | [docs/phases/phase-21/learn_the_phase.md](docs/phases/phase-21/learn_the_phase.md) |
| 22 | CI/CD | [docs/phases/phase-22/learn_the_phase.md](docs/phases/phase-22/learn_the_phase.md) |
| 23 | Documentation | [docs/phases/phase-23/learn_the_phase.md](docs/phases/phase-23/learn_the_phase.md) |
| 24 | Final System Verification | [docs/phases/phase-24/learn_the_phase.md](docs/phases/phase-24/learn_the_phase.md) |

## 5. How to read this documentation

1. **Start here**, then read [docs/requirements.md](docs/requirements.md) — it is the single
   source of truth for *what* is being built.
2. Read [docs/architecture/system.md](docs/architecture/system.md) — *how the pieces fit together*.
3. Implement phase by phase in numeric order. Before each phase, read its
   `learn_the_phase.md`: it explains the concepts, the why, the choices, the verification
   checklist, and the pitfalls. Do not skip ahead to authentication, database, or AI before the
   core TTS pipeline (Phases 1–11) works — that ordering is deliberate.
4. Keep [docs/api/API.md](docs/api/API.md) in view while building the backend; it is the contract.

## 6. What "done" means

See the **Definition of Done** in [docs/requirements.md](docs/requirements.md#12-definition-of-done).
In short: the core pipeline (text → generate → play → download) works end-to-end with the free
TTS engine, AI enhancement works with a free key (and degrades gracefully without one), all
documented failure modes behave per the API contract, the PaaS deployment is live and verified, tests pass, and every
implemented phase has an up-to-date `learn_the_phase.md`.
