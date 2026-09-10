/**
 * Display helpers for the voice catalog (client-side presentation only —
 * the data itself always comes from GET /api/voices).
 */
export const DEFAULT_LANGUAGE = 'en-US';

const LANGUAGE_NAMES = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'hi-IN': 'हिन्दी — Hindi',
  'es-ES': 'Español',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
};

export function languageLabel(code) {
  const name = LANGUAGE_NAMES[code];
  return name ? `${code} — ${name}` : code.toUpperCase();
}

export function uniqueLanguages(voices) {
  return [...new Set(voices.map((v) => v.language))].sort();
}
