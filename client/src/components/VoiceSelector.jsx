/**
 * VOICE selector — options are the voices for the chosen language only.
 */
export default function VoiceSelector({ voices, value, onChange, disabled }) {
  const loading = !disabled && voices.length === 0;

  return (
    <div className="flex-1">
      <label
        htmlFor="tts-voice"
        className="mb-2 block font-mono text-xs uppercase tracking-widest text-neon-magenta"
      >
        {'> VOICE'}
      </label>
      <div className="relative">
        <select
          id="tts-voice"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || loading}
          className="w-full appearance-none border-2 border-neon-magenta bg-black px-3 py-2.5 pr-9 font-mono text-sm uppercase text-neon-cyan transition-all duration-200 ease-linear focus-visible:border-neon-cyan focus-visible:shadow-[0_0_15px_#00FFFF] focus-visible:outline-none disabled:opacity-40"
        >
          {loading ? (
            <option value="">SCANNING…</option>
          ) : (
            voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.gender.toUpperCase()}
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
          {voices.length} VOICES ON THIS CHANNEL
        </p>
      )}
    </div>
  );
}
