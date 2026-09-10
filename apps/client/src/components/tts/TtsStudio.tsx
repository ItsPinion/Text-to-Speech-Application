import { DEFAULT_LANGUAGE, RATE_LIMIT } from '@tts/shared'
import { useEffect, useMemo, useState } from 'react'

import { AudioPlayer } from '@/components/tts/AudioPlayer'
import { ErrorMessage, describeTtsError } from '@/components/tts/ErrorMessage'
import { GenerateButton } from '@/components/tts/GenerateButton'
import { LanguageSelector } from '@/components/tts/LanguageSelector'
import { TextInput } from '@/components/tts/TextInput'
import { VoiceSelector } from '@/components/tts/VoiceSelector'
import { Badge } from '@/components/ui/Badge'
import { TerminalWindow } from '@/components/ui/TerminalWindow'
import { useVoices } from '@/hooks/useVoices'
import { ApiError, generateSpeech } from '@/services/api'

interface GeneratedAudio {
  url: string
  sizeBytes: number
}

/**
 * Plan §Phase 4 — the container that wires the whole flow:
 *
 *   mount → GET /api/voices → language + voice selectors
 *   type → live counts (client-side)
 *   generate → POST blob → URL.createObjectURL → <audio> + download
 *
 * Deliberate choices (documented per the plan):
 *  - Changing text clears the previous result ("clear is simpler").
 *  - The previous object URL is revoked whenever it is replaced or cleared,
 *    so no blob memory leaks.
 *  - Generate is disabled unless the catalog is ready, text is non-empty,
 *    and a voice is picked — the empty case never reaches the network
 *    (plan test 4.1).
 */
export function TtsStudio() {
  const catalog = useVoices()
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE)
  const [voice, setVoice] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [audio, setAudio] = useState<GeneratedAudio | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const languages = useMemo(
    () => [...new Set(catalog.voices.map((entry) => entry.language))],
    [catalog.voices],
  )
  const voicesForLanguage = useMemo(
    () => catalog.voices.filter((entry) => entry.language === language),
    [catalog.voices, language],
  )

  // Keep `voice` valid at all times: when the catalog arrives (or the
  // language changes), any stale/empty selection snaps to the first voice
  // that speaks the current language — plan test 4.4's "previous voice
  // reset if invalid".
  useEffect(() => {
    if (catalog.status !== 'ready') return
    if (voicesForLanguage.some((entry) => entry.id === voice)) return
    setVoice(voicesForLanguage[0]?.id ?? '')
  }, [catalog.status, voicesForLanguage, voice])

  const handleLanguageChange = (next: string) => {
    setLanguage(next)
  }

  const handleTextChange = (next: string) => {
    setText(next)
    if (audio) {
      URL.revokeObjectURL(audio.url)
      setAudio(null)
    }
  }

  const canGenerate =
    catalog.status === 'ready' && text.trim().length > 0 && voice !== '' && !isGenerating

  const handleGenerate = async () => {
    if (!canGenerate) return
    setIsGenerating(true)
    setError(null)
    try {
      const blob = await generateSpeech({ text: text.trim(), language, voice })
      setAudio({ url: URL.createObjectURL(blob), sizeBytes: blob.size })
      // Phase 7: let SYS://ARCHIVE refresh without prop drilling.
      window.dispatchEvent(new Event('tts:generated'))
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError('Unexpected error', null),
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const selectedVoice = catalog.voices.find((entry) => entry.id === voice)

  return (
    <TerminalWindow
      title="SYS://SYNTH"
      actions={<Badge variant="magenta">POST /api/tts</Badge>}
      footer={`MOCK PROVIDER · LIMIT ${RATE_LIMIT.max} REQ/${RATE_LIMIT.windowMs / 60_000} MIN · KEYS STAY SERVER-SIDE`}
    >
      <div className="grid gap-6">
        <TextInput value={text} onChange={handleTextChange} disabled={isGenerating} />

        <div className="grid gap-6 md:grid-cols-2">
          <LanguageSelector
            languages={languages}
            value={language}
            onChange={handleLanguageChange}
            disabled={isGenerating || catalog.status !== 'ready'}
          />
          <VoiceSelector
            voices={voicesForLanguage}
            value={voice}
            onChange={setVoice}
            disabled={isGenerating || catalog.status !== 'ready'}
          />
        </div>

        {catalog.status === 'error' && (
          <ErrorMessage
            message="Voice catalog unavailable — the API did not answer /api/voices. Generation is offline until it returns."
            onRetry={catalog.reload}
          />
        )}

        {error && <ErrorMessage message={describeTtsError(error)} />}

        <div className="flex flex-wrap items-center gap-4">
          <GenerateButton
            onClick={handleGenerate}
            disabled={!canGenerate}
            generating={isGenerating}
          />
          <p className="font-mono text-xs uppercase tracking-widest text-chrome/50">
            {selectedVoice
              ? `VOICE: ${selectedVoice.name.toUpperCase()} · ${language}`
              : 'PICK TEXT + VOICE TO ENABLE SYNTHESIS'}
          </p>
        </div>

        {audio && (
          <AudioPlayer url={audio.url} sizeBytes={audio.sizeBytes} voice={selectedVoice} />
        )}
      </div>
    </TerminalWindow>
  )
}
