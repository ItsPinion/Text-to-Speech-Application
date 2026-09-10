import { SelectField } from '@/components/tts/SelectField'

interface LanguageSelectorProps {
  languages: string[]
  value: string
  onChange: (language: string) => void
  disabled?: boolean
}

/**
 * Plan §Phase 4 LanguageSelector: dropdown fed by the unique languages in
 * GET /api/voices. Defaults to en-US (the frozen DEFAULT_LANGUAGE).
 */
export function LanguageSelector({
  languages,
  value,
  onChange,
  disabled,
}: LanguageSelectorProps) {
  return (
    <SelectField
      id="tts-language"
      label="Language"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      {languages.length === 0 && (
        <option value="">— NO LANGUAGES LOADED —</option>
      )}
      {languages.map((language) => (
        <option key={language} value={language} className="bg-black font-mono">
          {language}
        </option>
      ))}
    </SelectField>
  )
}
