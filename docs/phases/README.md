# Phase Index

The project is implemented in strict numeric order. The basic TTS pipeline must be functional
after Phase 11; everything after progressively hardens and extends it. **Do not build
authentication, database, AI, or uploads before the core pipeline works.**

Each phase directory contains `learn_the_phase.md`, which answers:

> What did we build? Why? How does it work internally? Why this technology? What alternatives
> exist? What problems does it solve? What are its limitations? How does it connect to the rest of
> the system? What should I remember?

**Status legend:** 📄 design/learning doc complete · 🔨 implementation pending · ✅ implemented
& verified (verification checklist executed; as-built notes recorded in the phase doc)

| Phase | Title | One-line goal | Exit criterion (short) | Status |
| --- | --- | --- | --- | --- |
| [00](phase-00/learn_the_phase.md) | Requirements, Scope & Engineering Rules | Agree on *what* and the binding rules | This document + requirements.md | 📄 |
| [01](phase-01/learn_the_phase.md) | Monorepo & Development Environment | Turborepo + Bun + TS shell | `bun install` + `bun run build/lint/dev` pass | ✅ |
| [02](phase-02/learn_the_phase.md) | Development Environment & Local Workflow | Native dev workflow: `.env`, git, scripts, DX polish | `bun run dev` verified end-to-end + workflow documented | ✅ |
| [03](phase-03/learn_the_phase.md) | Next.js Frontend Foundation | UI shell, components, mock data | All core components render with mocks | ✅ |
| [04](phase-04/learn_the_phase.md) | Text Input & Client Validation | Editor + counts + validation | Counts live; empty/over-length blocked | ✅ |
| [05](phase-05/learn_the_phase.md) | Language & Voice System | Dependent selectors from API | Catalog-driven language→voice UI | 🔨 |
| [06](phase-06/learn_the_phase.md) | Express Backend Foundation | Layered API skeleton | health/voices/tts routes exist (stub TTS) | 🔨 |
| [07](phase-07/learn_the_phase.md) | Backend Validation & Error Architecture | Robust input + error contract | All 4xx paths return documented codes | 🔨 |
| [08](phase-08/learn_the_phase.md) | TTS Provider Abstraction | `TTSProvider` interface + factory | Mock provider end-to-end via API | 🔨 |
| [09](phase-09/learn_the_phase.md) | Free TTS Engine (edge-tts) | Real speech generation | Real MP3 returned, stored, served | 🔨 |
| [10](phase-10/learn_the_phase.md) | Frontend ↔ Backend Integration | Replace mocks with real API | Generate works against live API | 🔨 |
| [11](phase-11/learn_the_phase.md) | Audio Player & Download | Full audio experience | Play/pause/seek/volume/download pass | 🔨 |
| [12](phase-12/learn_the_phase.md) | Free AI Text Enhancement | AI operations wired end-to-end | UF-2 works with free key; degrades without | 🔨 |
| [13](phase-13/learn_the_phase.md) | AI Prompt & Model Architecture | `packages/ai` structure | Prompts/versioning/schemas in place | 🔨 |
| [14](phase-14/learn_the_phase.md) | Authentication (Clerk) | Sign in/up/out, protected routes+API | 401/403 correct; no custom auth code | 🔨 |
| [15](phase-15/learn_the_phase.md) | Database & History (Turso+Drizzle) | Schema, repos, history API | History CRUD works per user | 🔨 |
| [16](phase-16/learn_the_phase.md) | Favorites & Preferences | Star + defaults | Favorites persist; defaults preselect | 🔨 |
| [17](phase-17/learn_the_phase.md) | File Upload & Extraction | TXT/PDF/DOCX → text | UF-4 works; bad files rejected | 🔨 |
| [18](phase-18/learn_the_phase.md) | Rate Limiting & Abuse Protection | Limits + security middleware | 429s, headers, limits enforced | 🔨 |
| [19](phase-19/learn_the_phase.md) | Automated Testing | Frontend + API + integration suites | Suites green in CI | 🔨 |
| [20](phase-20/learn_the_phase.md) | Production Deployment (Vercel + Render) | PaaS deploy, no Docker (C6) | Both live: TLS, health checks, readiness green | 🔨 |
| [21](phase-21/learn_the_phase.md) | Observability & Hardening | Logs, IDs, readiness, metrics | `/metrics`, real readiness checks | 🔨 |
| [22](phase-22/learn_the_phase.md) | CI/CD | GitHub Actions pipeline | PR + main workflows green | 🔨 |
| [23](phase-23/learn_the_phase.md) | Documentation | Docs maintained with code | Docs match shipped system | 🔨 |
| [24](phase-24/learn_the_phase.md) | Final System Verification | E2E + failure matrix | Phase-24 checklist recorded as pass | 🔨 |

## Milestones

- **M1 — Monorepo runs** (Phase 1–2): scaffold + verified native dev workflow. ✅ **complete**
- **M2 — Core TTS works** (Phase 3–11): the product's heart; demoable. ▶️ in progress (Phase 3
  UI shell done on mocks — the demo is visual; real speech lands in Phase 9)
- **M3 — Free AI enhancement** (Phase 12–13): differentiator under the free-only constraint.
- **M4 — Personalization** (Phase 14–17): Clerk + Turso history/favorites/preferences + uploads.
- **M5 — Production** (Phase 18–24): hardening, testing, CI/CD, docs, final verification.
