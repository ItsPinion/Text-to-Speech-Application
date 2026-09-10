/**
 * Locked decisions from docs/API.md — single source of truth for limits.
 * These values are frozen by the Phase 0 contract.
 */
module.exports = {
  /** Hard cap on input text (chars). */
  MAX_TEXT_LENGTH: 4000,
  /** Used when a request omits `language`. */
  DEFAULT_LANGUAGE: 'en-US',
  /** The only audio format we emit (locked). */
  AUDIO_MIME: 'audio/mpeg',
  /** Enforced in Phase 6 — documented now so clients can plan. */
  RATE_LIMIT: { windowMs: 15 * 60 * 1000, max: 10 },
};
