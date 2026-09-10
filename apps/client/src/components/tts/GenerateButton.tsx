import { Button } from '@/components/ui/Button'

interface GenerateButtonProps {
  onClick: () => void
  disabled?: boolean
  generating: boolean
}

/**
 * Plan §Phase 4 GenerateButton: POST /api/tts trigger. Disabled while a
 * request is in flight (aria-busy) — no double-fires, no quota burns.
 */
export function GenerateButton({ onClick, disabled, generating }: GenerateButtonProps) {
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={onClick}
      disabled={disabled || generating}
      aria-busy={generating}
    >
      {generating ? (
        <>
          <span aria-hidden="true" className="animate-pulse">
            ▓
          </span>
          SYNTHESIZING…
        </>
      ) : (
        <>
          <span aria-hidden="true">▶</span> GENERATE SPEECH
        </>
      )}
    </Button>
  )
}
