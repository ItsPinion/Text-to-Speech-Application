import { countChars, countWords, MAX_TEXT_CHARS } from "@/lib/constants";

/**
 * TextInput (FR-001/002/009) — a real, validated text editor.
 *
 * Owns presentation only (frontend.md §3): counts are DERIVED from `value`
 * on every render (no setChars/setWords exists anywhere — a whole class of
 * sync bugs is unrepresentable), and the API is never called here. The
 * workspace decides when emptiness becomes an ERROR (submit attempt / blur);
 * over-limit is always shown immediately — the user must know what to cut.
 *
 * Never truncates typed text (Phase 4 rule): the over-limit message says
 * exactly how much to remove instead.
 */
export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  /** Field-level validation message (registry copy via validateText). */
  error?: string | null;
  /** True while a generation is in flight (edit still allowed — the new text belongs to the next generation). */
  disabled?: boolean;
}

export function TextInput({ value, onChange, onClear, error, disabled = false }: TextInputProps) {
  const chars = countChars(value);
  const words = countWords(value);
  const remaining = MAX_TEXT_CHARS - chars;
  const overLimit = remaining < 0;
  // Counter color: amber near the limit (≥90%), red over — BEFORE the error appears.
  const nearLimit = remaining >= 0 && chars >= MAX_TEXT_CHARS * 0.9;

  const countColor = overLimit
    ? "font-semibold text-red-600"
    : nearLimit
      ? "font-medium text-amber-600"
      : "text-slate-500";

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
          error || overLimit ? "ring-red-400 focus:ring-red-500" : "ring-slate-300 focus:ring-indigo-500"
        }`}
      />

      <div className="flex items-start justify-between gap-3">
        <p
          id="text-input-count"
          aria-live="polite"
          className={`text-xs tabular-nums ${countColor}`}
        >
          {chars.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()} characters ·{" "}
          {words.toLocaleString()} {words === 1 ? "word" : "words"} ·{" "}
          {overLimit
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} remaining`}
        </p>
        {error && (
          <p id="text-input-error" role="alert" className="text-xs font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
