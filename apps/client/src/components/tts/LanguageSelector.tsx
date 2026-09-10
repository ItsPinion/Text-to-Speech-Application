import { SelectField, type SelectOption } from '@/components/tts/SelectField'
import { formatLanguage } from '@/lib/labels'

interface LanguageSelectorProps {
  languages: string[]
  value: string
  onChange: (language: string) => void
  disabled?: boolean
}

/**
 * Plan §Phase 4 LanguageSelector: fed by the unique languages in
 * GET /api/voices. Options use full-form labels — "English (United
 * States)", not "en-US" — with the raw locale as a dimmed hint.
 */
export function LanguageSelector({
  languages,
  value,
  onChange,
  disabled,
}: LanguageSelectorProps) {
  const options: SelectOption[] = languages.map((language) => ({
    value: language,
    label: formatLanguage(language),
    hint: language.toUpperCase(),
  }))

  return (
    <SelectField
      id="tts-language"
      label="Language"
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
