/**
 * VoiceSelector — voices filtered by the selected language, with
 * Phase 7 favorites: ★ toggles the selected voice; the checkbox filters
 * the list down to favorites.
 */
export default function VoiceSelector({
  voices,
  value,
  onChange,
  disabled,
  favorites = new Set(),
  onToggleFavorite,
  favoritesOnly,
  onToggleFavoritesFilter,
}) {
  const shown = favoritesOnly ? voices.filter((v) => favorites.has(v.id)) : voices;
  const selectedIsFavorite = favorites.has(value);

  return (
    <div className="field voice-field">
      <label htmlFor="voice-select">
        Voice{' '}
        {onToggleFavorite && (
          <button
            type="button"
            className={`star-btn ${selectedIsFavorite ? 'active' : ''}`}
            onClick={() => onToggleFavorite(value)}
            disabled={disabled || !value}
            title={selectedIsFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={selectedIsFavorite}
            aria-label={selectedIsFavorite ? `Remove ${value} from favorites` : `Add ${value} to favorites`}
          >
            {selectedIsFavorite ? '★' : '☆'}
          </button>
        )}
      </label>
      <select
        id="voice-select"
        value={value}
        disabled={disabled || shown.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {shown.map((v) => (
          <option key={v.id} value={v.id}>
            {favorites.has(v.id) ? '★ ' : ''}
            {v.name} · {v.gender}
          </option>
        ))}
      </select>
      {onToggleFavoritesFilter && (
        <label className="fav-filter">
          <input
            type="checkbox"
            checked={Boolean(favoritesOnly)}
            onChange={(e) => onToggleFavoritesFilter(e.target.checked)}
            disabled={disabled || favorites.size === 0}
          />{' '}
          ★ favorites only
        </label>
      )}
    </div>
  );
}
