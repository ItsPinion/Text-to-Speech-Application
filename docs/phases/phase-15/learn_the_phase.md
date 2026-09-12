# Phase 15 — Database & Speech History (Turso + Drizzle)

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 14 (identity) · **Unlocks:** Phase 16 (favorites/preferences)

## What this phase is

Persistence via **Turso (libSQL/SQLite) + Drizzle ORM** (constraint C4 — no PostgreSQL, no
custom auth data):

- **Schema** (4 tables; `users` skeleton already exists from Phase 14): `speech_generations`,
  `favorites`, `voice_preferences` (+ indexes).
- **Data layer:** `@libsql/client` + `@drizzle-orm/libsql`; repositories as the sole SQL
  surface; migrations via `drizzle-kit` (generate → SQL → apply at boot/CI).
- **History feature** (FR-022): every *authenticated* generation is recorded; paginated list,
  detail, delete; audio availability semantics (`available` / `expired` / `persisted`).
- **UI:** `/history` page (Phase 3's reserved route, guard from Phase 14) — list, open (play or
  regenerate), delete.
- **Local dev:** libSQL file (`file:./data/local.db` in the git-ignored `data/` dir) — zero-setup.
  **Prod:** hosted Turso (`libsql://…` + auth token) — zero-ops.

## Why we build it this way

- **libSQL/Turso over PostgreSQL (C4, restated with reasons):** SQLite-compatible, WAL,
  file-or-remote with the *same driver* (`@libsql/client` handles both `file:` and `libsql://`
  URLs) — dev and prod share code, only the URL changes. Hosted Turso removes DB ops from the
  project entirely. Drizzle is TypeScript-native: schema and queries are typed end-to-end
  (a misspelled column is a compile error), and migrations are plain SQL you can read.
- **App data only (C4/C3 boundary):** the DB stores *what users did here* (generations,
  favorites, preferences, app profile) — never identity, never passwords. Clerk remains the IdP
  (Phase 14); the `users` row is keyed by Clerk id and holds only display name + created-at.
- **Scoping is the security model (SR-07):** every repository method takes `userId` as its
  first argument; every query filters by it. "User A can never read User B's history" is not a
  UI property, it's a query-shape property — reviewable, testable, unmissable.
- **Audio in the DB is deliberate and bounded:** generations store *metadata* + `audio_reference`
  (temp-store id). Only **favorites** copy the MP3 into a BLOB (Phase 16) — so persisted audio
  is user-curated and bounded (per-user cap, enforced), keeping the database the right tool
  (structured + small blobs) instead of abusing it as an object store.

## How it works (internals)

### Schema (Drizzle, libSQL dialect)

```ts
// schema sketch — full DDL in code at implementation time
users:            id (text PK, = Clerk id), display_name (text), created_at (text ISO)
speech_generations:
  id (text PK, uuid), user_id (text → users.id, NOT NULL),
  text (text), language (text), voice (text),
  audio_reference (text nullable),       // temp-store id | "persisted:<favId>" | null
  char_count (integer), via_ai (integer 0/1), created_at (text ISO)
  INDEX (user_id, created_at DESC)       // the list query's shape, exactly
favorites:
  id (text PK), user_id (text), generation_id (text UNIQUE per user),
  audio_blob (blob NULL), audio_content_type (text NULL), created_at (text ISO)
voice_preferences:
  user_id (text PK), language (text), voice (text), updated_at (text ISO)
```

Notes:

- **Text ISO timestamps** (not SQLite integers): readability in SQL and logs > microsecond
  purity; comparisons are lexicographic-safe in ISO-8601 UTC.
- **`via_ai` flag** (Phase 13's provenance): one byte of history honesty.
- **`audio_reference` is a pointer, not a promise:** the UI renders availability *at read time*
  (see below), so stale pointers are handled, not hidden.
- Enforced per-user favorite BLOB cap (default 200 MB) → error when exceeded (413-class message,
  "favorites storage limit reached — remove an older favorite").

### Repositories (the only SQL)

```text
generation.repo:
  insert(userId, gen)                         # called by tts.service when req.user present
  listByUser(userId, { limit: 1..50, cursor }) # cursor = (created_at, id) pair, encoded opaque
  getByIdForUser(userId, id)                   # NULL → 404 (not found *for this user*)
  deleteForUser(userId, id)                    # + cascade favorite row (Phase 16 join)
favorite.repo:  upsertForUser / removeForUser / listForUser (joins generation for display)
preference.repo: getForUser / upsertForUser
```

### History item assembly (the interesting part)

```text
GET /api/history → rows
  for each row, resolve audio status:
    audio_reference = temp id  → audioStore.has(id) ? "available" (url) : "expired"
    "persisted:<favId>"        → "persisted" (url from favorites BLOB endpoint)
    null                       → "expired" (anonymous-era generation or pointer lost)
  → items with audio.status (+ url when playable) — API.md §2.8 shape
```

So a history entry is *always* actionable: play (available/persisted) or regenerate (expired —
text + voice are stored, one click re-synthesizes through the normal pipeline).

### Write path (tts.service, when authed)

```text
POST /api/tts with valid token:
  …existing pipeline… → 201 as before
  + generation.repo.insert(req.user.id, { …, audio_reference: audioId, via_ai })
    (insert failure → logged, response still 201: history is a *side effect that must not
     break synthesis* — documented trade-off; the row is best-effort, the audio is the product)
```

### Migrations

- `drizzle-kit generate` from the Drizzle schema → versioned SQL migrations (committed).
- Apply at boot (prod) and in CI/tests (temp file DB): idempotent, ordered, logged.
- Dev resets (`rm -rf data/`) are cheap because the file DB is disposable; prod uses hosted
  Turso, so migrations are the only prod DB writes.

## Key concepts you should learn

- **SQLite/libSQL:** single-file WAL database; why it's production-grade (used by billions of
  devices); libSQL's extensions (replication, edge, remote URLs); BLOBs in SQLite (fine for
  small curated media).
- **Drizzle ORM:** schema-as-code → typed queries (`db.select().from(t).where(eq(...))`),
  migrations as generated SQL (auditable), the "ORM without the abstraction tax" position;
  contrast with Prisma (client engine, own schema language) and raw SQL (untyped).
- **Repository pattern:** one layer owns queries; services own rules; the *userId-first
  signature* as a scoping guarantee; why "the service must not write SQL" is a reviewable rule.
- **Cursor pagination:** why offsets are wrong (gaps/shifts under writes); (created_at, id)
  composite cursors; opaque encoding; limit bounds.
- **Temporal data design:** text-ISO choice, monotonic ordering, why `created_at DESC` index
  matches the list query exactly (index = query shape).
- **Reference vs value for media:** pointers + read-time availability resolution (honest UI)
  vs storing bytes always (cost) — and the curated-BLOB middle path.
- **Migration discipline:** generated SQL committed, applied at boot, tested against temp DBs;
  the "no manual DDL in prod" rule.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Turso (libSQL) | C4; file↔remote same driver; hosted, zero-ops | PostgreSQL (rejected), plain SQLite (works, but no hosted option → ops burden), MongoDB (document shape buys nothing here; C4-adjacent rejection) |
| Drizzle | Typed schema+queries; SQL migrations you can read; libSQL-first | Prisma (heavier client, own schema DSL), Kysely (good, less tooling), raw SQL (untyped drift) |
| Text-ISO timestamps | Readability + lexicographic ordering | Unix ms (purity vs pain) |
| Metadata + pointer, BLOB only for favorites | DB stays lean; persisted audio = curated | BLOB-on-generate (growth without curation), object storage (extra service for MB-scale data) |
| Best-effort history insert | Synthesis is the product; history must not 500 the generate | Transactional (couples failure domains) |

## What gets created

```text
apps/api/drizzle.config.ts; drizzle/ (migrations)
apps/api/src/db/{client.ts,schema.ts,migrate.ts}
apps/api/src/repositories/{generation,favorite,preference}.repo.ts (user repo completed)
apps/api/src/services/history.service.ts
apps/api/src/routes/history.ts (+controller)
apps/web/app/history/page.tsx + components/HistoryList/*
tests: repo scoping (user A never sees B's rows); cursor pagination (edges: empty, boundary,
       deleted-during-pagination); audio status resolution (available/expired/persisted);
       migrate on temp DB (up, idempotent re-run)
```

## Verification checklist

- [ ] Sign in → generate 3 times → `/history` lists them newest-first with correct voice/date
- [ ] Each entry: play if available; expired entry (force TTL) offers Regenerate → correct
      speech; delete removes row + (Phase 16) favorite; foreign id → 404 (two accounts, test)
- [ ] Pagination: 60 generations → 2 pages of 20 + nextCursor; no dupes/loss across pages
- [ ] Dev: file DB persists across process restarts (`data/` on disk); prod env
      (libsql://) boots against hosted Turso (migration applied, logged)
- [ ] Signed-out user: no history recorded (tts still works); `/api/history` without token → 401
- [ ] Scoping test: two users, interleaved generations, list/detail/delete for each — zero
      cross-reads (the matrix is a test, not a spot check)
- [ ] Migration: fresh DB → boot → all tables; re-boot → idempotent; down-level guard (older
      migration re-applied = no-op)

## Common pitfalls

- **SQL in services** ("one query, quick") → the userId-first repository signature dies; the
  scoping guarantee becomes a prayer.
- **Offset pagination** → rows shift under writes; cursors only.
- **Storing the audio blob on every generation** → unbounded growth; the pointer + curated
  BLOB design exists for this.
- **Trusting `audio_reference` forever** → it's a pointer; availability is resolved *at read
  time* (that's the `audio.status` field).
- **Manual DDL in prod** → migrations are code; hand-edited schemas are how prod silently
  drifts.
- **Letting history break generate** → best-effort insert (logged failure) is a *decided*
  trade-off; document it where you implement it.

## How it connects to the rest of the system

- Phase 16: favorites/preferences reuse `generation.repo` + add their repos; the audio BLOB
  copy happens on favorite (Phase 16's one write path into `favorites.audio_blob`).
- Phase 18: history inserts are trivially cheap; no new rate surface.
- Phase 21: `db` readiness check (ping) + `api_db_queries_total{repo, op}` metrics.
- Phase 24: history scenarios (play expired, cross-user 404, pagination) enter the final matrix.

## What to remember

1. Same driver, two URLs: `file:` dev, `libsql://` prod — the whole DB "deployment story" is an
   environment variable.
2. `userId` first, always: scoping is a signature, not a discipline.
3. Pointers for generated audio, curated BLOBs for favorites — the database is a librarian,
   not a warehouse.
4. History is best-effort; synthesis is non-negotiable. The product defines the priority.
5. If a query and its index don't have the same shape, you're paying a tax you didn't notice.
