import { SUPPORTED_LANGUAGES } from '@tts/shared';

/**
 * Static voice catalog — plan Phase 3: "GET /api/voices returns a static
 * list (en-US male/female, hi-IN, etc.)". Covers every language in the
 * frozen allow-list. Phase 5 can swap this for vendor-driven data without
 * changing the response shape: { id, name, language, gender }.
 */
export const VOICES = Object.freeze([
  { id: 'en-US-female-1', name: 'Aria', language: 'en-US', gender: 'female' },
  { id: 'en-US-male-1', name: 'Marcus', language: 'en-US', gender: 'male' },
  { id: 'en-GB-female-1', name: 'Iris', language: 'en-GB', gender: 'female' },
  { id: 'hi-IN-female-1', name: 'Priya', language: 'hi-IN', gender: 'female' },
  { id: 'es-ES-male-1', name: 'Javier', language: 'es-ES', gender: 'male' },
  { id: 'fr-FR-female-1', name: 'Céline', language: 'fr-FR', gender: 'female' },
  { id: 'de-DE-male-1', name: 'Klaus', language: 'de-DE', gender: 'male' },
]);

/** @returns {Voice[]} the full catalog */
export function listVoices() {
  return VOICES;
}

/** @returns {Voice | null} the voice with this id, or null */
export function findVoice(id) {
  return VOICES.find((voice) => voice.id === id) ?? null;
}

// Sanity: every catalog language must be inside the frozen allow-list.
// (Guarded here so a Phase 5 catalog edit cannot drift from the contract.)
if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
  for (const voice of VOICES) {
    if (!SUPPORTED_LANGUAGES.includes(voice.language)) {
      throw new Error(`Voice ${voice.id} has language outside the allow-list`);
    }
  }
}
