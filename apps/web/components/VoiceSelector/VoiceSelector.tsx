import { useId } from "react";
import type { Voice } from "@tts/types";
import { Select, Spinner } from "@/components/ui";

/**
 * VoiceSelector (FR-004) — native select over the voices FOR THE SELECTED
 * LANGUAGE (filtering happens in the parent). Never fetches data itself.
 */
export interface VoiceSelectorProps {
  voices: Voice[];
  value: string;
  onChange: (voiceId: string) => void;
  loading?: boolean;
  /** Catalog-load failure surfaced inline (the global region takes ApiErrors). */
  error?: string | null;
}

export function VoiceSelector({
  voices,
  value,
  onChange,
  loading = false,
  error = null,
}: VoiceSelectorProps) {
  const id = useId();
  const placeholder = loading
    ? "Loading voices…"
    : voices.length === 0
      ? "Pick a language first"
      : "Select voice";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-900">
        Voice
      </label>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 ring-1 ring-inset ring-slate-200">
          <Spinner className="size-4" />
          Loading…
        </div>
      ) : (
        <Select
          id={id}
          options={voices.map((voice) => ({
            value: voice.id,
            label: voice.name,
          }))}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={voices.length === 0}
          aria-label="Voice"
        />
      )}
    </div>
  );
}
