import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getVoices,
  synthesizeSpeech,
  register,
  login,
  fetchMe,
  fetchHistory,
  deleteHistoryItem,
  fetchFavorites,
  addFavorite,
  removeFavorite,
  getStoredToken,
  setStoredToken,
} from './services/api.js';
import TextInput from './components/TextInput.jsx';
import LanguageSelector from './components/LanguageSelector.jsx';
import VoiceSelector from './components/VoiceSelector.jsx';
import GenerateButton from './components/GenerateButton.jsx';
import AudioPlayer from './components/AudioPlayer.jsx';
import DownloadButton from './components/DownloadButton.jsx';
import ErrorMessage from './components/ErrorMessage.jsx';
import EndpointCard from './components/EndpointCard.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';

/**
 * Phase 7 — the multi-user product.
 *
 * Auth is OPTIONAL for generation (documented plan choice): anonymous
 * visitors generate exactly as before. Signed-in users additionally get
 * every generation saved to history (replay + download, no re-synthesis)
 * and can favorite voices (★).
 */

const FALLBACK_LIMITS = {
  maxTextLength: 4000,
  defaultLanguage: 'en-US',
  audioFormat: 'mp3',
  audioMimeType: 'audio/mpeg',
  rateLimit: { maxRequests: 10, windowMinutes: 15 },
};

export default function App() {
  // catalog + contract
  const [contract, setContract] = useState(null);
  const [health, setHealth] = useState(null);
  const [ttsProvider, setTtsProvider] = useState('mock');
  const [voices, setVoices] = useState(null);
  const [voicesError, setVoicesError] = useState(null);

  // auth (Phase 7)
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [favorites, setFavorites] = useState(() => new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // form state
  const [text, setText] = useState('');
  const [language, setLanguage] = useState(FALLBACK_LIMITS.defaultLanguage);
  const [voice, setVoice] = useState('');

  // generation state
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState(null);
  const [error, setError] = useState(null);

  const audioUrlRef = useRef(null);

  const limits = contract?.limits ?? FALLBACK_LIMITS;
  const languages = useMemo(
    () => (voices ? [...new Set(voices.map((v) => v.language))] : []),
    [voices],
  );
  const voiceOptions = useMemo(
    () => (voices ? voices.filter((v) => v.language === language) : []),
    [voices, language],
  );

  // ── initial load: catalog, contract, health, session restore ──────
  useEffect(() => {
    let cancelled = false;

    getVoices()
      .then((list) => {
        if (cancelled) return;
        setVoices(list);
        const langs = [...new Set(list.map((v) => v.language))];
        setLanguage((cur) => (langs.includes(cur) ? cur : (langs[0] ?? cur)));
      })
      .catch((err) => !cancelled && setVoicesError({ message: err.message, status: err.status }));

    fetch('/api/contract')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => !cancelled && setContract(data))
      .catch(() => {});

    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        setHealth(data.status === 'ok' ? 'ok' : 'down');
        setTtsProvider(data.tts?.provider ?? 'mock');
      })
      .catch(() => !cancelled && setHealth('down'));

    // restore session from a stored token (validates it server-side)
    const stored = getStoredToken();
    if (stored) {
      fetchMe(stored)
        .then((u) => !cancelled && setSession(stored, u))
        .catch(() => setStoredToken(null)); // dead token → stay anonymous
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the selected voice valid for the selected language (test 4.4)
  useEffect(() => {
    if (voices && !voiceOptions.some((v) => v.id === voice)) {
      setVoice(voiceOptions[0]?.id ?? '');
    }
  }, [voices, voiceOptions, voice]);

  function setSession(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
    setStoredToken(newToken);
    if (newToken) {
      fetchHistory(newToken).then(setHistory).catch(() => setHistory([]));
      fetchFavorites(newToken)
        .then((ids) => setFavorites(new Set(ids)))
        .catch(() => setFavorites(new Set()));
    }
  }

  async function handleAuth(mode, email, password) {
    const data = mode === 'login' ? await login(email, password) : await register(email, password);
    setSession(data.token, data.user);
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    setHistory([]);
    setFavorites(new Set());
    setFavoritesOnly(false);
    setStoredToken(null);
  }

  function clearAudio() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudio(null);
  }

  useEffect(() => () => clearAudio(), []); // revoke on unmount

  function handleTextChange(value) {
    setText(value);
    if (audio) clearAudio();
  }

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    clearAudio();
    try {
      const { blob, provider } = await synthesizeSpeech({
        text: text.trim(),
        language,
        voice,
        token,
      });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudio({ url, sizeKb: (blob.size / 1024).toFixed(1), provider });
      if (token) fetchHistory(token).then(setHistory).catch(() => {}); // refresh history
    } catch (err) {
      setError({ message: err.message, status: err.status });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteHistory(id) {
    setDeletingId(id);
    try {
      await deleteHistoryItem(token, id);
      setHistory((h) => h.filter((g) => g.id !== id));
    } catch (err) {
      setError({ message: err.message, status: err.status });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleFavorite(voiceId) {
    if (!token || !voiceId) return;
    try {
      if (favorites.has(voiceId)) {
        await removeFavorite(token, voiceId);
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(voiceId);
          return next;
        });
      } else {
        await addFavorite(token, voiceId);
        setFavorites((prev) => new Set(prev).add(voiceId));
      }
    } catch (err) {
      setError({ message: err.message, status: err.status });
    }
  }

  const canGenerate = !busy && text.trim().length > 0 && Boolean(voice);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-badge">Phase 7 · Accounts, History &amp; Favorites</div>
        <h1>
          <span className="hero-icon" aria-hidden="true">🔊</span> Text-to-Speech Studio
        </h1>
        <p className="hero-sub">
          Type text, pick a language and voice, generate speech, play it and download the MP3. Sign in to
          keep a history of your generations and favorite voices — or stay anonymous.
        </p>
        <div className="status-row">
          <div className="pill-row">
            {health === 'ok' && <span className="pill pill-ok">● API online</span>}
            {health === 'down' && <span className="pill pill-err">● API unreachable</span>}
            {health === null && <span className="pill pill-wait">● Connecting to API…</span>}
            {contract && <span className="pill pill-ok">contract v{contract.version}</span>}
            {user && <span className="pill pill-ok">👤 {user.email}</span>}
          </div>
        </div>
      </header>

      {error && (
        <div className="panel error-panel">
          <ErrorMessage error={error} />
        </div>
      )}

      <AuthPanel user={user} onLogin={handleAuth} onLogout={handleLogout} />

      <section className="panel studio" aria-label="Speech studio">
        <div className="panel-head">
          <h2>🎙️ Speech studio</h2>
          <span className="tag">
            {voicesError
              ? 'catalog unavailable'
              : voices
                ? `${voices.length} voices · ${languages.length} languages · ${ttsProvider} provider`
                : 'loading voices…'}
          </span>
        </div>

        <TextInput value={text} onChange={handleTextChange} maxChars={limits.maxTextLength} />

        <div className="selectors-row">
          <LanguageSelector
            languages={languages}
            value={language}
            onChange={setLanguage}
            disabled={!voices}
          />
          <VoiceSelector
            voices={voiceOptions}
            value={voice}
            onChange={setVoice}
            disabled={!voices}
            favorites={favorites}
            onToggleFavorite={user ? handleToggleFavorite : undefined}
            favoritesOnly={favoritesOnly}
            onToggleFavoritesFilter={user ? setFavoritesOnly : undefined}
          />
        </div>

        <div className="actions-row">
          <GenerateButton busy={busy} disabled={!canGenerate} onClick={handleGenerate} />
          <span className="muted small">
            {user
              ? 'Signed in — every generation is saved to your history.'
              : ttsProvider === 'mock'
                ? 'Mock provider — a short beep. Set TTS_PROVIDER=espeak for real speech.'
                : `Anonymous generation works too — sign in to keep a history. Provider: ${ttsProvider}.`}
          </span>
        </div>

        {voicesError && <ErrorMessage error={voicesError} />}

        {audio && (
          <div className="result good">
            <div className="result-head">
              <span className="status-chip s200">200</span>
              <strong>
                Audio ready — audio/mpeg · {audio.sizeKb} KB · provider: {audio.provider}
              </strong>
            </div>
            <div className="audio-block">
              <AudioPlayer src={audio.url} />
              <DownloadButton href={audio.url} filename="speech.mp3" />
            </div>
          </div>
        )}
      </section>

      {user && <HistoryPanel generations={history} onDelete={handleDeleteHistory} busyId={deletingId} />}

      {contract && (
        <>
          <section className="limits-grid" aria-label="Locked limits">
            <LimitCard label="Max text length" value={limits.maxTextLength.toLocaleString()} unit="characters" />
            <LimitCard label="Audio format" value={limits.audioFormat.toUpperCase()} unit={limits.audioMimeType} />
            <LimitCard label="Default language" value={limits.defaultLanguage} unit="widest voice coverage" />
            <LimitCard
              label="Rate limit"
              value={limits.rateLimit.maxRequests}
              unit={`requests / IP / ${limits.rateLimit.windowMinutes} min`}
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>📜 API contract — frozen</h2>
              <span className="tag">source of truth: server/src/contract.js</span>
            </div>
            <p className="muted">
              Shapes below are locked. Error shape everywhere:{' '}
              <code>{'{ success: false, error: string }'}</code>.
            </p>
            <div className="endpoints">
              {contract.endpoints.map((ep) => (
                <EndpointCard key={`${ep.method} ${ep.path}`} endpoint={ep} />
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>🗺️ Roadmap</h2>
              <span className="tag">10 phases · Level 1 → 3</span>
            </div>
            <ol className="roadmap">
              {contract.roadmap.map((p) => (
                <li key={p.phase} className={`roadmap-item ${p.status}`}>
                  <span className="phase-num">{p.phase}</span>
                  <span className="phase-name">{p.name}</span>
                  <span className="phase-status">
                    {p.status === 'done' ? '✅ done' : p.status === 'next' ? '→ next up' : 'planned'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <footer className="footer">
        Phase 7 complete · next: <strong>Phase 8 — Advanced (files, AI enhance, admin)</strong> · API keys
        never leave the server
      </footer>
    </div>
  );
}

function LimitCard({ label, value, unit }) {
  return (
    <div className="limit-card">
      <span className="limit-label">{label}</span>
      <span className="limit-value">{value}</span>
      <span className="limit-unit">{unit}</span>
    </div>
  );
}
