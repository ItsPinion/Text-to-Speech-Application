/**
 * Static voice catalog (Phase 3) — backs GET /api/voices and drives the
 * language allow-list (constants.js DERIVES it from this list).
 *
 * 16 voices across 8 languages. The `engine`/`quality` fields describe
 * the BEST offline engine wired for that voice: 'piper' = neural VITS
 * (human-sounding, ~60 MB model per voice); 'espeak' = classic formant
 * synthesis (Telugu/Tamil have no Piper models yet). With
 * TTS_PROVIDER=espeak every voice renders classic — the catalog is
 * capability info, the active provider is reported by GET /api/voices.
 */
export const VOICES = [
  { id: 'en-US-female-1', name: 'Aria (English, US)', language: 'en-US', gender: 'female', engine: 'piper', quality: 'neural' },
  { id: 'en-US-male-1', name: 'Mason (English, US)', language: 'en-US', gender: 'male', engine: 'piper', quality: 'neural' },
  { id: 'en-GB-female-1', name: 'Ada (English, UK)', language: 'en-GB', gender: 'female', engine: 'piper', quality: 'neural' },
  { id: 'en-GB-male-1', name: 'Oliver (English, UK)', language: 'en-GB', gender: 'male', engine: 'piper', quality: 'neural' },
  { id: 'en-IN-female-1', name: 'Ananya (English, India)', language: 'en-IN', gender: 'female', engine: 'piper', quality: 'neural' },
  { id: 'en-IN-male-1', name: 'Arjun (English, India)', language: 'en-IN', gender: 'male', engine: 'piper', quality: 'neural' },
  { id: 'hi-IN-female-1', name: 'Kalpana (Hindi)', language: 'hi-IN', gender: 'female', engine: 'piper', quality: 'neural' },
  { id: 'hi-IN-male-1', name: 'Rahul (Hindi)', language: 'hi-IN', gender: 'male', engine: 'piper', quality: 'neural' },
  { id: 'te-IN-female-1', name: 'Lakshmi (Telugu)', language: 'te-IN', gender: 'female', engine: 'espeak', quality: 'classic' },
  { id: 'te-IN-male-1', name: 'Kiran (Telugu)', language: 'te-IN', gender: 'male', engine: 'espeak', quality: 'classic' },
  { id: 'ta-IN-female-1', name: 'Meera (Tamil)', language: 'ta-IN', gender: 'female', engine: 'espeak', quality: 'classic' },
  { id: 'ta-IN-male-1', name: 'Vikram (Tamil)', language: 'ta-IN', gender: 'male', engine: 'espeak', quality: 'classic' },
  { id: 'es-ES-female-1', name: 'Lucia (Spanish)', language: 'es-ES', gender: 'female', engine: 'piper', quality: 'neural' },
  { id: 'es-ES-male-1', name: 'Mateo (Spanish)', language: 'es-ES', gender: 'male', engine: 'piper', quality: 'neural' },
  { id: 'fr-FR-female-1', name: 'Camille (French)', language: 'fr-FR', gender: 'female', engine: 'piper', quality: 'neural' },
  { id: 'fr-FR-male-1', name: 'Louis (French)', language: 'fr-FR', gender: 'male', engine: 'piper', quality: 'neural' },
];
