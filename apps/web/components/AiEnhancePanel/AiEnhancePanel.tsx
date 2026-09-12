import { AI_OPERATIONS } from "@/lib/constants";
import { AI_OPERATION_LABELS } from "@/mocks/voices";
import { Badge, Button } from "@/components/ui";

/**
 * AiEnhancePanel (FR-014/015) — v2 placeholder, rendered disabled until
 * Phase 12 wires it. Operations come from the SHARED constant so when the
 * backend adds an operation, this panel compiles to update. Phase 12 will
 * introduce the real props (status/operation callbacks).
 */
export function AiEnhancePanel() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">AI enhance</h2>
        <Badge variant="outline">Phase 12</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {AI_OPERATIONS.map((operation) => (
          <Button key={operation} variant="secondary" size="sm" disabled>
            {AI_OPERATION_LABELS[operation]}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Free AI enhancement — runs with a user-supplied free-tier key; the app works without one.
      </p>
    </div>
  );
}
