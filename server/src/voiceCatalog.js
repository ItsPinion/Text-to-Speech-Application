/**
 * Static voice catalog (Phase 3) — backs GET /api/voices and drives the
 * language allow-list (constants.js DERIVES it from this list).
 *
 * 16 voices across 8 languages. The mock provider ignores which voice
 * you pick (same beep for everyone); Phase 5 maps these ids onto a real
 * vendor's voices behind the same ttsService interface.
 */
export const VOICES = [
  { id: 'en-US-female-1', name: 'Aria (English, US)', language: 'en-US', gender: 'female' },
  { id: 'en-US-male-1', name: 'Mason (English, US)', language: 'en-US', gender: 'male' },
  { id: 'en-GB-female-1', name: 'Ada (English, UK)', language: 'en-GB', gender: 'female' },
  { id: 'en-GB-male-1', name: 'Oliver (English, UK)', language: 'en-GB', gender: 'male' },
  { id: 'en-IN-female-1', name: 'Ananya (English, India)', language: 'en-IN', gender: 'female' },
  { id: 'en-IN-male-1', name: 'Arjun (English, India)', language: 'en-IN', gender: 'male' },
  { id: 'hi-IN-female-1', name: 'Kalpana (Hindi)', language: 'hi-IN', gender: 'female' },
  { id: 'hi-IN-male-1', name: 'Rahul (Hindi)', language: 'hi-IN', gender: 'male' },
  { id: 'te-IN-female-1', name: 'Lakshmi (Telugu)', language: 'te-IN', gender: 'female' },
  { id: 'te-IN-male-1', name: 'Kiran (Telugu)', language: 'te-IN', gender: 'male' },
  { id: 'ta-IN-female-1', name: 'Meera (Tamil)', language: 'ta-IN', gender: 'female' },
  { id: 'ta-IN-male-1', name: 'Vikram (Tamil)', language: 'ta-IN', gender: 'male' },
  { id: 'es-ES-female-1', name: 'Lucia (Spanish)', language: 'es-ES', gender: 'female' },
  { id: 'es-ES-male-1', name: 'Mateo (Spanish)', language: 'es-ES', gender: 'male' },
  { id: 'fr-FR-female-1', name: 'Camille (French)', language: 'fr-FR', gender: 'female' },
  { id: 'fr-FR-male-1', name: 'Louis (French)', language: 'fr-FR', gender: 'male' },
];
