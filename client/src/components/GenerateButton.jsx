/**
 * GenerateButton — fires POST /api/tts (handled by App), shows a spinner
 * and stays disabled while a request is in flight.
 */
export default function GenerateButton({ busy, disabled, onClick }) {
  return (
    <button
      type="button"
      className="generate-btn"
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? (
        <>
          <span className="spinner" aria-hidden="true" />
          Generating…
        </>
      ) : (
        '▶ Generate speech'
      )}
    </button>
  );
}
