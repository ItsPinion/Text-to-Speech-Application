import AudioPlayer from './AudioPlayer.jsx';
import DownloadButton from './DownloadButton.jsx';

/**
 * HistoryPanel (Phase 7) — my saved generations: replay, download, delete.
 * Audio is served from the server (audioUrl → /api/audio/<uuid>.mp3), so
 * replaying costs no synthesis.
 */
export default function HistoryPanel({ generations, onDelete, busyId }) {
  return (
    <section className="panel" aria-label="My history">
      <div className="panel-head">
        <h2>🕘 My history</h2>
        <span className="tag">
          {generations.length === 0 ? 'nothing yet' : `${generations.length} generation${generations.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <p className="muted">
        Signed-in generations are saved server-side — replay or download them without regenerating.
      </p>

      {generations.length === 0 ? (
        <p className="muted history-empty">Generate something while signed in and it will appear here.</p>
      ) : (
        <ul className="history-list">
          {generations.map((g) => (
            <li key={g.id} className="history-item">
              <div className="history-meta">
                <p className="history-text" title={g.text}>
                  {g.text.length > 90 ? `${g.text.slice(0, 90)}…` : g.text}
                </p>
                <span className="history-badges">
                  <code>{g.language}</code> · <code>{g.voice}</code> ·{' '}
                  <span className="muted">{g.createdAt}</span>
                </span>
              </div>
              <div className="history-controls">
                <AudioPlayer src={g.audioUrl} />
                <DownloadButton href={g.audioUrl} filename={`speech-${g.id}.mp3`} />
                <button
                  type="button"
                  className="clear-btn danger"
                  disabled={busyId === g.id}
                  onClick={() => onDelete(g.id)}
                  aria-label={`Delete generation ${g.id}`}
                >
                  {busyId === g.id ? 'Deleting…' : '🗑 Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
