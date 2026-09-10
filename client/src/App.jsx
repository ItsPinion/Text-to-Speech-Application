import { useCallback, useEffect, useState } from 'react';
import Atmosphere from './components/Atmosphere';
import Scanlines from './components/Scanlines';
import TerminalWindow from './components/TerminalWindow';
import Button from './components/Button';
import { getHealth } from './services/api';

/**
 * Phase 0–1 shell: a terminal boot screen that handshakes with the API
 * gateway (GET /api/health). When Phase 4 lands, the workspace replaces
 * this screen — the atmosphere layers, window chrome, and buttons carry over.
 */
const STATUS = {
  checking: {
    label: 'LINKING…',
    accent: 'text-neon-magenta',
    glow: 'drop-shadow-[0_0_30px_rgba(255,0,255,0.6)]',
    led: 'bg-neon-magenta animate-pulse',
  },
  online: {
    label: 'ONLINE',
    accent: 'text-neon-cyan',
    glow: 'drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]',
    led: 'bg-neon-cyan animate-pulse',
  },
  offline: {
    label: 'OFFLINE',
    accent: 'text-neon-orange',
    glow: 'drop-shadow-[0_0_10px_rgba(255,153,0,0.8)]',
    led: 'bg-neon-orange animate-pulse',
  },
};

function describeError(err) {
  if (err.name === 'AbortError') return 'TIMEOUT — gateway did not answer in 5s';
  if (err instanceof TypeError) return 'CONNECTION REFUSED — is the API running? (cd server && npm run dev)';
  return err.message.toUpperCase();
}

export default function App() {
  const [status, setStatus] = useState('checking');
  const [latencyMs, setLatencyMs] = useState(null);
  const [detail, setDetail] = useState(null);

  const runHandshake = useCallback(async () => {
    setStatus('checking');
    setDetail(null);
    const t0 = performance.now();
    try {
      await getHealth();
      setLatencyMs(Math.max(1, Math.round(performance.now() - t0)));
      setStatus('online');
    } catch (err) {
      setLatencyMs(null);
      setDetail(describeError(err));
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    runHandshake();
  }, [runHandshake]);

  const s = STATUS[status];

  return (
    <div className="relative flex min-h-screen flex-col">
      <Atmosphere />
      <Scanlines />

      {/* Top bar */}
      <header className="relative z-10 border-b border-dim-border bg-black/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <p className="font-heading text-sm font-bold uppercase tracking-widest text-chrome sm:text-base">
            TEXT<span className="text-neon-magenta">→</span>SPEECH
            <span className="ml-2 font-mono text-xs font-normal text-chrome/50">
              // TERMINAL v0.1.0
            </span>
          </p>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-chrome/60">
            <span className="h-2.5 w-2.5 rounded-full" aria-hidden="true" />
            <span className={`h-2.5 w-2.5 rounded-full ${s.led}`} aria-hidden="true" />
            <span>PHASE 1</span>
          </div>
        </div>
      </header>

      {/* Boot terminal */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl">
          <h1 className="sr-only">Text-to-Speech platform terminal</h1>

          <TerminalWindow title="GATEWAY — /api/health">
            {/* Boot log */}
            <ul className="space-y-1.5 font-mono text-sm sm:text-base" aria-label="Boot log">
              <li className="animate-boot-reveal text-neon-cyan">
                <span className="text-neon-magenta">&gt;</span> TTS.SYS v0.1.0 — VOICE SYNTHESIS CORE
              </li>
              <li className="animate-boot-reveal text-chrome/70 [animation-delay:120ms]">
                <span className="text-neon-magenta">&gt;</span> NEON SUBSYSTEMS......... <span className="text-neon-cyan">OK</span>
              </li>
              <li className="animate-boot-reveal text-chrome/70 [animation-delay:240ms]">
                <span className="text-neon-magenta">&gt;</span> CRT SCANLINE OVERLAY.... <span className="text-neon-cyan">OK</span>
              </li>
              <li className="animate-boot-reveal text-chrome/70 [animation-delay:360ms]">
                <span className="text-neon-magenta">&gt;</span> API GATEWAY HANDSHAKE...{' '}
                {status === 'checking' ? (
                  <span className="text-neon-magenta">
                    LISTENING
                    <span className="animate-blink">_</span>
                  </span>
                ) : status === 'online' ? (
                  <span className="text-neon-cyan">200 OK ({latencyMs}ms)</span>
                ) : (
                  <span className="text-neon-orange">FAILED</span>
                )}
              </li>
            </ul>

            {/* Status readout */}
            <div
              role="status"
              aria-live="polite"
              className="mt-6 border border-dim-border bg-panel/60 p-5 text-center"
            >
              <p className="font-mono text-xs uppercase tracking-widest text-chrome/50">
                GATEWAY STATUS
              </p>
              <p
                className={`mt-2 font-heading text-4xl font-black uppercase tracking-wider sm:text-5xl ${s.accent} ${s.glow}`}
              >
                {s.label}
              </p>
              <p className="mt-3 min-h-[1.25rem] font-mono text-xs text-chrome/50">
                {status === 'online' && 'UPLINK ESTABLISHED — AWAITING PHASE 2: VALIDATION LAYER'}
                {status === 'offline' && detail}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="font-mono text-xs uppercase tracking-wider text-chrome/40">
                RETRY/RESCAN TO RE-HANDSHAKE
              </p>
              <Button onClick={runHandshake} disabled={status === 'checking'} aria-busy={status === 'checking'}>
                {status === 'checking' ? 'SCANNING' : 'RESCAN'}
              </Button>
            </div>
          </TerminalWindow>
        </div>
      </main>

      {/* Status bar */}
      <footer className="relative z-10 border-t-2 border-dim-border bg-black/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-chrome/40">
          <span>NODE: CLIENT-01</span>
          <span className="text-neon-magenta/70">MOCK TTS SCHED: PHASE 3</span>
          <span>
            UPLINK:{' '}
            <span className={status === 'online' ? 'text-neon-cyan' : 'text-neon-orange'}>
              {status.toUpperCase()}
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
