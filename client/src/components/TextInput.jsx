/**
 * SOURCE TEXT panel — terminal-style textarea with live character/word
 * counts and the 4 000-char contract cap enforced twice (maxLength attr
 * for typing, clamp for paste events in any browser).
 */
import { MAX_TEXT_LENGTH, countWords, clampToMax } from '../utils/textStats';

export default function TextInput({ value, onChange, disabled = false }) {
  const chars = value.length;
  const words = countWords(value);
  const nearLimit = chars >= MAX_TEXT_LENGTH * 0.9;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <label
          id="source-text-label"
          htmlFor="tts-text"
          className="group flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-neon-magenta"
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rotate-45 bg-neon-magenta transition-transform duration-200 ease-linear group-hover:rotate-90"
          />
          {' STEP_01 :: SOURCE TEXT'}
        </label>
        <p
          className={`font-mono text-xs tracking-wider transition-colors duration-200 ${
            nearLimit ? 'text-neon-orange' : 'text-chrome/50'
          }`}
        >
          CHARS: {chars}/{MAX_TEXT_LENGTH} · WORDS: {words}
        </p>
      </div>

      <textarea
        id="tts-text"
        value={value}
        disabled={disabled}
        maxLength={MAX_TEXT_LENGTH}
        rows={7}
        onChange={(e) => onChange(clampToMax(e.target.value))}
        placeholder="> Feed me words, netrunner…"
        className="w-full resize-y border-2 border-neon-magenta bg-black px-3 py-2 font-mono text-base text-neon-cyan transition-all duration-200 ease-linear placeholder:text-neon-magenta/50 focus-visible:border-neon-cyan focus-visible:shadow-[0_0_15px_#00FFFF] focus-visible:outline-none disabled:opacity-40 sm:text-lg"
      />

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={disabled || chars === 0}
          className="rounded-none px-3 py-1 font-mono text-xs uppercase tracking-widest text-chrome/60 transition-all duration-200 ease-linear hover:bg-[rgba(0,255,255,0.1)] hover:text-neon-cyan disabled:cursor-not-allowed disabled:opacity-30"
        >
          ✕ CLEAR TEXT
        </button>
      </div>
    </section>
  );
}
