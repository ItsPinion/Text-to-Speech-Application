import { Button } from "@/components/ui";

/** TTS lifecycle status the button renders from (frontend.md §2 ttsState). */
export type GenerateStatus = "idle" | "loading" | "ready" | "error";

/**
 * GenerateButton (FR-005/FR-013) — submit + loading + cancel affordance.
 * Never validates (validation is state-driven) and never fetches. Since
 * Phase 4 it renders VALIDATION enablement: disabled with a visible reason —
 * never silently dead.
 */
export interface GenerateButtonProps {
  status: GenerateStatus;
  onGenerate: () => void;
  onCancel?: () => void;
  /** False while text/voice are invalid (Phase 4). */
  disabled?: boolean;
  /** Why the button is disabled — rendered as a visible hint (never silent). */
  reason?: string | null;
}

export function GenerateButton({
  status,
  onGenerate,
  onCancel,
  disabled = false,
  reason,
}: GenerateButtonProps) {
  const loading = status === "loading";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          onClick={onGenerate}
          loading={loading}
          disabled={disabled || loading}
          className="flex-1"
        >
          {loading ? "Generating…" : "Generate Speech"}
        </Button>
        {loading && onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {!loading && disabled && reason && (
        <p aria-live="polite" className="text-xs text-slate-400">
          {reason}
        </p>
      )}
    </div>
  );
}
