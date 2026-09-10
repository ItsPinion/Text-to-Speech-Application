import { RATE_LIMIT } from '@tts/shared'

import { Button } from '@/components/ui/Button'

/**
 * Plan §Phase 4 ErrorMessage: maps the frozen HTTP statuses + network
 * failure to human text. Server messages (400s) are already human — shown
 * verbatim; 429/503/network get friendlier phrasing.
 */
export function describeTtsError(error: { status: number | null; message: string }): string {
  if (error.status === null) {
    return 'Network failure — cannot reach the API. Check SYS://HEALTH and confirm the server is running.'
  }
  if (error.status === 429) {
    return `Too many requests — the API allows ${RATE_LIMIT.max} per ${RATE_LIMIT.windowMs / 60_000} minutes. Wait a moment and retry.`
  }
  if (error.status === 503) {
    return 'The local speech engine is unavailable or still loading — on first boot it loads a multi-GB model (slow on CPU). Check `docker compose logs -f indextts`, wait for "model ready", then retry.'
  }
  return error.message
}

interface ErrorMessageProps {
  message: string
  onRetry?: () => void
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div role="alert" className="border-2 border-magenta bg-magenta/10 px-4 py-3">
      <p className="font-mono text-sm leading-relaxed text-magenta">
        <span aria-hidden="true">⚠ </span>
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          RETRY
        </Button>
      )}
    </div>
  )
}
