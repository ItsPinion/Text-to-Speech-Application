/**
 * services/audio.ts — object-URL + download helpers (frontend.md §6).
 * Real code from day one: even the mock API produces real playable bytes.
 *
 * Discipline: every created object URL is revoked on replace and on unmount
 * (the workspace owns that lifecycle; this module owns the primitives).
 */

/** Wrap a blob into a playable/downloadable object URL. */
export function createObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/** Revoke an object URL. Safe to call with null/undefined (cleanup paths). */
export function revokeObjectUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

/** Download filename per FR-007: `speech-<audioId>.mp3`. */
export function audioFilename(audioId: string): string {
  return `speech-${audioId}.mp3`;
}
