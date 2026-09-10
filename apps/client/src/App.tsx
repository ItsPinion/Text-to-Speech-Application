import { AUDIO_FORMAT, DEFAULT_LANGUAGE, MAX_TEXT_LENGTH, RATE_LIMIT } from '@tts/shared'
import type { ReactNode } from 'react'

import { Backdrop } from '@/components/system/Backdrop'
import { CrtOverlay } from '@/components/system/CrtOverlay'
import { TtsStudio } from '@/components/tts/TtsStudio'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { StatusDot } from '@/components/ui/StatusDot'
import { TerminalWindow } from '@/components/ui/TerminalWindow'
import { HEALTH_POLL_MS, useApiHealth } from '@/hooks/useApiHealth'
import type { HealthStatus } from '@/hooks/useApiHealth'
import { useVoices } from '@/hooks/useVoices'

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/health',
    returns: '{ "status": "ok" }',
    codes: '200',
    phase: 'LIVE — PHASE 1',
    live: true,
    liveNote: '▲ LIVE NOW — SEE SYS://HEALTH',
    description: 'Liveness probe. Operators ping it, the UI polls it every 10s.',
  },
  {
    method: 'GET',
    path: '/api/voices',
    returns: '{ "voices": […] }',
    codes: '200',
    phase: 'LIVE — PHASE 3',
    live: true,
    liveNote: '▲ CATALOG LIVE — SEE VOICES READOUT',
    description: 'Voice catalog — id, name, language, gender. Drives the future selectors.',
  },
  {
    method: 'POST',
    path: '/api/tts',
    returns: 'audio/mpeg BYTES',
    codes: '200 · 400 · 415 · 413 · 503',
    phase: 'LIVE — PHASE 3',
    live: true,
    liveNote: '▲ SYNTHESIS LIVE — TRY THE SYNTH BAY',
    description: 'Text in, MP3 bytes out. The vendor key never leaves the server.',
  },
] as const

const STATUS_TONE: Record<HealthStatus, 'cyan' | 'magenta' | 'sunset'> = {
  checking: 'sunset',
  online: 'cyan',
  offline: 'magenta',
}

const STATUS_LABEL: Record<HealthStatus, string> = {
  checking: 'SYNCING',
  online: 'ONLINE',
  offline: 'OFFLINE',
}

/** Blinking terminal block cursor. */
function TermCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-1 inline-block h-[0.9em] w-[0.55em] translate-y-[2px] animate-blink bg-cyan"
    />
  )
}

function ReadoutRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line/70 py-2.5 last:border-b-0">
      <dt className="shrink-0 font-mono text-xs uppercase tracking-widest text-chrome/50">
        {label}
      </dt>
      <dd className="text-right font-mono text-sm text-chrome">{value}</dd>
    </div>
  )
}

export default function App() {
  const health = useApiHealth()
  const voices = useVoices()
  const isOnline = health.status === 'online'

  return (
    <div className="min-h-dvh">
      <Backdrop />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
        <a
          href="/"
          className="font-heading text-xl font-black uppercase tracking-widest sm:text-2xl"
        >
          <span className="text-cyan text-glow-cyan">TTS://</span>
          <span className="text-magenta text-glow-magenta">TERMINAL</span>
        </a>
        <div className="flex items-center gap-3">
          <Badge variant="muted">PHASE 0–6 · LEVEL 1+</Badge>
          <Badge variant={STATUS_TONE[health.status]}>
            <StatusDot tone={STATUS_TONE[health.status]} pulse={health.status !== 'checking'} />
            API {STATUS_LABEL[health.status]}
          </Badge>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="pb-16 pt-12 text-center sm:pt-16">
          <p className="mb-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-sunset">
            <span aria-hidden="true">&gt;</span> VOICE_SYNTHESIS_PLATFORM — BUILD v0.1.0
            <TermCursor />
          </p>
          <h1 className="font-heading text-4xl font-black uppercase leading-[1.08] sm:text-6xl md:text-7xl">
            <span className="text-chrome text-glow-white">GIVE YOUR</span>
            <br />
            <span className="text-gradient-sunset text-glow-magenta">TEXT A VOICE</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl font-mono text-base leading-relaxed text-chrome/70 md:text-lg">
            React → Express → speech. The synth bay below is live: type text,
            pick a language and voice, and generate MP3 audio against the
            Express API.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' })}
            >
              OPEN SYNTH BAY
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => document.getElementById('system')?.scrollIntoView({ behavior: 'smooth' })}
            >
              SYSTEM STATUS
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => document.getElementById('contract')?.scrollIntoView({ behavior: 'smooth' })}
            >
              VIEW CONTRACT
            </Button>
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-chrome/60">
            <StatusDot tone={isOnline ? 'cyan' : 'magenta'} />
            {isOnline ? 'ALL SYSTEMS NOMINAL' : 'AWAITING SIGNAL…'}
          </p>
        </section>

        {/* ── Synth bay — the product (Phase 4) ────────────────── */}
        <section id="studio" aria-label="Synth bay" className="scroll-mt-6 pb-16 sm:pb-20">
          <TtsStudio />
        </section>

        {/* ── Live status + frozen spec ────────────────────────── */}
        <section id="system" aria-label="System status" className="grid gap-8 md:grid-cols-2">
          <TerminalWindow
            title="SYS://HEALTH"
            actions={<Badge variant="cyan">GET /api/health</Badge>}
            footer={`POLLING EVERY ${HEALTH_POLL_MS / 1000}S · VITE PROXY → EXPRESS :3000`}
          >
            <div role="status" aria-live="polite">
              <dl>
                <ReadoutRow
                  label="STATUS"
                  value={
                    <span
                      className={
                        health.status === 'online'
                          ? 'text-cyan text-glow-cyan'
                          : health.status === 'offline'
                            ? 'text-magenta'
                            : 'text-sunset'
                      }
                    >
                      {STATUS_LABEL[health.status]}
                    </span>
                  }
                />
                <ReadoutRow
                  label="LATENCY"
                  value={health.latencyMs != null ? `${health.latencyMs} MS` : '——'}
                />
                <ReadoutRow
                  label="LAST CHECK"
                  value={health.lastCheckedAt?.toLocaleTimeString() ?? '——'}
                />
                <ReadoutRow
                  label="TTS ENGINE"
                  value={
                    health.status !== 'online' ? (
                      '——'
                    ) : health.provider === 'configured' ? (
                      <span className="text-sunset">VENDOR — KEY SET</span>
                    ) : health.provider === 'unconfigured' ? (
                      <span className="text-magenta">VENDOR — NO KEY</span>
                    ) : (
                      <span className="text-cyan text-glow-cyan">MOCK FIXTURES</span>
                    )
                  }
                />
                <ReadoutRow label="CHECKS" value={health.checks} />
              </dl>
              <Button
                variant="outline"
                size="sm"
                className="mt-5"
                onClick={health.recheck}
                disabled={health.status === 'checking'}
              >
                FORCE SCAN
              </Button>
            </div>
          </TerminalWindow>

          <TerminalWindow
            title="SYS://SPEC"
            actions={<Badge variant="magenta">CONTRACT v1</Badge>}
            footer="FROZEN IN PHASE 0 · SHARED VIA @tts/shared"
          >
            <dl>
              <ReadoutRow
                label="VOICES"
                value={
                  voices.status === 'ready' ? (
                    <span className="text-cyan text-glow-cyan">
                      {voices.voices.length} ONLINE ·{' '}
                      {new Set(voices.voices.map((v) => v.language)).size} LANGS
                    </span>
                  ) : voices.status === 'loading' ? (
                    'SYNCING…'
                  ) : (
                    <button
                      type="button"
                      onClick={voices.reload}
                      className="text-magenta underline decoration-dotted underline-offset-4 hover:text-cyan"
                    >
                      CATALOG LOST — RESCAN
                    </button>
                  )
                }
              />
              <ReadoutRow label="MAX TEXT" value={`${MAX_TEXT_LENGTH.toLocaleString('en-US')} CHARS`} />
              <ReadoutRow label="DEFAULT LANG" value={DEFAULT_LANGUAGE} />
              <ReadoutRow label="AUDIO FORMAT" value={AUDIO_FORMAT} />
              <ReadoutRow
                label="RATE LIMIT"
                value={`${RATE_LIMIT.max} REQ / ${RATE_LIMIT.windowMs / 60_000} MIN / IP`}
              />
              <ReadoutRow label="TTS PROVIDER" value="MOCK → VENDOR @ PHASE 5" />
            </dl>
          </TerminalWindow>
        </section>

        {/* ── API contract ─────────────────────────────────────── */}
        <section id="contract" className="py-16 sm:py-20" aria-label="API contract">
          <h2 className="font-heading text-2xl font-black uppercase tracking-wide text-chrome text-glow-white md:text-3xl">
            API CONTRACT
          </h2>
          <p className="mb-8 mt-2 font-mono text-sm text-chrome/60">
            &gt; FROZEN IN PHASE 0 — CLIENT &amp; SERVER SPEAK THE SAME LANGUAGE
          </p>
          <div className="grid gap-8 md:grid-cols-3">
            {ENDPOINTS.map((endpoint) => (
              <Card key={endpoint.path}>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant={endpoint.method === 'GET' ? 'cyan' : 'magenta'}>
                    {endpoint.method}
                  </Badge>
                  <span className="font-mono text-xs text-chrome/50">{endpoint.phase}</span>
                </div>
                <CardTitle className="mt-4 font-mono text-base font-normal normal-case tracking-normal">
                  {endpoint.path}
                </CardTitle>
                <CardDescription>{endpoint.description}</CardDescription>
                <CardContent>
                  <p className="font-mono text-xs text-cyan/80">→ {endpoint.returns}</p>
                  <p className="mt-1 font-mono text-xs text-chrome/50">CODES: {endpoint.codes}</p>
                  {endpoint.live && (
                    <p className="mt-2 font-mono text-xs text-sunset">
                      ▲ LIVE NOW — SEE SYS://HEALTH
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-10 pt-2 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 font-mono text-xs text-chrome/50">
          <span>&gt; BUILD PHASE 0–6 · HARDENED · SECRETS STAY SERVER-SIDE</span>
          <span className="flex items-center gap-2">
            <StatusDot tone={isOnline ? 'cyan' : 'magenta'} />
            {isOnline ? 'ALL SYSTEMS NOMINAL' : 'AWAITING SIGNAL'}
          </span>
        </div>
      </footer>

      <CrtOverlay />
    </div>
  )
}
