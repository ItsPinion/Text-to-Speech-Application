import { MAX_TEXT_LENGTH, ALLOWED_LANGUAGES } from './constants.js';
import { VOICES } from './voiceCatalog.js';

/**
 * Pure validation for POST /api/tts payloads (Phase 2 + Phase 3).
 *
 * Deliberately side-effect free and framework-free so it can be reasoned
 * about (and unit-tested) without HTTP. The route maps the result to a
 * 400 response or continues to synthesis.
 *
 * Phase 3 additions: the voice must exist in the catalog AND speak the
 * requested language (plan tests 3.3 and 3.4).
 *
 * @param {unknown} body - the parsed JSON request body
 * @returns {{ valid: true, value: { text: string, language: string, voice: string } }
 *          | { valid: false, error: string }}
 */

const voiceById = new Map(VOICES.map((v) => [v.id, v]));

export function validateTtsPayload(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const { text, language, voice } = body;

  // 1. text — required, non-empty after trim, capped at MAX_TEXT_LENGTH
  if (typeof text !== 'string') {
    return { valid: false, error: 'Text is required' };
  }
  if (text.trim().length === 0) {
    return { valid: false, error: 'Text cannot be empty' };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Text is ${text.length.toLocaleString('en-US')} characters — the maximum is ${MAX_TEXT_LENGTH.toLocaleString('en-US')}`,
    };
  }

  // 2. language — required, must be in the allow-list
  if (typeof language !== 'string' || language.trim().length === 0) {
    return { valid: false, error: 'Language is required' };
  }
  if (!ALLOWED_LANGUAGES.includes(language)) {
    return {
      valid: false,
      error: `Unsupported language: ${language}. Allowed: ${ALLOWED_LANGUAGES.join(', ')}`,
    };
  }

  // 3. voice — required, must exist in the catalog, must match the language
  if (typeof voice !== 'string' || voice.trim().length === 0) {
    return { valid: false, error: 'Voice is required' };
  }
  const catalogVoice = voiceById.get(voice.trim());
  if (!catalogVoice) {
    return {
      valid: false,
      error: `Unknown voice: ${voice.trim()}. See GET /api/voices for the catalog`,
    };
  }
  if (catalogVoice.language !== language) {
    return {
      valid: false,
      error: `Voice ${catalogVoice.id} speaks ${catalogVoice.language}, not ${language}`,
    };
  }

  return {
    valid: true,
    value: { text: text.trim(), language, voice: catalogVoice.id },
  };
}
