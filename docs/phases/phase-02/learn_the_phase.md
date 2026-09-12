# Phase 02 — Development Environment & Local Workflow

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 1 · **Unlocks:** Phase 3 (UI work on a polished dev loop)

## What this phase is

The Docker removal (C6, decided 2026-09) shrank this phase from "containers" to its true
remaining value: **making the native dev experience the product's front door.** Phase 1 proved
`bun run dev` works; Phase 2 makes a fresh clone *effortless* and the day-to-day workflow
*explicit*:

- **`.env` workflow:** root `.env` (git-ignored, from `.env.example`) feeds both apps — one
  file, documented variables, no mystery.
- **Git workflow:** branch naming (`phase-NN-slug`), PR titles (`Phase NN: …`), commit
  discipline, and the pre-commit gate (gitleaks secret scan + lint on touched files) — the
  local twin of Phase 22's CI.
- **DX polish:** the exact first-run runbook (clone → install → env → dev → verify), port
  conflicts, watch/restart behavior, and what to do when something misbehaves.
- **Honest record:** the C6 change documented where the old Phase 2 promised containers (see
  "Why" below) — the design's as-built notes, not a silent scope drop.

## Why we build it this way

- **The first-run experience is the dev environment.** Without Docker, the claim "portable,
  works anywhere" (NFR-007) rests entirely on: Bun installed + `bun install` + `bun run dev`.
  That's three commands — which is a feature — but it means *those three commands must never be
  broken by env drift*, so the env surface is small, written down, and testable (the runbook is
  executed in Phase 2, then re-executed at every phase's verification).
- **`.env` at the repo root, one file:** Bun (our runtime in dev) walks up from each package's
  cwd to the workspace root loading `.env` files, so both apps see the same file. One file
  means one place for "what do I set?" — and `.env.example` (already committed in Phase 1) is
  the documentation. We deliberately do *not* create per-app env files (two sources of truth).
- **Pre-commit mirrors CI.** Phase 22 makes lint/secret-scans laws on GitHub; pre-commit makes
  them instant locally. Same tools (gitleaks, the repo's linters), same rules, ~1 second.
  Reviewers never see a leaked key or an obvious lint failure.
- **The C6 record belongs in the phase doc.** The original Phase 2 was "Docker dev
  environment." Anyone reading the phase index later deserves a doc that says: this is what
  happened to that phase, why, and what the replacement guarantees are. Scope changes without
  records are how projects lose trust in their own docs.

## How it works (internals)

### The first-run runbook (the phase's actual deliverable)

```text
1. git clone <repo> && cd text-to-speech
2. bun --version            # needs Bun ≥ 1.2 (engines field documents it)
3. bun install              # frozen by bun.lock
4. cp .env.example .env     # then: paste your free AI key (optional), nothing else needed
5. bun run dev              # turbo: web :3000 + api :4000 (dev proxy wired)
6. verify:
   - http://localhost:3000            → shell page (5,000 limit rendered)
   - http://localhost:3000/api/health → { success: true, status: "ok" }
```

Steps 3–6 are Phase 1's checklist re-executed *as a human would*, and they are re-run at the
start of Phase 3 to prove the environment survived a phase boundary.

### `.env` loading (dev)

- One file at the repo root. Bun auto-loads it for both apps (workspace-root walk-up).
- `@tts/config` (Phase 1) reads `process.env` with defaults + fail-fast — so a *missing* `.env`
  still boots (defaults: edge-tts, port 4000, AI off) and only *bad* values fail loudly.
- Never committed: `.gitignore` (Phase 1) + the gitleaks pre-commit hook as backstops.

### Git workflow

```text
main                 ← protected from Phase 22 (green CI + review required)
phase-NN-slug        ← per-phase branches, PR titled "Phase NN: <summary>"
```

- One PR per phase (the `learn_the_phase.md` delta rides in the same PR — the Phase 23 rule
  from the start).
- Commits: imperative, scoped (`api: …`, `web: …`, `docs: …`).

### Pre-commit gate

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: gitleaks
        name: gitleaks
        entry: gitleaks protect --staged -v
      - id: lint-staged
        name: lint touched files
        entry: bun run lint:staged   # eslint --fix on staged .ts/.tsx (fast subset)
```

(Small, local, and identical in spirit to the CI gate — Phase 22 runs the same two tools on
the diff.)

## Key concepts you should learn

- **Reproducibility without containers:** what a lockfile + a pinned toolchain version
  (`engines`, CI setup actions) actually guarantee; the residual variables (OS, env files) and
  how to write them down so they're not residual.
- **Env file conventions:** `.env.example` as documentation, `.env` as local secret, root-level
  loading in a workspace, default-vs-required variable design (fail-fast on bad, default on
  missing).
- **Secret scanning as a habit:** gitleaks on staged changes; why pre-commit (speed) and CI
  (law) are both needed.
- **The "first-run" as a testable artifact:** a runbook that isn't executed is fiction; here it
  is executed every phase (the verification checklists start from it).
- **As-built scope changes:** documenting what a phase became vs. what it was planned to be —
  the skill that keeps a 24-phase project's documentation honest.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Root-level `.env` (single file) | One source for local config; Bun's workspace-root walk-up makes it work for both apps | Per-app `.env` (two truths), no env file (defaults only — no way to set the AI key locally) |
| Pre-commit = gitleaks + fast lint | Same tools as CI, instant feedback, ~1 s | Husky + full lint (slower), nothing (keys leak into history once) |
| Runbook re-executed per phase | The environment is the project's foundation; prove it every step | "It worked in Phase 1" (drift) |
| Keep phase number 02 (no renumber) | All 25 phase cross-references stay stable; the doc explains the scope change | Renumber everything (churn, broken links, lost alignment with the original plan) |

## What gets created

```text
.env                      (created locally, never committed — runbook step 4)
.pre-commit-config.yaml
git: first phase branch + PR conventions in practice
README quick-start section (root README gains the runbox above)
phase-01/phase-02 docs: as-built notes updated (C6 change recorded)
```

## Verification checklist

- [ ] Runbook executed **literally, from a fresh clone**, steps 1–6 pass (timed; < 2 min to
      working dev)
- [ ] `git status` clean with a populated `.env` present (ignored); `data/` (created later,
      Phase 15) also ignored
- [ ] Pre-commit: a staged fake secret (`AI_API_KEY=sk-...`) is blocked; a staged lint error is
      fixed in place
- [ ] Kill the dev process and re-run: hot state is clean (no stale `.turbo`/`node_modules`
      issues); port conflict (3000 busy) produces a readable error, not a hang
- [ ] `bun run dev` with **no** `.env` at all: boots on defaults, AI shown as off (Phase 12's
      disabled state later); adding `.env` with an AI key requires no restart trickery beyond
      what's documented
- [ ] Both apps read the *same* root `.env` (set `CORS_ORIGIN` in the root file → api logs it)
- [ ] A phase branch + PR following the naming rules exists for this phase

## Common pitfalls

- **Committing `.env` once, forever** → the pre-commit hook is the tripwire; the real fix is
  the muscle memory (`.env.example` is the only env file in git).
- **Per-app env files "just for the API"** → two files, two truths; the root file +
  `@tts/config` defaults is the design.
- **Skipping the fresh-clone re-run** → "works on my machine" is the failure this phase exists
  to make impossible.
- **Renaming/re-numbering phases in a cleanup mood** → 25 docs of cross-references; the as-built
  notes exist for exactly this.
- **Assuming CI = pre-commit** → pre-commit is instant feedback; CI is the law (people push
  with `--no-verify`; gitleaks runs on the diff in Phase 22 regardless).

## How it connects to the rest of the system

- Every later phase's verification checklist assumes this environment (its first line is the
  runbook).
- Phase 22's CI is the same toolchain at scale: same Bun pin, same lint, same gitleaks.
- Phase 20 deploys *this* tree to Vercel/Render — the env matrix in deployment.md §3–4 is the
  production half of this phase's `.env` story.
- Phase 23's README quick-start is the runbox, promoted.

## What to remember

1. Three commands are the whole dev environment: `bun install`, `cp .env.example .env`,
   `bun run dev`. Protect them like a contract.
2. One env file (root) + defaults in code + fail-fast on bad values — the env design that makes
   "first run works" true.
3. Pre-commit is speed; CI is law. Same tools, different teeth.
4. Scope changes get written down where the old scope was promised — that's what as-built notes
   are for.
5. A runbook you don't re-execute is fiction.
