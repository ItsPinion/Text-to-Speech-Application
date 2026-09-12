/**
 * @tts/validation — shared limits and zod schemas.
 *
 * The client pre-validates with these schemas for instant UX (Phase 4) and
 * the server enforces them as authority (Phase 7). One definition, two
 * runtimes, zero drift (FR-009, SR-02).
 */
import { z } from "zod";

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

const textField = z
  .string({ required_error: "Enter some text." })
  .trim()
  .min(1, { message: "Enter some text." })
  .refine((s) => s.trim().length > 0, { message: "Enter some text." })
  .refine((s) => countChars(s) <= MAX_TEXT_CHARS, {
    message: `Text is over the ${MAX_TEXT_CHARS.toLocaleString()} character limit.`,
  });

export const ttsRequestSchema = z.object({
  text: textField,
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
  text: textField,
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
