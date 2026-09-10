import { SelectField, type SelectOption } from '@/components/tts/SelectField'
import type { Voice } from '@tts/shared'

import { formatVoice } from '@/lib/labels'

interface VoiceSelectorProps {
  /** Voices already filtered down to the selected language. */
  voices: Voice[]
  value: string
  onChange: (voiceId: string) => void
  disabled?: boolean
}

/**
 * Plan §Phase 4 VoiceSelector: only voices that speak the selected language
 * (the server re-validates this — client filtering is UX, not security).
 * Full-form labels — "Aria — Female Voice" — with the contract id as a
 * dimmed hint inside the popup.
 */
export function VoiceSelector({ voices, value, onChange, disabled }: VoiceSelectorProps) {
  const options: SelectOption[] = voices.map((voice) => ({
    value: voice.id,
    label: formatVoice(voice),
    hint: voice.id,
  }))

  return (
    <SelectField
      id="tts-voice"
      label="Voice"
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
