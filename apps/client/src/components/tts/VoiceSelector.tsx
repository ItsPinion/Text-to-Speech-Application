import { SelectField } from '@/components/tts/SelectField'
import type { Voice } from '@tts/shared'

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
 */
export function VoiceSelector({ voices, value, onChange, disabled }: VoiceSelectorProps) {
  return (
    <SelectField
      id="tts-voice"
      label="Voice"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      {voices.length === 0 && <option value="">— NO VOICES FOR LANGUAGE —</option>}
      {voices.map((voice) => (
        <option key={voice.id} value={voice.id} className="bg-black font-mono">
          {voice.name} · {voice.gender.toUpperCase()} ({voice.id})
        </option>
      ))}
    </SelectField>
  )
}

