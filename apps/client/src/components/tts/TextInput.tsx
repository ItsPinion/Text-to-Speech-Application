import { MAX_TEXT_LENGTH } from '@tts/shared'

import { Button } from '@/components/ui/Button'
import { countWords } from '@/lib/textStats'

interface TextInputProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

/**
 * Plan §Phase 4 TextInput: textarea with live character + word count, hard
 * cap at MAX_TEXT_LENGTH (4 000 — the 4 001st char is blocked AND warned).
 * CLEAR lets users reset without selecting-all (plan: "Clear text" feature).
 */
export function TextInput({ value, onChange, disabled }: TextInputProps) {
  const chars = value.length
  const words = countWords(value)
  const atMax = chars >= MAX_TEXT_LENGTH

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor="tts-text"
          className="font-mono text-xs uppercase tracking-widest text-chrome/60"
        >
          <span aria-hidden="true">&gt; </span>Text input
        </label>
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange('')}
            disabled={disabled}
          >
            Clear
          </Button>
        )}
      </div>
      <textarea
        id="tts-text"
        value={value}
        disabled={disabled}
        rows={6}
        onChange={(event) => onChange(event.target.value.slice(0, MAX_TEXT_LENGTH))}
        placeholder="> type or paste text — the synth bay turns it into speech…"
        className="w-full resize-y border-b-2 border-magenta bg-black px-3 py-2 font-mono text-lg text-cyan transition-all duration-200 ease-linear placeholder:text-magenta/50 focus-visible:border-cyan focus-visible:shadow-glow-cyan focus-visible:outline-none disabled:opacity-50"
      />
      <p
        data-testid="text-stats"
        aria-live="polite"
        className="mt-2 flex flex-wrap gap-x-4 font-mono text-xs uppercase tracking-widest text-chrome/50"
      >
        <span>
          CHARS{' '}
          <span className={atMax ? 'text-sunset' : 'text-cyan'}>
            {chars}/{MAX_TEXT_LENGTH}
          </span>
        </span>
        <span>
          WORDS <span className="text-cyan">{words}</span>
        </span>
        {atMax && <span className="text-sunset">MAX REACHED — TRIM TO CONTINUE</span>}
      </p>
    </div>
  )
}
