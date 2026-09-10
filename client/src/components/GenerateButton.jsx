/**
 * TRANSMIT button — disabled while synthesizing, disabled whenever input
 * is incomplete (no text / no voice / catalog not loaded). In-flight state
 * gets the blinking terminal cursor.
 */
import Button from './Button';

export default function GenerateButton({ onClick, disabled, loading }) {
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className="w-full sm:w-auto"
    >
      {loading ? (
        <>
          SYNTHESIZING<span className="animate-blink">_</span>
        </>
      ) : (
        <>▶ GENERATE</>
      )}
    </Button>
  );
}
