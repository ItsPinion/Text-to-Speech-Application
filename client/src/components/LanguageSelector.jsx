/**
 * LanguageSelector — dropdown of the unique languages in GET /api/voices.
 * (App derives the list; this stays presentational.)
 */
export default function LanguageSelector({ languages, value, onChange, disabled }) {
  return (
    <div className="field">
      <label htmlFor="language-select">Language</label>
      <select
        id="language-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {languages.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
