import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Atmosphere from './components/Atmosphere';
import Scanlines from './components/Scanlines';
import TerminalWindow from './components/TerminalWindow';
import TextInput from './components/TextInput';
import LanguageSelector from './components/LanguageSelector';
import VoiceSelector from './components/VoiceSelector';
import GenerateButton from './components/GenerateButton';
import AudioPlayer from './components/AudioPlayer';
import DownloadButton from './components/DownloadButton';
import ErrorMessage from './components/ErrorMessage';
import { getHealth, getVoices, synthesize } from './services/api';
import { DEFAULT_LANGUAGE, uniqueLanguages } from './utils/languages';
import { MAX_TEXT_LENGTH } from './utils/textStats';

/**
 * Phase 4 — the Level-1 workspace (spec §32):
 * text + counts → language → voice → generate → player → download → errors.
 * All speech data comes from the API; the browser never sees any key.
 */
export default function App() {
  // catalog
  const [voices, setVoices] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  // form
  const [text, setText] = useState('');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [voiceId, setVoiceId] = useState('');
  // synthesis
  const [generating, setGenerating] = useState(false);
  const [ttsError, setTtsError] = useState(null);
  const [audio, setAudio] = useState(null);
  // footer uplink readout
  const [uplink, setUplink] = useState('checking');
  const audioUrlRef = useRef(null);

  // ── catalog + uplink on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getVoices();
        if (cancelled) return;
        setVoices(list);
        // default to the first voice on the default channel
        const first =
          list.find((v) => v.language === DEFAULT_LANGUAGE) ?? list[0];
        if (first) setVoiceId(first.id);
      } catch (err) {
        if (!cancelled) setCatalogError(err);
      }
    })();
    (async () => {
      try {
        await getHealth();
        if (!cancelled) setUplink('online');
      } catch {
        if (!cancelled) setUplink('offline');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── editing text invalidates the previous synthesis ──────────
  const revokeAudio = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudio(null);
    setTtsError(null);
  }, []);

  const handleTextChange = useCallback(
    (next) => {
      setText(next);
      if (audioUrlRef.current) revokeAudio();
    },
    [revokeAudio]
  );

  useEffect(() => () => revokeAudio(), [revokeAudio]);

  // ── derived catalog views ────────────────────────────────────
  const languages = useMemo(() => uniqueLanguages(voices), [voices]);
  const channelVoices = useMemo(
    () => voices.filter((v) => v.language === language),
    [voices, language]
  );

  const handleLanguageChange = useCallback(
    (code) => {
      setLanguage(code);
      // reset the voice if it does not exist on the new channel
      const stillValid = voices.some(
        (v) => v.id === voiceId && v.language === code
      );
      if (!stillValid) {
        const first = voices.find((v) => v.language === code);
        setVoiceId(first ? first.id : '');
      }
    },
    [voices, voiceId]
  );

  // ── generate ─────────────────────────────────────────────────
  const canGenerate =
    text.trim().length > 0 &&
    language !== '' &&
    voiceId !== '' &&
    voices.length > 0 &&
    !generating;

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setTtsError(null);
    try {
      const blob = await synthesize({ text, language, voice: voiceId });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const kb = blob.size > 0 ? `${Math.max(1, Math.round(blob.size / 1024))} KB` : '—';
      const name = voices.find((v) => v.id === voiceId)?.name ?? voiceId;
      setAudio({ url, name, kb });
    } catch (err) {
      setTtsError(err);
    } finally {
      setGenerating(false);
    }
  }, [text, language, voiceId, voices]);

  const uplinkColor =
    uplink === 'online' ? 'text-neon-cyan' : uplink === 'offline' ? 'text-neon-orange' : 'text-neon-magenta';

  return (
    <div className="relative flex min-h-screen flex-col">
      <Atmosphere />
      <Scanlines />

      {/* Top bar */}
      <header className="relative z-10 border-b border-dim-border bg-black/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <p className="font-heading text-sm font-bold uppercase tracking-widest text-chrome sm:text-base">
            TEXT<span className="text-neon-magenta">→</span>SPEECH
            <span className="ml-2 font-mono text-xs font-normal text-chrome/50">
              // TERMINAL v0.4.0
            </span>
          </p>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-chrome/60">
            <span className={`h-2.5 w-2.5 rounded-full ${uplink === 'online' ? 'bg-neon-cyan' : uplink === 'offline' ? 'bg-neon-orange' : 'bg-neon-magenta'} animate-pulse`} aria-hidden="true" />
            <span>PHASE 4 · LEVEL 1</span>
          </div>
        </div>
      </header>

      {/* Workspace */}
      <main className="relative z-10 flex-1 px-4 py-12 sm:py-16">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-10 text-center">
            <h1 className="bg-gradient-to-r from-neon-orange via-neon-magenta to-neon-cyan bg-clip-text font-heading text-3xl font-black uppercase tracking-wider text-transparent drop-shadow-[0_0_30px_rgba(255,0,255,0.6)] sm:text-5xl">
              VOICE SYNTHESIS
            </h1>
            <p className="mt-3 font-mono text-sm uppercase tracking-widest text-chrome/50 sm:text-base">
              &gt; feed text · select channel · transmit
            </p>
          </div>

          <TerminalWindow title="TTS://WORKSPACE">
            <div className="space-y-8">
              {/* STEP 1 — text */}
              <TextInput value={text} onChange={handleTextChange} disabled={generating} />

              <div className="h-px bg-gradient-to-r from-neon-magenta/50 via-dim-border to-transparent" />

              {/* STEP 2 — channel */}
              <section aria-labelledby="channel-label">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <h2
                    id="channel-label"
                    className="group flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-neon-magenta"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 rotate-45 bg-neon-magenta transition-transform duration-200 ease-linear group-hover:rotate-90"
                    />
                    {' STEP_02 :: CHANNEL'}
                  </h2>
                  {voices.length > 0 && (
                    <p className="font-mono text-xs tracking-wider text-chrome/50">
                      VOICES ONLINE: {voices.length}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-5 sm:flex-row">
                  <LanguageSelector
                    languages={languages}
                    value={language}
                    onChange={handleLanguageChange}
                    disabled={Boolean(catalogError)}
                  />
                  <VoiceSelector
                    voices={channelVoices}
                    value={voiceId}
                    onChange={setVoiceId}
                    disabled={Boolean(catalogError)}
                  />
                </div>
                {catalogError && (
                  <div className="mt-3">
                    <ErrorMessage error={catalogError} />
                  </div>
                )}
              </section>

              <div className="h-px bg-gradient-to-r from-neon-magenta/50 via-dim-border to-transparent" />

              {/* STEP 3 — transmit */}
              <section aria-labelledby="transmit-label">
                <h2
                  id="transmit-label"
                  className="group mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-neon-magenta"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rotate-45 bg-neon-magenta transition-transform duration-200 ease-linear group-hover:rotate-90"
                  />
                  {' STEP_03 :: TRANSMIT'}
                </h2>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <GenerateButton
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    loading={generating}
                  />
                  <p className="font-mono text-[11px] uppercase tracking-widest text-chrome/40">
                    {text.trim().length === 0
                      ? '> AWAITING INPUT…'
                      : `> ${text.length}/${MAX_TEXT_LENGTH} CHARS ARMED`}
                  </p>
                </div>

                {ttsError && (
                  <div className="mt-4">
                    <ErrorMessage error={ttsError} />
                  </div>
                )}

                {audio && (
                  <div className="mt-6 space-y-4">
                    <AudioPlayer
                      src={audio.url}
                      meta={`VOICE: ${audio.name} · ${audio.kb} · speech.mp3`}
                    />
                    <DownloadButton src={audio.url} />
                  </div>
                )}
              </section>
            </div>
          </TerminalWindow>
        </div>
      </main>

      {/* Status bar */}
      <footer className="relative z-10 border-t-2 border-dim-border bg-black/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-chrome/40">
          <span>NODE: CLIENT-01</span>
          <span className="text-neon-magenta/70">TTS: MOCK PROVIDER</span>
          <span>
            UPLINK: <span className={uplinkColor}>{uplink}</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
