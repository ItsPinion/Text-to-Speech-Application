/**
 * Type declarations for the frozen Phase 0 contract.
 * Hand-maintained to mirror ./index.js (the server stays plain JS;
 * the client is TypeScript, so it consumes these types).
 */

/** Maximum characters accepted per POST /api/tts request. */
export declare const MAX_TEXT_LENGTH = 4000;

/** Default BCP-47 language when a request omits one. */
export declare const DEFAULT_LANGUAGE = "en-US";

/** Audio MIME type returned by POST /api/tts (Phase 3+). */
export declare const AUDIO_FORMAT = "audio/mpeg";

/** File extension used when serving or downloading audio. */
export declare const AUDIO_FILE_EXTENSION = "mp3";

export interface RateLimitOptions {
  /** Sliding window in milliseconds. */
  windowMs: number;
  /** Max TTS requests per IP per window. */
  max: number;
}

/** Rate limit applied to POST /api/tts — enforced in Phase 6. */
export declare const RATE_LIMIT: Readonly<RateLimitOptions>;

/** Seed language allow-list for Phase 2 validation. */
export declare const SUPPORTED_LANGUAGES: readonly string[];

/** Standard error envelope used by every non-2xx JSON response. */
export declare function apiError(error: string): { success: false; error: string };

/** Standard success envelope. */
export declare function apiSuccess<T extends object>(
  payload?: T,
): { success: true } & T;

export type Gender = "male" | "female" | "neutral";

/** A voice in the catalog served by GET /api/voices (Phase 3). */
export interface Voice {
  /** Stable id used in POST /api/tts `voice` field. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** BCP-47 tag, e.g. "en-US". */
  language: string;
  gender: Gender;
}

/** Body accepted by POST /api/tts. */
export interface TtsRequestBody {
  /** 1..MAX_TEXT_LENGTH characters after trim. */
  text: string;
  /** BCP-47 tag; defaults to DEFAULT_LANGUAGE. */
  language?: string;
  /** Must exist in the voice catalog (checked from Phase 3). */
  voice?: string;
}
