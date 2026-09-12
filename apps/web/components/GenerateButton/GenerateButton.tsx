import { Button } from "@/components/ui";

/** TTS lifecycle status the button renders from (frontend.md §2 ttsState). */
export type GenerateStatus = "idle" | "loading" | "ready" | "error";

/**
 * GenerateButton (FR-005/FR-013) — submit + loading + cancel affordance.
 * Never validates (validation is state-driven, Phase 4) and never fetches.
 */
export interface GenerateButtonProps {
  status: GenerateStatus;
  onGenerate: () => void;
  onCancel?: () => void;
}

export function GenerateButton({ status, onGenerate, onCancel }: GenerateButtonProps) {
  const loading = status === "loading";

  return (
    <div className="flex items-center gap-2">
      <Button onClick={onGenerate} loading={loading} disabled={loading} className="flex-1">
        {loading ? "Generating…" : "Generate Speech"}
      </Button>
      {loading && onCancel && (
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
