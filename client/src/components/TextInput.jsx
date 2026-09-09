/**
 * TextInput — textarea with live character + word counts (spec §32).
 *
 * The 4,000-character cap is enforced client-side (maxLength + a slice
 * guard) for UX, and again server-side for security — the server is the
 * authority, this is just friendlier.
 */
export default function TextInput({ value, onChange, maxChars = 4000 }) {
  const chars = value.length;
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const pct = Math.min(100, (chars / maxChars) * 100);
  const nearLimit = chars >= maxChars * 0.9;

  return (
    <div className="text-input">
      <div className="label-row">
        <label htmlFor="tts-text">Text to speak</label>
        <div className="label-row-right">
          <div className="counts" id="tts-counts">
            <span data-testid="char-count" className={nearLimit ? 'count warn' : 'count'}>
              {chars.toLocaleString()} / {maxChars.toLocaleString()} characters
            </span>
            <span data-testid="word-count" className="count">
              {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            </span>
          </div>
          <button
            type="button"
            className="clear-btn"
            onClick={() => onChange('')}
            disabled={chars === 0}
          >
            Clear
          </button>
        </div>
      </div>
      <textarea
        id="tts-text"
        value={value}
        rows={6}
        placeholder="Type or paste text…"
        aria-describedby="tts-counts"
        onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
      />
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`progress-fill${nearLimit ? ' warn' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
