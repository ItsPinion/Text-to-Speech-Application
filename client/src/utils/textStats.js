/**
 * Client-side mirrors of the server's frozen limits (docs/API.md).
 * The server re-validates everything — this is UX, not security.
 */
export const MAX_TEXT_LENGTH = 4000;

export function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Hard-clamp input to the contract max (covers paste events in any browser). */
export function clampToMax(text) {
  return text.slice(0, MAX_TEXT_LENGTH);
}
