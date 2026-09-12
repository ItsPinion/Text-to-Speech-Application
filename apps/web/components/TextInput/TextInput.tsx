import { countChars, countWords, MAX_TEXT_CHARS } from "@/lib/constants";

/**
 * TextInput (FR-001/002) — textarea + live counts + clear.
 * Owns presentation only: counts are DERIVED from `value` on render (never
 * stored — no sync code exists to break), and the API is never called here.
 */
export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  /** Field-level validation message (wired in Phase 4). */
  error?: string | null;
  disabled?: boolean;
}

export function TextInput({ value, onChange, onClear, error, disabled = false }: TextInputProps) {
  const chars = countChars(value);
  const words = countWords(value);
  const remaining = MAX_TEXT_CHARS - chars;
  const overLimit = remaining < 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="text-input" className="text-sm font-semibold text-slate-900">
          Text to speak
        </label>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled || value.length === 0}
          className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <textarea
        id="text-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={10}
        placeholder={`Type or paste up to ${MAX_TEXT_CHARS.toLocaleString()} characters…`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "text-input-error text-input-count" : "text-input-count"}
        className={`w-full resize-y rounded-xl border-0 bg-white p-4 text-sm leading-relaxed text-slate-900 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset disabled:cursor-not-allowed disabled:bg-slate-50 ${
          error ? "ring-red-400 focus:ring-red-500" : "ring-slate-300 focus:ring-indigo-500"
        }`}
      />

      <div className="flex items-center justify-between gap-3">
        <p
          id="text-input-count"
          aria-live="polite"
          className={`text-xs tabular-nums ${overLimit ? "font-semibold text-red-600" : "text-slate-500"}`}
        >
          {chars.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()} characters ·{" "}
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </p>
        {error && (
          <p id="text-input-error" className="text-xs font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
