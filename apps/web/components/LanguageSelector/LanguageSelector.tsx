import { useId } from "react";
import type { LanguageOption } from "@tts/types";
import { Select, Spinner } from "@/components/ui";

/**
 * LanguageSelector (FR-003) — native select over the catalog's languages.
 * Knows nothing about voices; the parent derives the filtered voice list.
 */
export interface LanguageSelectorProps {
  languages: LanguageOption[];
  value: string;
  onChange: (languageCode: string) => void;
  loading?: boolean;
}

export function LanguageSelector({
  languages,
  value,
  onChange,
  loading = false,
}: LanguageSelectorProps) {
  const id = useId();
  const placeholder = loading
    ? "Loading languages…"
    : languages.length === 0
      ? "No languages available"
      : "Select language";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-900">
        Language
      </label>
      {loading ? (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 ring-1 ring-inset ring-slate-200">
          <Spinner className="size-4" />
          Loading…
        </div>
      ) : (
        <Select
          id={id}
          options={languages.map((language) => ({
            value: language.code,
            label: language.label,
          }))}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={languages.length === 0}
          aria-label="Language"
        />
      )}
    </div>
  );
}
