/**
 * Voice catalog (Phase 3). Static data — later phases may serve this from a
 * vendor, but the wire shape stays: { id, name, language, gender }.
 * The unique set of languages here IS the allow-list used by validation,
 * so a voice can never reference an unsupported language.
 */
const VOICES = [
  { id: 'en-US-female-1', name: 'Aria', language: 'en-US', gender: 'female' },
  { id: 'en-US-male-1', name: 'Orion', language: 'en-US', gender: 'male' },
  { id: 'en-GB-female-1', name: 'Iris', language: 'en-GB', gender: 'female' },
  { id: 'hi-IN-female-1', name: 'Kavya', language: 'hi-IN', gender: 'female' },
  { id: 'hi-IN-male-1', name: 'Arjun', language: 'hi-IN', gender: 'male' },
  { id: 'es-ES-female-1', name: 'Lucia', language: 'es-ES', gender: 'female' },
  { id: 'fr-FR-male-1', name: 'Theo', language: 'fr-FR', gender: 'male' },
  { id: 'de-DE-female-1', name: 'Mila', language: 'de-DE', gender: 'female' },
];

function getVoiceById(id) {
  return VOICES.find((v) => v.id === id);
}

function getLanguages() {
  return [...new Set(VOICES.map((v) => v.language))].sort();
}

function getVoicesByLanguage(language) {
  return VOICES.filter((v) => v.language === language);
}

module.exports = { VOICES, getVoiceById, getLanguages, getVoicesByLanguage };
