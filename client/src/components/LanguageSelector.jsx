/**
 * CHANNEL selector — languages derived from GET /api/voices so the UI can
 * never offer a language the server does not know.
 */
import { languageLabel } from '../utils/languages';

export default function LanguageSelector({ languages, value, onChange, disabled }) {
  const loading = !disabled && languages.length === 0;

  return (
    <div className="flex-1">
      <label
        htmlFor="tts-language"
        className="mb-2 block font-mono text-xs uppercase tracking-widest text-neon-magenta"
      >
        {'> LANGUAGE'}
      </label>
      <div className="relative">
        <select
          id="tts-language"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || loading}
          className="w-full appearance-none border-2 border-neon-magenta bg-black px-3 py-2.5 pr-9 font-mono text-sm uppercase text-neon-cyan transition-all duration-200 ease-linear focus-visible:border-neon-cyan focus-visible:shadow-[0_0_15px_#00FFFF] focus-visible:outline-none disabled:opacity-40"
        >
          {loading ? (
            <option value="">SCANNING…</option>
          ) : (
            languages.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))
          )}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neon-magenta"
        >
          ▼
        </span>
      </div>
      {!loading && (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-chrome/40">
          {languages.length} CHANNELS ONLINE
        </p>
      )}
    </div>
  );
}
