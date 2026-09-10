/**
 * Phase 2 — validation for POST /api/tts.
 * Pure function (no Express) so it is trivially unit-testable.
 *
 * Order matters and mirrors the plan's tests:
 *   text → language → voice presence → voice known → voice/language match
 *
 * Returns { value: { text, language, voice } } or { error: string }.
 */
const { MAX_TEXT_LENGTH, DEFAULT_LANGUAGE } = require('../constants');
const { getVoiceById, getLanguages } = require('../data/voices');

// The voice catalog defines which languages exist.
const ALLOWED_LANGUAGES = new Set(getLanguages());

function validateTtsRequest(body) {
  const b =
    body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  // --- text ---
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text) return { error: 'Text is required' };
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      error: `Text exceeds the maximum length of ${MAX_TEXT_LENGTH} characters`,
    };
  }

  // --- language (defaults to en-US per frozen contract) ---
  const language =
    typeof b.language === 'string' && b.language.trim()
      ? b.language.trim()
      : DEFAULT_LANGUAGE;
  if (!ALLOWED_LANGUAGES.has(language)) {
    return { error: `Unsupported language: ${language}` };
  }

  // --- voice ---
  const voice = typeof b.voice === 'string' ? b.voice.trim() : '';
  if (!voice) return { error: 'Voice is required' };
  const voiceEntry = getVoiceById(voice);
  if (!voiceEntry) return { error: `Unknown voice: ${voice}` };
  if (voiceEntry.language !== language) {
    return {
      error: `Voice "${voice}" does not support language "${language}"`,
    };
  }

  return { value: { text, language, voice } };
}

module.exports = { validateTtsRequest, ALLOWED_LANGUAGES };
