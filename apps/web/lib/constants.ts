/**
 * lib/constants.ts — the web's single window onto shared business constants.
 *
 * Rule (frontend.md §1): no limit, schema, or error-code list is ever defined
 * inside apps/web — everything is re-exported from `@tts/validation`, the one
 * definition the API also enforces. Components import from here.
 */
export {
  MAX_TEXT_CHARS,
  MAX_UPLOAD_BYTES,
  countChars,
  countWords,
  validateText,
  overLimitMessage,
  ERROR_REGISTRY,
  AI_OPERATIONS,
} from "@tts/validation";
export type { ErrorCode } from "@tts/validation";
export type { AiOperation } from "@tts/types";
