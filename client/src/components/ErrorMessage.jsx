/**
 * ErrorMessage — maps HTTP statuses (and network failure) to human text.
 *
 * 400 keeps the server's message (validation errors are already
 * sentence-shaped, e.g. "Voice hi-IN-female-1 speaks hi-IN, not en-US").
 */
const STATUS_TEXT = {
  0: 'Network failure — cannot reach the server. Is it running? (cd server && npm run dev)',
  429: 'Too many requests — the limit is 10 generations per 15 minutes. Please wait a bit and try again.',
  503: 'The speech service is temporarily unavailable. Please try again shortly.',
};

export default function ErrorMessage({ error }) {
  if (!error) return null;

  const text = STATUS_TEXT[error.status] ?? error.message ?? 'Something went wrong.';
  const label = error.status ? `Error ${error.status}` : 'Error';

  return (
    <div className="error-box" role="alert">
      <span className="error-icon" aria-hidden="true">
        ⚠️
      </span>
      <div>
        <strong>{label}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
