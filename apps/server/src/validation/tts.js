import { DEFAULT_LANGUAGE, MAX_TEXT_LENGTH, SUPPORTED_LANGUAGES } from '@tts/shared';

/**
 * Phase 2 validation for POST /api/tts — pure, Express-free, so it is
 * trivially unit-testable and the rules read as a single source of truth.
 *
 * Flow (plan §Phase 2):
 *   body is an object → text present → text is a string → non-empty after
 *   trim → length ≤ MAX_TEXT_LENGTH → language in allow-list (defaults to
 *   DEFAULT_LANGUAGE) → voice present.
 *
 * Returns:
 *   { ok: true,  value: { text, language, voice } }  — normalized fields
 *   { ok: false, error }                             — human-readable message
 *
 * Deliberately NOT checked here (arrives in Phase 3 with the voice catalog):
 *   unknown voice ids, voice/language mismatch.
 *
 * @param {unknown} body
 * @returns {{ ok: false, error: string } | { ok: true, value: { text: string, language: string, voice: string } }}
 */
export function validateTtsRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' };
  }

  const { text, language, voice } = body;

  // ── text: required, string, non-empty after trim, ≤ MAX_TEXT_LENGTH ──
  if (text === undefined || text === null) {
    return { ok: false, error: 'Text is required' };
  }
  if (typeof text !== 'string') {
    return { ok: false, error: 'Text must be a string' };
  }
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return { ok: false, error: 'Text is required' };
  }
  if (trimmedText.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `Text must be ${MAX_TEXT_LENGTH} characters or fewer` };
  }

  // ── language: optional → defaults to DEFAULT_LANGUAGE; else allow-list ──
  const resolvedLanguage = language ?? DEFAULT_LANGUAGE;
  if (
    typeof resolvedLanguage !== 'string' ||
    !SUPPORTED_LANGUAGES.includes(resolvedLanguage)
  ) {
    return { ok: false, error: 'Unsupported language' };
  }

  // ── voice: required (catalog existence is a Phase 3 concern) ──
  if (typeof voice !== 'string' || voice.trim().length === 0) {
    return { ok: false, error: 'Voice is required' };
  }

  return {
    ok: true,
    value: { text: trimmedText, language: resolvedLanguage, voice: voice.trim() },
  };
}
