import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { Badge } from "@/components/ui";

/**
 * FileUpload (FR-026) — v2 placeholder. The slot is reserved in the shell
 * now so Phase 17 plugs real behavior into an existing, styled position
 * (the layout never jumps when the feature lands).
 */
export function FileUpload() {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <span className="font-medium text-slate-600">Upload a file</span> — TXT, PDF or DOCX
          fills the editor (max {Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).
        </p>
        <Badge variant="outline">Phase 17</Badge>
      </div>
    </div>
  );
}
