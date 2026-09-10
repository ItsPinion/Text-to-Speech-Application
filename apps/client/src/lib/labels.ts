import type { Voice } from '@tts/shared'

/**
 * Human, full-form labels for the dropdowns — no cryptic codes in the
 * option text ("English (United States)", not "en-US"; "Aria — Female
 * Voice", not "en-US-female-1"). Codes still travel as option *values*
 * and appear as dimmed hints inside the popup for transparency.
 */

const languageDisplay = new Intl.DisplayNames(['en'], { type: 'language' })
const regionDisplay = new Intl.DisplayNames(['en'], { type: 'region' })

/** "en-US" → "English (United States)" · "hi-IN" → "Hindi (India)". */
export function formatLanguage(tag: string): string {
  const [languageCode, regionCode] = tag.split('-')
  try {
    const language = languageDisplay.of(languageCode) ?? languageCode
    const region = regionCode ? regionDisplay.of(regionCode) : undefined
    return region && region !== regionCode ? `${language} (${region})` : language
  } catch {
    return tag
  }
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** { name: "Aria", gender: "female" } → "Aria — Female Voice". */
export function formatVoice(voice: Voice): string {
  return `${voice.name} — ${capitalize(voice.gender)} Voice`
}

/**
 * Voice id → full-form label without a catalog lookup (history rows store
 * the raw id). Importing the server catalog is impossible client-side, so
 * the known map lives here; unknown ids fall back to themselves.
 */
const voiceLabels = new Map<string, string>([
  ['en-US-female-1', 'Aria — Female Voice'],
  ['en-US-male-1', 'Marcus — Male Voice'],
  ['en-GB-female-1', 'Iris — Female Voice'],
  ['hi-IN-female-1', 'Priya — Female Voice'],
  ['es-ES-male-1', 'Javier — Male Voice'],
  ['fr-FR-female-1', 'Céline — Female Voice'],
  ['de-DE-male-1', 'Klaus — Male Voice'],
])

export function findVoiceLabel(voiceId: string): string {
  return voiceLabels.get(voiceId) ?? voiceId
}
