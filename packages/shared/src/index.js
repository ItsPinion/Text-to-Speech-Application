/**
 * @tts/shared — the frozen Phase 0 contract for the Text-to-Speech platform.
 *
 * Single source of truth for numeric limits, defaults, and response envelopes.
 * Consumed by `@tts/server` (Node/Express) and `@tts/client` (Vite/React) so
 * frontend and backend can never invent different field names or limits.
 *
 * Anything exported here is contract: change it deliberately, never casually.
 */

/** Maximum characters accepted per POST /api/tts request. */
export const MAX_TEXT_LENGTH = 4000;

/** Default BCP-47 language when a request omits one. */
export const DEFAULT_LANGUAGE = 'en-US';

/** Audio MIME type returned by POST /api/tts (Phase 3+). */
export const AUDIO_FORMAT = 'audio/mpeg';

/** File extension used when serving or downloading audio. */
export const AUDIO_FILE_EXTENSION = 'mp3';

/** Rate limit applied to POST /api/tts — enforced in Phase 6. */
export const RATE_LIMIT = Object.freeze({
  /** Sliding window in milliseconds. */
  windowMs: 15 * 60 * 1000,
  /** Max TTS requests per IP per window. */
  max: 10,
});

/** Seed language allow-list for Phase 2 validation (validated voices arrive Phase 3). */
export const SUPPORTED_LANGUAGES = Object.freeze([
  'en-US',
  'en-GB',
  'hi-IN',
  'es-ES',
  'fr-FR',
  'de-DE',
]);

/**
 * Standard error envelope used by every non-2xx JSON response:
 * `{ "success": false, "error": string }`
 *
 * @param {string} error
 * @returns {{ success: false, error: string }}
 */
export function apiError(error) {
  return { success: false, error };
}

/**
 * Standard success envelope: `{ "success": true, ...payload }`.
 *
 * @param {Record<string, unknown>} [payload]
 * @returns {{ success: true } & Record<string, unknown>}
 */
export function apiSuccess(payload = {}) {
  return { success: true, ...payload };
}

/**
 * A voice in the catalog served by GET /api/voices (Phase 3).
 *
 * @typedef {Object} Voice
 * @property {string} id      Stable id used in POST /api/tts `voice` field.
 * @property {string} name    Human-readable display name.
 * @property {string} language BCP-47 tag, e.g. "en-US".
 * @property {'male'|'female'|'neutral'} gender
 */

/**
 * Body accepted by POST /api/tts.
 *
 * @typedef {Object} TtsRequestBody
 * @property {string} text      1..MAX_TEXT_LENGTH characters after trim.
 * @property {string} [language] BCP-47 tag; defaults to DEFAULT_LANGUAGE.
 * @property {string} [voice]    Must exist in the catalog (checked from Phase 3).
 */
