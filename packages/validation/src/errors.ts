/**
 * The error-code registry — the single source of truth for the API's error
 * contract (docs/requirements.md §6, docs/api/API.md §3).
 *
 * The Express error handler maps errors → HTTP via this registry (Phase 7),
 * and the web client maps code → user-facing copy from this same table
 * (Phase 10). Neither side may define codes on its own.
 */

export interface ErrorSpec {
  code: string;
  status: number;
  /** User-safe message. Internals (stacks, provider errors) go to logs only. */
  message: string;
}

export const ERROR_REGISTRY = {
  BAD_REQUEST: {
    code: "BAD_REQUEST",
    status: 400,
    message: "Invalid request.",
  },
  INVALID_TEXT: {
    code: "INVALID_TEXT",
    status: 400,
    message: "Enter some text to continue.",
  },
  TEXT_TOO_LONG: {
    code: "TEXT_TOO_LONG",
    status: 400,
    message: "Text is over the 5,000 character limit.",
  },
  INVALID_VOICE: {
    code: "INVALID_VOICE",
    status: 400,
    message: "That voice is not available.",
  },
  INVALID_LANGUAGE: {
    code: "INVALID_LANGUAGE",
    status: 400,
    message: "That language is not supported.",
  },
  INVALID_OPERATION: {
    code: "INVALID_OPERATION",
    status: 400,
    message: "Unknown enhancement operation.",
  },
  FILE_INVALID: {
    code: "FILE_INVALID",
    status: 400,
    message: "Unsupported or unreadable file.",
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    status: 401,
    message: "Please sign in to continue.",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: 403,
    message: "You are not allowed to do that.",
  },
  NOT_FOUND: {
    code: "NOT_FOUND",
    status: 404,
    message: "Not found.",
  },
  AUDIO_EXPIRED: {
    code: "AUDIO_EXPIRED",
    status: 404,
    message: "This audio has expired. Generate it again.",
  },
  FILE_TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    status: 413,
    message: "File is over the 10 MB limit.",
  },
  PAYLOAD_TOO_LARGE: {
    code: "PAYLOAD_TOO_LARGE",
    status: 413,
    message: "Request body is too large.",
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    status: 429,
    message: "Too many requests. Please slow down.",
  },
  TTS_UNAVAILABLE: {
    code: "TTS_UNAVAILABLE",
    status: 503,
    message: "Speech service is temporarily unavailable. Try again.",
  },
  AI_NOT_CONFIGURED: {
    code: "AI_NOT_CONFIGURED",
    status: 503,
    message: "AI enhancement is not configured on this server.",
  },
  AI_UNAVAILABLE: {
    code: "AI_UNAVAILABLE",
    status: 503,
    message: "AI service hiccup. Try again in a moment.",
  },
  INTERNAL: {
    code: "INTERNAL",
    status: 500,
    message: "Something went wrong on our side. Please try again.",
  },
} as const satisfies Record<string, ErrorSpec>;

export type ErrorCode = keyof typeof ERROR_REGISTRY;
