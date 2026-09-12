# Phase 16 — Favorites & Voice Preferences

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 15 · **Unlocks:** M4 milestone (personalization complete)

## What this phase is

The personalization layer on top of history (FR-023/FR-024, spec §16):

- **Favorites:** star/unstar a generation; favorites list; the act of favoriting **persists the
  MP3** (BLOB copy) so favorites outlive the 30-min temp TTL; deleting a generation deletes its
  favorite (single source of truth: the generation).
- **Voice preferences:** per-user default language + default voice; recent-voices list;
  preference drives the *reset semantics* the Phase 5 hook already consulted ("default provider"
  function — now it's the user's data).
- **UI:** star toggle on history items + on the current player card; `/favorites` page;
  defaults applied on load (voice/language selectors preselect the user's preference).
- **Isolation (spec: "keep isolated from the core TTS service"):** preferences are *read* by
  the UI pre-selection and *written* on explicit user action (and silently on generation —
  "recent voices"). The TTS pipeline itself is untouched by any of this.

## Why we build it this way

- **Favoriting = persistence, by construction.** The temp store is intentionally ephemeral
  (Phase 9). The only clean way to make "the audio I loved survives" true is to *copy* the bytes
  at the moment of favoriting (they're available then, with very high probability). If the audio
  has *already* expired by the time the user stars (possible via history), the favorite is
  created **without** audio and the UI says "audio expired — regenerate to keep it" (the text is
  stored, so this is always recoverable). This is honest behavior, not data loss.
- **Generation is the source of truth; favorite is a relation.** A favorite row points at a
  generation (`generation_id` unique per user). Deleting a generation cascades its favorite.
  The alternative (favorite owns a copy of the text) forks the data and diverges — rejected.
- **Preferences are read-mostly, written on edges:** read on app load (preselect), written on
  explicit "set as default" or implicitly as "recent voice" on generation. They never *filter*
  or *gate* anything — a bad stored preference (voice removed from catalog) is a *selection
  fallback*, not an error: Phase 5's validity check already handles "selected voice no longer
  exists" → reset to default. One existing mechanism absorbs preference staleness for free.
- **Isolation from the TTS service** is deliberate: personalization bugs must never break
  synthesis. The dependency arrow is UI → preferences (preselect) and history-write → repos;
  nothing in `tts.service` reads preferences (it accepts `voice` as input, as always).

## How it works (internals)

### API

```text
POST /api/favorites { generationId }
  authed → generation exists for user? (404 if not)
  already favorited? → idempotent 201 (same favorite, no-op) — documented, tested
  audio = audioStore.get(gen.audio_reference)   (if temp id)
        ?? persisted lookup                     (if already persisted)
        ?? null                                 (expired)
  enforce per-user BLOB cap (200 MB) when audio present → over: 413-class error
  insert { user, generationId, audio_blob?, content_type? }
  201 favorite { generationId, createdAt, audio: { status, url? } }

GET /api/favorites
  join generation → item shape (history item + audio resolved:
    BLOB present → served via GET /api/favorites/:generationId/audio (200 MP3)
    BLOB absent  → status "expired" → UI: regenerate)

DELETE /api/favorites/:generationId → 200 (idempotent)
DELETE /api/history/:id  (Phase 15 endpoint, extended) → deletes generation + favorite row
    (BLOB bytes freed — SQLite VACUUM is not run on demand; space reclaims on page reuse)

GET /api/preferences
  { preferences: { language, voice } | null, recentVoices: string[] }
PUT /api/preferences { language, voice }
  validate voice ∈ catalog ∧ voice.language === language → 400 INVALID_VOICE/INVALID_LANGUAGE
  upsert
recentVoices: side-write on every authenticated generation (INSERT OR IGNORE + reorder,
  cap 8) — "recent" is a usage signal, not a user edit
```

### UI

```text
load (authed):
  GET /preferences → preselect language/voice in the selectors (Phase 5's default-provider fn
  now returns the stored preference, falling back to catalog default)
  star state: favorites list (ids set) merged into history rows + player card
apply-on-star (player card):
  current audioId → POST /favorites { generationId }  (generationId from the 201 response —
  the UI already holds it from Phase 10; anonymous users: "Sign in to save favorites" — the
  core still works, FR-025)
/favorites page:
  list (like history) with persistent play (BLOB) + delete + "regenerate" for expired-audio
set-defaults:
  explicit control on the selector row ("Save as default") + implicit recent-voice tracking
```

## Key concepts you should learn

- **Relations vs copies:** favorite = edge in the graph, not a vertex with duplicated data;
  cascade rules keep one source of truth.
- **Idempotent mutations:** re-POST favorite = success no-op; DELETE = success; the client can
  retry star-toggles without "already exists" error states (API.md decision).
- **Read-time availability resolution again** (Phase 15 pattern): favorite audio is *checked*,
  never assumed — BLOB presence is the truth.
- **Storage curation as policy:** the BLOB cap (per user, enforced on write) is how "user
  choices grow storage" stays bounded; the error message is an instruction ("remove an older
  favorite"), not a failure.
- **Preference staleness absorption:** when a stored default no longer exists in the catalog,
  the *existing* Phase 5 reset path handles it — no special preference-invalid state. (Design
  win: mechanisms composed, not multiplied.)
- **Implicit vs explicit writes:** recent-voices (implicit, capped, usage signal) vs default
  (explicit, user-decided) — two different semantics, two different fields, one small table.
- **Auth-gated affordances without auth-gated product:** stars are visible; signed-out users see
  a "sign in to save" state on the star. The product never locks, personalization invites.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Favorite = relation + optional BLOB | Single source of truth (generation); persistence at the moment of curation | Favorite copies text (forks), favorite re-synthesizes on demand (cost + voice drift) |
| Idempotent POST favorite | Retry-safe UI; star toggles without error choreography | 409-on-duplicate (client must branch) |
| BLOB served by a dedicated endpoint | Keeps `GET /api/audio/:id` purely temp-store (its contract stays simple) | Overloading the temp endpoint with BLOB fallback (two lifetimes, one URL — confusing) |
| Recent-voices as usage-derived list | "Recently used" (spec) is a signal, not a setting | Merging into preferences (muddies explicit vs implicit) |
| Per-user BLOB cap enforced at write | Predictable storage; actionable error | Unbounded (user-driven growth surprise) |

## What gets created

```text
apps/api/src/{repositories/favorite.repo.ts (complete), repositories/preference.repo.ts,
              services/favorites.service.ts, services/preferences.service.ts,
              routes/{favorites,preferences}.ts + controllers}
history: DELETE cascade + generation.repo.favorite-join helpers
apps/web: components/{FavoriteStar,PreferencesControls}/*, app/favorites/page.tsx,
          hooks/{useFavorites,usePreferences}.ts, selector preselect wiring (Phase 5 hook update)
tests: idempotent favorite; star-after-expiry (no BLOB, "regenerate to keep"); cascade delete;
       BLOB cap (fixture-sized blobs); preference staleness (removed voice → fallback);
       recent-voices ordering/cap; scoping matrix (two users, cross-star/cross-prefs → 404/403-free)
```

## Verification checklist (M4)

- [ ] Star a fresh generation → audio persists: wait out TTL (or force) → favorite still plays
- [ ] Star an *expired* history entry → favorite created without audio → UI "regenerate to keep
      it" → regenerate + re-star → BLOB present
- [ ] Re-star (double click) → one row, no error; unstar → row gone, BLOB freed
- [ ] Delete generation (history) → favorite row + BLOB gone; delete favorite keeps generation
- [ ] Two users: star the same generation id (impossible — generations are per user) and
      foreign ids → 404s; preferences invisible to each other
- [ ] PUT preferences with cross-language voice → 400; valid → applied; reload → selectors
      preselect; stored voice later removed from catalog → load falls back gracefully (no error
      state)
- [ ] Recent voices: generate with 3 voices → order correct, cap 8 respected after 9 distinct
- [ ] BLOB cap: favorite until 200 MB (fixture-accelerated) → 413-class message, actionable
- [ ] `/favorites` plays BLOB audio at full volume/seek (the Phase 11 player, unchanged)

## Common pitfalls

- **Favorite owning text** → the moment a favorite duplicates the generation's text, edits/
  deletes diverge; keep the relation.
- **Forgetting the expired-star case** → "I starred it, where's my audio?" is the trust-killer;
  the honest "expired — regenerate to keep" path *is* the feature.
- **Making TTS read preferences** → the isolation rule exists; synthesis takes `voice` as input,
  always.
- **Unbounded BLOBs** → the cap is policy; "users can keep everything" is how DBs grow up.
- **Offset-paginating favorites** (again) → cursors, Phase 15 rules.

## How it connects to the rest of the system

- Phase 5/10 hooks: preference preselect is the *only* change (the default-provider function
  already existed as a seam — the seam's dividend).
- Phase 18: favorites/preference endpoints inherit the general limiter; no special limits
  (low-cost, authed, idempotent).
- Phase 21: `favorites_bytes_per_user` gauge (the cap's headroom becomes visible).
- Phase 24: M4 scenarios (persisted play, expired-star, staleness fallback) join the matrix.

## What to remember

1. Favorite = relation to the generation + a copy of the bytes *at the moment of curation*.
2. Idempotent writes make star UIs painless; retries are features.
3. Staleness (dead voices, dead audio) is absorbed by *existing* reset/availability machinery —
   don't build new states for old problems.
4. Curation implies capping: bounded storage, actionable messages.
5. Personalization reads at the edges (preselect, star states) and never enters the synthesis
   pipeline.
