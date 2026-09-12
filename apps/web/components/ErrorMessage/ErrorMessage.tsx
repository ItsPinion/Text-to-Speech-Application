import type { ApiError } from "@/services/api";
import { Badge } from "@/components/ui";

/**
 * ErrorMessage (FR-008) — THE single aria-live region for API errors.
 * Renders an ApiError as human copy + code badge; the hook/parent decides
 * retry policy, this component only presents and dismisses.
 */
export interface ErrorMessageProps {
  error?: ApiError | null;
  onDismiss?: () => void;
}

export function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  return (
    // The live region exists in the DOM even when empty, so the first error
    // is announced reliably (assertive: generation results matter).
    <div aria-live="assertive">
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge variant="danger">{error.code}</Badge>
              {error.requestId && (
                <span className="text-[11px] text-slate-400">id: {error.requestId}</span>
              )}
            </div>
            <p className="text-sm text-red-800">{error.message}</p>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss error"
              className="rounded p-1 text-red-400 hover:bg-red-100 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
