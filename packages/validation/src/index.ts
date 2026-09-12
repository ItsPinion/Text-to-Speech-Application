/**
 * @tts/validation — shared limits and zod schemas.
 *
 * The client pre-validates with these schemas for instant UX (Phase 4) and
 * the server enforces them as authority (Phase 7). One definition, two
 * runtimes, zero drift (FR-009, SR-02).
 */
import { z } from "zod";
import { ERROR_REGISTRY } from "./errors.js";

export { ERROR_REGISTRY } from "./errors.js";
export type { ErrorSpec, ErrorCode } from "./errors.js";

// ── Limits (the numbers are policy — see docs/requirements.md) ──────────────

/** Max text length in CODE POINTS (emoji-safe) — FR-002/FR-009. */
export const MAX_TEXT_CHARS = 5000;

/** Max upload size (bytes) — FR-026. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// ── Counting (shared so client and server count identically) ────────────────

/** Code-point count: users think in glyphs, not UTF-16 units. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

/** Copy for empty/whitespace-only text — same tone everywhere (client + server). */
const EMPTY_TEXT_MESSAGE = ERROR_REGISTRY.INVALID_TEXT.message;

/**
 * Precise over-limit copy: an instruction, not a diagnostic (Phase 4) —
 * "Text is 123 characters over the 5,000 limit." tells the user exactly
 * how much to cut. Singular-aware.
 */
export function overLimitMessage(chars: number): string {
  const over = chars - MAX_TEXT_CHARS;
  return `Text is ${over.toLocaleString()} ${over === 1 ? "character" : "characters"} over the ${MAX_TEXT_CHARS.toLocaleString()} limit.`;
}

/**
 * The text field contract: trimmed, non-empty, ≤ MAX_TEXT_CHARS CODE POINTS.
 * `textSchema` is the ONE definition — the client runs it for instant UX,
 * the server as authority (Phase 7). Never copy these rules elsewhere.
 */
export const textSchema = z
  .string({
    required_error: EMPTY_TEXT_MESSAGE,
    invalid_type_error: EMPTY_TEXT_MESSAGE,
  })
  .trim()
  .min(1, EMPTY_TEXT_MESSAGE)
  .superRefine((value, ctx) => {
    const chars = countChars(value);
    if (chars > MAX_TEXT_CHARS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: overLimitMessage(chars) });
    }
  });

export type TextInput = z.infer<typeof textSchema>;

/**
 * Field-level validation result for the text editor (Phase 4): the mapped
 * { code, message } the UI renders. Runs the SAME rules as textSchema —
 * codes come from the shared registry, so client UX and server contract
 * cannot drift. Empty is a valid "state" here (the UI decides when an
 * empty field becomes an error — on submit attempt / after blur).
 */
export type TextValidation =
  | { ok: true }
  | { ok: false; code: "INVALID_TEXT" | "TEXT_TOO_LONG"; message: string };

export function validateText(value: string): TextValidation {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "INVALID_TEXT", message: EMPTY_TEXT_MESSAGE };
  }
  const chars = countChars(trimmed);
  if (chars > MAX_TEXT_CHARS) {
    return { ok: false, code: "TEXT_TOO_LONG", message: overLimitMessage(chars) };
  }
  return { ok: true };
}

export const ttsRequestSchema = z.object({
  text: textSchema,
  voice: z.string().trim().min(1, { message: "Pick a voice." }).max(100),
});

export type TtsRequestInput = z.infer<typeof ttsRequestSchema>;

export const AI_OPERATIONS = [
  "correctGrammar",
  "summarize",
  "rewrite",
  "makeConversational",
  "simplify",
] as const;

export const aiEnhanceRequestSchema = z.object({
  text: textSchema,
  operation: z.enum(AI_OPERATIONS),
});

export type AiEnhanceRequestInput = z.infer<typeof aiEnhanceRequestSchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

export type ListQueryInput = z.infer<typeof listQuerySchema>;

export const preferencesSchema = z.object({
  language: z.string().trim().min(2).max(10),
  voice: z.string().trim().min(2).max(100),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;
