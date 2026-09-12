# Phase 00 — Requirements, Scope & Engineering Rules

**Status:** ✅ complete (this document + [requirements.md](../../requirements.md) are the deliverable)
**Builds on:** — · **Unlocks:** Phase 1

## What this phase is

Before any code, we fix *what* we are building and the rules the build must obey. This phase
produces:

1. [docs/requirements.md](../../requirements.md) — the full catalog: functional requirements
   (FR-*), non-functional requirements (NFR-*), user flows (UF-*), error matrix, API/TTS/AI/
   security/deployment requirements, environments, Definition of Done.
2. [docs/architecture/system.md](../../architecture/system.md) — the target system (so
   requirements are checked against a concrete shape).
3. The binding engineering rules (below).

No application code exists yet — that is deliberate.

## Why we build it this way

- **Requirements engineering prevents the #1 student-project failure mode:** building a coherent
  but *wrong* app, discovering mismatches at deployment. Each FR has an ID so later phases can
  point at it ("this component satisfies FR-006") and the Definition of Done becomes checkable.
- **Functional vs non-functional:** FRs say *what the system does* (accept text, play audio).
  NFRs say *how well* (latency budgets, security properties, accessibility, graceful
  degradation). NFRs are where real projects fail silently — they're in the catalog explicitly
  (NFR-001…NFR-011), including an honest scalability limit (NFR-011).
- **MoSCoW phasing:** Must (core TTS) → Should (AI) → Could (auth/history/uploads) → Won't
  (documented exclusions). The "Won't" list is as important as the "Must" list: it stops scope
  creep mid-project.

## How it works (the concepts)

### Client/server, and why we split the app

The browser and the server run in **different trust domains**:

- The browser is *adversarial* from the server's point of view: any value it sends can be forged
  by a developer-tools user. So the server re-validates everything (SR-02) and the client
  validation exists only for UX speed.
- The server owns **secrets** (AI key, Clerk secret key, DB token). Anything shipped to the
  browser is public by definition. Splitting the app is what makes "keys never reach the client"
  an architectural fact instead of a discipline (SR-01).
- The server is the right place for **provider integration** (TTS egress, timeouts, rate
  limiting, audio lifetime) because that state must survive browser navigations and be
  shared/fair across users.

### REST, APIs, HTTP

- An **API** is a contract: "send this JSON, get that JSON (or these error codes)." Ours is
  documented in [api/API.md](../../api/API.md) *before* implementation — the frontend and
  backend can be developed against it independently.
- **REST** conventions we use: resources as nouns (`/voices`, `/history/:id`), HTTP verbs for
  operations (GET/POST/PUT/DELETE), status codes carrying meaning (§2.4 of requirements),
  idempotent GETs, no session state in URLs.
- **Status code discipline** comes from the spec: 4xx = caller's fault, 503 = *our* external
  dependency's fault, 500 = our bug. The error matrix (requirements §6) maps every failure to
  exactly one code + status + user action — that triple is what the UI renders.

### TTS in 101

Text-to-speech = (1) a linguistic model that decides *how to say* the text, (2) a neural voice
model that renders it to audio. In this project both live inside the **engine** (edge-tts); our
system is the pipeline around it: validate → resolve voice → synthesize → temporary store →
stream to browser. We own the contract, limits, caching, and failure mapping — never the model.
Full design: [architecture/tts.md](../../architecture/tts.md).

### Free-only constraint (the project's spine)

Two constraints shape *all* architecture:

- **TTS:** no paid API required → keyless edge-tts default, provider abstraction, honest
  documented risk (unofficial endpoint) + swappable local alternatives.
- **AI:** free models only → feature off by default, on with a user's free-tier key, provider
  abstraction, validated outputs, explicit user confirmation before applying.

## Key concepts you should learn

- Requirements engineering: FR vs NFR, MoSCoW, traceability (ID → phase → test).
- User-flow thinking: happy path + every failure branch, before designing UI.
- Client/server trust boundaries; "never trust the client."
- REST resource design; status-code semantics; error-contract design.
- API-first development: writing the contract (API.md) before the code.
- Provider abstraction as risk management (unofficial TTS endpoint).
- Definition of Done as a testable checklist, not a vibe.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Docs-first (this phase, no code) | The spec's own learning goal is understanding | Skipping to code (loses the traceability net) |
| Requirements in one file with stable IDs | Single source of truth; phases cite IDs | Scattered notes (drift) |
| Free-only as a *hard* constraint | Fixes engine choices before designing them | "Pick the best provider, then find it affordable" (late surprises) |
| 24-phase ordered plan, core first | Working pipeline before extensions | Feature-priority (auth before TTS = blocked) |

## What gets created

```text
docs/requirements.md                ← full catalog (FR/NFR/UF/API/TTS/AI/SEC/DEPLOY/DoD)
docs/architecture/system.md         ← target system + decisions log
docs/phases/README.md               ← phase index + milestones
README.md                           ← project home (constraints, decisions, doc map)
docs/phases/phase-00/learn_the_phase.md  ← this file
```

## Verification checklist

- [x] Every user-visible capability in the spec maps to ≥ 1 FR
- [x] Every security requirement in the spec (SR-*) is present and actionable
- [x] Error matrix covers: empty text, over-length, invalid voice/language, API failure,
      network failure, auth failure, rate limit, malformed request, external service down
- [x] DoD has checkable items per milestone
- [x] Hard constraints (C1–C6) are explicit and cited by later docs
- [ ] (Next) Phase 1 implements nothing that contradicts this document

## Common pitfalls

- **Unverifiable requirements** ("fast", "secure") → every NFR here has a number or a testable
  behavior.
- **Designing the UI before the contract** → API.md exists before any component.
- **Letting "optional features" become required** → MoSCoW + Won't list.
- **Assuming a free service is a service** → edge-tts's unofficial status is a *requirement
  note* (TR-09), which is why the abstraction is a Must, not a nice-to-have.

## How it connects to the rest of the system

Every later phase's "why" is a citation into this phase: FR-005 drives Phase 9, SR-04 drives
Phase 18, C4 drives Phase 15's schema, the error matrix drives Phase 7 and the frontend
ErrorMessage component. If a later phase wants to change a requirement, the change happens here
first (requirements are the source of truth), then the phase doc.

## What to remember

1. Requirements are IDs, not paragraphs — FR-005 is a contract; a paragraph is a conversation.
2. The two trust domains (browser/adversarial, server/trusted) explain ~80% of the security rules.
3. 4xx vs 503 vs 500 is a *classification* of who is at fault — the UI renders from it.
4. "Free only" is an architectural constraint, not a shopping preference: it chose the TTS
   default, the AI's off-by-default design, and the provider abstractions.
5. Definition of Done = the list that turns "done" from an opinion into a checklist.
