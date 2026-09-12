# Phase 11 — Audio Player & Download

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 10 · **Unlocks:** M2 milestone (core product complete)

## What this phase is

The complete audio experience on top of the real pipeline (FR-006/FR-007, spec §4.5/§4.6):

- **Custom player** over the native `<audio>` element: play/pause, seek (drag + keyboard),
  volume (slider + mute), live progress, current/total time.
- **Download** of the generated MP3 with a stable filename (`speech-<audioId>.mp3`).
- **Lifecycle behaviors:** replacing audio, expired-audio handling, page-unmount cleanup,
  autoplay policy compliance.
- **The spec's format honesty rule:** the player/download commit to the *returned* `format`
  (MP3); no WAV/OGG promises (tts.md §6).

With this phase, the original spec's core user flow is complete:

```text
Enter text → choose language → choose voice → Generate → Play → Download
```

## Why we build it this way

- **Custom UI on the native element** (rather than native `controls` or a library player): the
  spec asks for design control over play/pause/seek/volume with our visual language; the native
  `<audio>` element already provides *all* the difficult parts (decoding, buffering, time
  model, keyboard on some controls). Libraries (howler.js etc.) add a dependency for volume/
  playback-rate we don't need. So: one `<audio>` element (hidden, no controls attribute), a set
  of buttons/sliders bound to its state via `timeupdate`/`play`/`pause`/`ended` events.
- **The player is a *view* of `ttsState` (Phase 10), not its owner.** The machine already knows
  `{ status, audioId, audioUrl, blobUrl }`. The player renders it and emits user intents
  (`play/pause/seek/volume`) that translate to element calls. When `ttsState` changes (new
  generation, expired audio), the player's element is re-pointed *and reset* by the machine's
  transition — the player never "remembers" stale audio.
- **Download from the in-memory blob**, not from re-fetching: the bytes are already downloaded
  (the player has them). Download = `URL.createObjectURL(blob)` + `<a download>` click. No
  second network round-trip, works when the temp store has since expired (the *downloaded* file
  outlives the server's TTL — a deliberate, documented property).
- **Autoplay policy:** browsers block programmatic autoplay after user gesture absence. We
  don't autoplay: generation completes → player shows "ready" → user presses play. (A
  "auto-start after generate" preference is a v2 option, gesture-legal because Generate *was*
  a gesture — but v1 stays simple and predictable.)

## How it works (internals)

```text
AudioPlayer
  <audio ref>  (no controls; src = blobUrl when ready)
  state (derived from element events): { playing, currentTime, duration, volume, muted, buffered? }
  events:
    onLoadedMetadata → set duration (MP3: reliable once blob fully loaded — we always have the
                       full blob, so duration is exact immediately)
    onTimeupdate     → set currentTime (throttled by the browser, ~4 Hz; smooth seek bar via rAF)
    onPlay/onPause   → set playing
    onEnded          → reset to 0 (play head rewinds, ready for replay)
    onError          → surface "couldn't decode audio" (rare: corrupt temp store)
  controls:
    play/pause  → el.play()/el.pause()  (play() returns a promise — handle autoplay rejection)
    seek        → range input: onInput (scrub preview, el.currentTime updates live since we
                  have full blob = no network seek), keyboard: ←/→ 5 s, Home/End
    volume      → range 0..1 → el.volume; mute toggle → el.muted (volume state preserved)
    time labels → mm:ss from currentTime/duration
    a11y        → each control is a labeled button/slider; seek slider: aria-valuetext "1:05 of 2:30"

DownloadButton
  enabled when ttsState.status === "ready"
  click → objectURL(blob) → a[download=`speech-${audioId}.mp3`].click() → revoke
  (filename from the API's audioId — stable, unique, traceable to a generation)
```

Lifecycle rules:

- **New generation while old audio plays:** machine transition revokes old blobUrl; element
  pauses, resets, re-points; no ghost playback.
- **Expired audio (`AUDIO_EXPIRED` on replay of a history item, Phase 15+):** player shows
  expired state + "Regenerate" (reuses stored text/voice via the normal pipeline).
- **Unmount:** pause + revoke.
- **Tab hidden:** playback continues (audio is the product; no auto-pause).

## Key concepts you should learn

- The **HTMLMediaElement API**: `play()/pause()` promises, `currentTime`/`duration`/`volume`/
  `muted`, the event model (`loadedmetadata`, `timeupdate`, `play`, `pause`, `ended`, `error`),
  and what "seeking" means when the whole resource is in memory vs network-streamed (we are
  in-memory: seeks are instant, no Range requests — the Phase 9 simplification paying off).
- **Object URLs**: create/use/revoke discipline; why downloads from a blob beat re-fetching;
  memory accounting (blobs are large-ish; one at a time by design).
- **Autoplay policy**: gesture requirements, why we show "ready" instead of autoplaying.
- Custom player accessibility: range inputs, `aria-valuetext`, focus order, keyboard seeking.
- Media timing: `timeupdate` is coarse (~250 ms) — smooth UIs interpolate with `requestAnimationFrame`
  while the media clock is truth.
- Error semantics of `el.play()` rejection (NotAllowedError) — handle, don't crash.

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Native `<audio>` + custom controls | Full design control, zero deps, exact duration (full blob) | Native controls (no design control), howler/audio.js (dependency for features we don't need) |
| Download from in-memory blob | No re-fetch; works after server TTL; one code path | Re-fetch `audioUrl` (extra round-trip, can 404), server-side download endpoint (unneeded) |
| `speech-<audioId>.mp3` naming | Unique, sortable, traceable to the generation record | Timestamp names (collisions, untraceable) |
| No Range requests (full-blob fetch) | Files are small (< ~1 MB typical); simplicity | Range support (complexity for no UX gain at this size — documented, revisit if formats grow) |

## What gets created

```text
apps/web/components/AudioPlayer/*   (custom player: PlayPause, SeekBar, Volume, TimeLabel)
apps/web/components/DownloadButton/*(blob download)
apps/web/services/audio.ts          (final: objectURL lifecycle helpers)
tests (Phase 19 seed): player event handling with a mocked media element; download anchor attrs;
                       expired-audio state; revoke-on-replace
```

## Verification checklist (M2 — the core product)

- [ ] Generate (real engine) → player ready → play → audible, correct voice/language (spot-check
      en-US, hi-IN, gu-IN, de-DE)
- [ ] Pause/resume mid-utterance; seek by drag and by keyboard (±5 s); time labels update;
      end-of-play rewinds to 0
- [ ] Volume slider + mute work and persist across regenerations within the session
- [ ] Download → file `speech-<id>.mp3` saved, plays in an external player, audible content
      matches the voice chosen
- [ ] New generation while playing → old audio stops cleanly (no overlap), new plays on demand
- [ ] Expired-audio path (force with short TTL) → "expired" + working Regenerate
- [ ] Unmount (navigate away in v2 routes) → no audio continues, no console errors
- [ ] Screen-reader pass: all controls named; seek slider announces position ("1:05 of 2:30")
- [ ] Mobile layout: player usable at 360 px width (touch targets ≥ 44 px)
- [ ] Memory: single blob at rest (devtools), revoked on replace

## Common pitfalls

- **Seeking before metadata** (setting `currentTime` at 0s) → queue seeks until
  `loadedmetadata`; with full blobs this is near-instant but the ordering still matters.
- **Not revoking the *download* object URL** (separate from the player's) → small leak per
  download; revoke after click completes.
- **`timeupdate` jitter driving the seek bar** → rAF interpolation; the slider's *input* (user)
  must never fight the event (distinguish user-drag vs programmatic update).
- **Assuming autoplay will work** → it won't without a gesture chain; v1 explicitly doesn't.
- **Player owning its own audio source** (ignoring `ttsState.blobUrl`) → stale audio on
  replace; the machine re-points the element.

## How it connects to the rest of the system

- Phase 15: history items re-enter this exact player (`audio.status: available → blob → play`;
  `expired → regenerate`; `persisted → served from the favorite BLOB`).
- Phase 12: AI-enhanced text generates through this same player (no changes — proof the
  separation held).
- Phase 21: player is the surface for "TTS latency" UX (time-to-audio shown subtly in logs,
  not UI noise).

## What to remember

1. The native element is the engine; our controls are its face. Don't reimplement media.
2. The machine owns the source; the player renders it and emits intents.
3. Full-blob playback = exact duration, instant seeks, downloads that outlive the server TTL.
4. Revoke every object URL you create — player's and download's alike.
5. M2 definition: a stranger can type text, pick a voice, hear it, and save the file — with
   zero console errors.
