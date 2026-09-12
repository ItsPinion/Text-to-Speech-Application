# Phase 22 — CI/CD

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 21 (measurable system) · **Unlocks:** Phases 23/24 (docs + final gate on
green pipelines)

## What this phase is

GitHub Actions as the quality gate and the deployment verifier (spec §18/§22, C6 — no Docker):

- **PR workflow** (every pull request): `install (frozen lockfile) → lint → typecheck → test
  (default tags) → build (turbo) → secret scan (gitleaks on the diff) → dependency audit
  (bun audit)`.
- **main workflow** (merge to main): everything above **plus** `bun run test:network` (real
  edge-tts smoke, retry-once policy) **plus a post-deploy check**: Vercel and Render
  auto-deploy from main (their GitHub integrations), and CI verifies the *deployed* URLs are
  healthy within ~3 minutes (otherwise the workflow fails and the rollback runbook applies).
- **Branch protection:** `main` requires PR + green checks; direct pushes blocked; required
  reviews (1) per the spec's "branch protection, required checks."
- **Dependency hygiene:** Dependabot (`bun` + no container ecosystem), lockfile-only updates
  auto-merged when green (policy documented), `bun audit` threshold (no high/critical).
- **No secrets committed** (gitleaks on PRs + pre-commit hook from Phase 2) — the spec's
  explicit requirement, enforced twice.

## Why we build it this way

- **The pipeline is the project's *definition of good*, executable.** Phase 0's DoD becomes
  gates: lint/typecheck/test/build/audit all green *or the merge doesn't happen*. The
  per-phase verification checklists (Phases 1–21) mostly *are* these steps — CI is where they
  stop being habits and start being laws.
- **"main is deployable" replaces "CI deploys".** Without a Docker image to publish, the
  deploy trigger is simply the push to main: Vercel and Render auto-deploy the same commit
  that passed the merge gate. CI's job shifts from *shipping* to *verifying what shipped* —
  the post-deploy check curls the live URLs and fails the workflow if the deployment didn't
  come up healthy. This is the same success condition as a self-hosted deploy ("deploy is done
  when the check is green"), just pointed at PaaS URLs.
- **PR vs main split = cheap vs expensive.** Every check runs on every PR (fast feedback,
  minutes, no network). The expensive or flaky-adjacent step (the network suite) runs only
  when the code is *accepted* — on main. This is the cost/flake economics: the network suite
  on every PR would train the team to ignore red.
- **Secrets never enter the pipeline as code:** CI knows no runtime secrets at all (the
  platforms' GitHub integrations deploy; the platforms' env dashboards hold the keys). The
  pipeline's only secrets are git-level (if any webhook tokens exist). SR-01 extends to the
  delivery path: artifacts are code, identities stay on the platforms.
- **Dependabot without a container ecosystem:** with no base images, the dependency surface is
  npm (bun lockfile) only — one ecosystem, one update cadence, weekly grouped.

## How it works (internals)

### .github/workflows/ci.yml (PR)

```yaml
on: pull_request
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - oven-sh/setup-bun (pinned) + bun cache
      - bun install --frozen-lockfile
      - bun run lint            (turbo run lint)
      - bun run typecheck
      - bun run test            (default tags; uploads coverage artifact)
      - bun run build
  security:
    steps: gitleaks (on PR diff) + bun audit (fail on high/critical)
```

### .github/workflows/deploy.yml (main)

```yaml
on: { push: { branches: [main] } }
jobs:
  verify:
    # quality + security (as PR) +
    - bun run test:network      (retry: 1, then fail-with-report)
    # — if verify is red, the merge never happened, so nothing deploys
  check-deployments:
    needs: verify
    # Vercel + Render auto-deployed main already (their GitHub integrations).
    # This job verifies the *shipped* system:
    - wait for https://<api>/api/health        (retry 30 × 5 s)
    - wait for https://<api>/api/health/ready  (200)
    - wait for https://<web>/                  (200)
    - CORS probe: Origin https://<web> → allow-list header exact match
    - on any failure: fail the workflow + comment the rollback runbook
      (Render: redeploy previous version; Vercel: redeploy previous deployment)
```

Rollback story (documented, two clicks + a curl): both platforms retain previous versions;
"undo the deploy" is a *redeploy pointer*, never a rebuild — the same principle as the old
image-tag rollback, minus the registry.

### Enforcement (repo settings — the "code" is configuration)

```text
main:
  protection: require PR, require status checks: [quality, security, verify, check-deployments]
  block force-push + direct push
  require 1 approval (the spec's "required checks")
branches: phase branches (phase-NN-…) — no protection (fast iteration), merge via PR to main
Dependabot:
  bun (workspace) group: weekly, version updates;
  lockfile updates auto-merge when green; major updates → PR for human review
pre-commit (Phase 2, mirrors CI): gitleaks + lint on staged files
```

## Key concepts you should learn

- **Pipeline economics:** cheap-fast-feedback on PR; the network suite on main; the split is a
  *policy about attention* (what makes the team look at red).
- **"Main is deployable":** green merge gate ⇒ any commit on main is safe to ship ⇒ the
  platforms auto-deploy and CI *verifies* the result. The deployment and the test are two
  halves of one promise.
- **Post-deploy verification:** the success condition of a deploy is a green check on the
  *live* URLs (health, readiness, CORS, one real call) — never "push succeeded." Rollback keys
  off the same check.
- **Immutable deploys on PaaS:** platforms retain versioned deploys; rollback = redeploy a
  previous version (pointer change, no rebuild).
- **Secret boundary for pipelines:** CI knows *zero* runtime secrets (the platforms hold
  them); the pipeline ships code, not identities — SR-01 extended to the delivery path.
- **Flake containment in CI:** retry-once + fail-with-report for the network suite;
  `cancel-in-progress` for superseded PRs; artifacts (coverage) as evidence.
- **Supply chain basics:** frozen lockfile in CI (no drift), Dependabot grouping (reviewable
  updates), `bun audit` thresholds — the project's "don't get compromised by a dependency"
  story.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| GitHub Actions (per spec: GitHub) | Free for the scale; YAML pipelines; `oven-sh/setup-bun` mature | GitLab CI (also good; repo is GitHub per spec), custom runners (ops tax) |
| Auto-deploy from main + CI post-deploy check | The merge gate already proves deployability; CI verifies the live result | CI-triggered webhooks (extra moving part, same outcome), manual deploys (human in the loop for every change) |
| `oven-sh/setup-bun` + bun cache | Matches the repo's toolchain (Bun, C6's sibling decision) | Node-only CI (can't install the workspace the same way contributors do) |
| Dependabot `bun` ecosystem, grouped weekly | One dependency surface (no container ecosystem left), reviewable cadence | Per-package noisy updates, no updates (rot) |
| gitleaks on the diff (PR) + staged (pre-commit) | The spec's "no secrets committed" enforced twice | Honor-system .gitignore (the .env mistake still ships a key once) |

## What gets created

```text
.github/workflows/{ci.yml,deploy.yml}
.github/dependabot.yml
scripts/postdeploy-check.sh (health/readiness/CORS probes, used by check-deployments)
pre-commit config (Phase 2, now mirrored in CI)
docs: deployment runbook (deploy, verify, rollback, key rotation, incident "edge-tts down")
       — the runbook written for a human who built nothing
```

## Verification checklist (M5 — delivery)

- [ ] PR with a lint error → red before merge is even offered (protection works)
- [ ] PR with a fake `.env` containing `AI_API_KEY=fake…` → gitleaks gate red
- [ ] Full PR green: quality + security, < 8 min total (timed; turbo cache works: second PR in
      the same branch < 3 min)
- [ ] main: verify (incl. `bun run test:network`, retry-once visible in logs) → Vercel +
      Render auto-deploy → `check-deployments` green < 180 s
- [ ] Deliberately-bad deploy drill: push a bad main change (feature flag off → 500 on
      `/api/tts`) → post-deploy check fails → redeploy previous version on both platforms →
      check green; the drill is recorded (timestamps + commands)
- [ ] Dependabot: a version bump lands as a grouped PR; lockfile-only auto-merge observed
      green; `bun audit` red on a deliberately-vulnerable dep (simulation)
- [ ] Preview deploy: a PR gets a live Vercel preview URL hitting the (staging or prod) API —
      reviewers can test real changes
- [ ] Secret audit of the pipeline: run logs contain no runtime secret *values* (search for
      the values, not the names)

## Common pitfalls

- **Network suite on every PR** → red fatigue; it's a main-gate by design.
- **"Deployed" = "push succeeded"** → the post-deploy check (live URLs) is the success
  condition; the push is just the start.
- **CI needing runtime secrets** (e.g., storing `TURSO_AUTH_TOKEN` in GitHub secrets "for
  deploy") → the platforms' env dashboards are the secret home; CI ships code, never
  identities.
- **Force-push to a protected branch** → the setting exists for a reason; the rollback story
  (versioned deploys) exists so force-push is never *needed*.
- **Auto-merging Dependabot majors** → version updates auto-merge; *major* bumps get a human
  (a breaking zod/express upgrade is a PR, not a bot).

## How it connects to the rest of the system

- Phase 23: the deployment runbook + Postman collection + screenshots are the doc deliverables
  that *this* pipeline keeps current (every release re-runs the evidence).
- Phase 24: the final verification is executed against the *CI-verified* deployment — the last
  gate is "the pipeline's output, in the wild, passes the matrix."
- Operations: the runbook (deploy/verify/rollback/rotate/incident) is written by this phase,
  used by humans — the handoff from "project" to "service."

## What to remember

1. Green merge gate ⇒ main is deployable ⇒ platforms auto-deploy ⇒ CI verifies the live URLs.
   Four links, one promise.
2. Deploy success = post-deploy check green on the live URLs, never "push succeeded."
3. Rollback is a pointer (redeploy the previous version), not a rebuild.
4. CI carries *no* runtime secrets — the platforms hold identities; the pipeline ships code.
5. The pipeline is the Definition of Done with teeth — Phase 0's checklist, now a law.
