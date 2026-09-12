# Phase 23 — Documentation

**Status:** ✅ substantially complete at initial delivery (this repo is the Phase 0 deliverable:
requirements, architecture, API, and all 25 phase docs) — this phase *maintains* it and adds
the operational deliverables.
**Builds on:** Phase 22 · **Unlocks:** Phase 24 (final gate)

## What this phase is

The spec's deliverable list (spec §34) becomes concrete, maintained artifacts:

1. **Source code + GitHub repo** — the monorepo (Phases 1–22) with branch protection (Phase 22).
2. **README documentation** — root README (project home, decisions, doc map) + per-app READMEs
   (web/api quick-start: env vars, commands, local run).
3. **Database schema doc** — `docs/architecture/database.md`: the Drizzle schema as documented
   DDL (tables, columns, indexes, constraints) + migration history + the "app data only (C4)"
   boundary statement. (New file, Phase 23 deliverable.)
4. **API documentation** — [api/API.md](../../api/API.md), *maintained as a contract*: every
   endpoint change is a PR that touches API.md in the same commit (enforced by review, checked
   by the contract tests of Phase 19).
5. **UI screenshots** — `docs/screenshots/`: the core flow (editor → generate → player →
   download), AI review panel, history, favorites, error states (empty/over-length/429/503),
   mobile + desktop. Captured from the *deployed* build (post-Phase-22), regenerated on each
   release that changes the UI.
6. **Deployment URL** — the prod URL + the Vercel preview URL convention (per PR), recorded in
   the README's "Live" section.
7. **Postman collection** — `docs/postman/tts-api.postman_collection.json`: every endpoint in
   API.md with env vars (`API_BASE`, `CLERK_TOKEN`), example bodies, and the **error-matrix
   folder** (one request per requirements §6 row — the matrix is runnable, not just written).
8. **Project presentation** — deck outline derived from this documentation (the "why" slides
   are the decision-log sections of system.md/tts.md/ai.md; the "how" slides are the
   architecture diagrams; the "what I learned" slides are the *What to remember* sections —
   the phase docs literally are the presentation content).
9. **Short project demonstration** — the 5-minute demo script: core flow (30 s) → AI
   enhancement (30 s) → history/favorites (30 s) → a failure demo: kill egress, watch the
   honest 503 + readiness `degraded` + metrics (60 s) → rollback story (30 s). The demo is
   Phase 24's matrix performed in public.
10. **Per-phase `learn_the_phase.md` maintenance** — the standing rule: **code and docs land in
    the same PR.** A phase's doc answers the ten questions *as built* (what we chose, what we
    changed from design, why); a design-vs-as-built delta is written into the doc's "As-built
    notes" section, never silently dropped.

## Why we build it this way

- **Documentation as a *first-class deliverable with a maintenance policy*, not an end-of-
  project artifact.** The spec makes the learning docs the pedagogical core ("particularly
  important for your stated goal of actually understanding the project rather than simply
  obtaining generated code"). Docs that rot the week after the project is "done" fail that
  goal; docs that ride along in every PR stay true. The policy is mechanical (same PR, same
  review) because mechanical is what survives motivation decay.
- **The ten questions are a *shape*, not a template to fill.** Every `learn_the_phase.md`
  answers: what did we build? why? how does it work internally? why this technology? what
  alternatives exist? what problems does it solve? what are its limitations? how does it
  connect? what should I remember? The best docs answer them in that order with *evidence*
  (the worked example, the failure table, the grep) rather than abstractions — that's the
  standard this repo's phase docs already set, and Phase 23 keeps raising it.
- **The error matrix and DoD are *runnable documentation*.** Postman's error folder (matrix as
  requests) and the Phase 24 matrix (matrix as a verified checklist) are the same spec text in
  three forms (prose, automation, human ritual) — redundancy that *catches drift*: when the
  three forms disagree, one of them is wrong, and the disagreement is the bug report.
- **Presentation/demo derived, not authored separately.** The deck's argument is already made
  in the decision logs; the demo's script is already Phase 24's happy paths. Derivation keeps
  three artifacts (deck, demo, docs) consistent by construction — and the "what I learned"
  content is free, because the *What to remember* sections were written all along.

## How it works (internals)

```text
doc tree (final — per spec §23 target, with this repo's extensions):
docs/
├── requirements.md                  (source of truth; changes only via a spec change)
├── architecture/
│   ├── system.md · frontend.md · backend.md · tts.md · ai.md · deployment.md
│   └── database.md                  (Phase 23: documented DDL + migration history)
├── api/API.md                       (contract; PR-touch rule)
├── phases/README.md + phase-00…24/learn_the_phase.md   (ten questions, as-built notes)
├── screenshots/                     (deployed-build captures, per flow incl. error states)
├── postman/tts-api.postman_collection.json
└── runbook.md                       (deploy/verify/rollback/rotate/incident — from Phase 22)
root README.md  (Live section: prod URL + preview convention; decisions table; doc map)
```

Maintenance mechanics:

- **PR rule (review checklist item):** "does this PR change behavior? if yes, which doc
  section is touched in the same commit?" — one line of review discipline that keeps the
  contract live.
- **As-built notes:** each phase doc carries an `## As-built notes` section (empty at design
  time). Implementation deltas (e.g., "we chose X over the design's Y because Z") are appended
  there with dates — the doc stays a *honest record*, not a fiction of original intent.
- **Screenshot refresh:** a `bun run docs:screenshots` script (Playwright, Phase 19's stretch
  e2e harness) re-captures the fixed shot list on demand; the shot list is checked in
  (names = flows), so "which screenshots are stale?" is a diff, not a memory.
- **Postman ↔ API.md sync:** the collection's request list is generated-checked against
  API.md's endpoint table (a small script in `scripts/` — drift fails a doc-check CI job).

## Key concepts you should learn

- **Docs as contract vs docs as narrative:** API.md/requirements.md are *contracts* (changes
  are versioned decisions); the learn docs are *narratives* (explanation with evidence).
  Different maintenance rhythms, different review standards — conflating them is how both
  fail.
- **The same-fact-multiple-forms pattern:** matrix as prose (requirements) + requests
  (Postman) + tests (Phase 19) + ritual (Phase 24). Redundancy is *correctness infrastructure*
  when the forms are checked against each other.
- **Design vs as-built:** the professional record keeps both (intent + what actually happened,
  with the why of the delta); the amateur record keeps a fiction that pretends the delta never
  happened.
- **Derived artifacts:** presentation/demo/screenshot-set derived from canonical sources —
  consistency by construction beats consistency by diligence.
- **Documentation as pedagogy (the project's stated goal):** the ten questions + evidence
  standard exist so that *reading the repo teaches the subject* — the test of the standard:
  can a second person, from docs alone, explain to a third person *why* edge-tts, *why* Clerk,
  *why* the temp store, *what breaks* if egress dies? If yes, the docs passed.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Markdown in-repo (no external doc site) | The repo is the doc system; no second deploy, no drift tooling | Docusaurus/VitePress (nice, but a deploy+build surface for a student-scale project — the escape hatch if it outgrows) |
| Postman JSON in-repo | The spec's deliverable; runnable; diffable | Swagger/OpenAPI (excellent — documented as the *upgrade path* if the API grows beyond ~15 endpoints) |
| Playwright for screenshots | Reuses Phase 19's harness; deterministic shots | Manual screenshots (stale by next release) |
| Ten-question structure (fixed) | Reviewable standard; gaps are visible (a missing "alternatives" is a smell) | Freeform docs (uneven, unfalsifiable) |

## What gets created (this phase, on top of the existing doc tree)

```text
docs/architecture/database.md
docs/runbook.md
docs/screenshots/ (+ shot list + bun run docs:screenshots)
docs/postman/tts-api.postman_collection.json
scripts/{check-docs.mjs (API.md↔Postman sync), docs-screenshots.mjs}
per-app READMEs (apps/web, apps/api)
root README: Live section (URLs) + deliverables table (spec §34 → where each lives)
presentation outline (docs/presentation-outline.md) + demo script (docs/demo-script.md)
```

## Verification checklist (M5 — documentation)

- [ ] Every spec §34 deliverable has a checked-in location (the README's deliverables table
      has no "?" cells)
- [ ] API.md endpoint table ↔ Postman collection ↔ implemented routes: three-way diff clean
      (script green)
- [ ] Every phase doc has a non-empty or explicitly-"no delta" As-built notes section
- [ ] Screenshot set covers: core flow, AI review, history, favorites, 4 error states, mobile;
      all captured from the deployed build (URL in each shot's metadata file)
- [ ] The ten-question standard audit: two randomly chosen phase docs, read cold, by a second
      person — can they answer the ten questions to a third person *from the doc alone*?
      (recorded pass/fail — this is the spec's understanding goal, made checkable)
- [ ] Presentation outline + demo script exist; the demo was dry-run once end-to-end (timed:
      ≤ 5 min)
- [ ] Doc-check job in CI green (sync + basic link/lint of markdown)

## Common pitfalls

- **Docs as a final-week artifact** → by construction, no: same-PR rule + as-built notes. If a
  phase "finishes" without its doc delta, the phase is not finished (DoD, Phase 0).
- **Design fiction** (the doc pretends what happened equals what was planned) → the As-built
  notes section exists precisely to make deltas honest.
- **Three sources of truth for one fact** (limits in three places) → limits live in
  `@tts/config`/`@tts/validation` (code) and are *referenced* (not retyped) in docs where
  needed; docs that retype a number will drift — the rule: cite the constant, don't copy it.
- **Screenshot drift** → shot list + script + deployed-build rule; a stale screenshot is a
  visible diff, not a suspicion.
- **Presentation as new writing** → derive from decision logs; if a slide's claim isn't in a
  doc, the slide is making things up.

## How it connects to the rest of the system

- Phase 24 consumes this phase's artifacts as its *instruments*: the Postman collection (API
  verification), the matrix (failure verification), the runbook (incident rehearsal).
- The presentation/demo are the project's *public face* of everything earlier — the phase docs
  are the private face. Same facts, two audiences.
- Future developers (including future-you) meet the project here first: README → requirements
  → system.md → phase docs, in that order. The onboarding path is the doc map's shape.

## What to remember

1. Docs land in the same PR as code — the rule is one line, the effect is a living record.
2. Contracts (requirements/API) are maintained like code; narratives (learn docs) are
   maintained with evidence; the ten questions are the shape both are held to.
3. One fact, several forms (prose/Postman/tests/ritual) — and the forms are *checked against
   each other*, or the redundancy becomes drift.
4. As-built notes keep the record honest: intent and reality, with the why between them.
5. The test of the documentation is the spec's own goal: can someone understand the project —
   not just use it — from reading what's here?
