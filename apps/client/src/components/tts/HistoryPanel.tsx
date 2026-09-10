import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/tts/ErrorMessage'
import { TerminalWindow } from '@/components/ui/TerminalWindow'
import type { AuthState } from '@/hooks/useAuth'
import {
  deleteGeneration,
  fetchHistory,
  type Generation,
} from '@/services/api'
import { findVoiceLabel } from '@/lib/labels'

interface HistoryPanelProps {
  auth: AuthState
}

/** Fired by TtsStudio after every successful generation. */
export const GENERATION_EVENT = 'tts:generated'

/**
 * Phase 7 ARCHIVE terminal — the user's saved generations with replay,
 * download, and delete. Listens for the generation event so new synths
 * appear without a manual refresh; refetches on login.
 */
export function HistoryPanel({ auth }: HistoryPanelProps) {
  const [history, setHistory] = useState<Generation[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.user) return
    setStatus('loading')
    setError(null)
    try {
      setHistory(await fetchHistory())
      setStatus('ready')
    } catch {
      setStatus('error')
      setError('Could not load the archive — the API refused the request.')
    }
  }, [auth.user])

  // Reload on login and after each new generation.
  useEffect(() => {
    if (!auth.user) {
      setHistory([])
      setStatus('idle')
      return
    }
    void load()

    const onGenerated = () => void load()
    window.addEventListener(GENERATION_EVENT, onGenerated)
    return () => window.removeEventListener(GENERATION_EVENT, onGenerated)
  }, [auth.user, load])

  const handleDelete = async (id: string) => {
    try {
      await deleteGeneration(id)
      setHistory((rows) => rows.filter((row) => row.id !== id))
    } catch {
      setError('Delete failed — the row may already be gone.')
    }
  }

  return (
    <TerminalWindow
      title="SYS://ARCHIVE"
      actions={<Badge variant="cyan">GET /api/history</Badge>}
      footer={
        auth.user
          ? `${history.length} GENERATION${history.length === 1 ? '' : 'S'} SAVED · AUDIO REPLAYS FROM THE SERVER`
          : 'LOCKED — SIGN IN VIA SYS://ACCESS TO KEEP YOUR GENERATIONS'
      }
    >
      {!auth.user ? (
        <p className="font-mono text-sm text-chrome/50">
          <span aria-hidden="true" className="text-magenta">
            ⚠{' '}
          </span>
          ARCHIVE LOCKED — anonymous synthesis works, but nothing is kept.
          Sign in to build a replayable library.
        </p>
      ) : status === 'error' ? (
        <ErrorMessage message={error ?? 'Archive unavailable'} onRetry={load} />
      ) : status === 'loading' || status === 'idle' ? (
        <p className="animate-pulse font-mono text-sm text-chrome/50">SYNCING ARCHIVE…</p>
      ) : history.length === 0 ? (
        <p className="font-mono text-sm text-chrome/50">
          <span aria-hidden="true" className="text-cyan">
            &gt;{' '}
          </span>
          EMPTY — generate something in the synth bay above and it lands here.
        </p>
      ) : (
        <ul className="grid gap-4">
          {history.map((row) => (
            <li
              key={row.id}
              className="border border-line bg-black/60 p-4 transition-all duration-200 ease-linear hover:-translate-y-0.5 hover:border-magenta/40"
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="max-w-full truncate font-mono text-sm text-chrome" title={row.text}>
                  <span aria-hidden="true" className="text-cyan">
                    &gt;{' '}
                  </span>
                  {row.text}
                </p>
                <p className="shrink-0 font-mono text-xs uppercase tracking-widest text-chrome/40">
                  {findVoiceLabel(row.voice)} ·{' '}
                  {new Date(row.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <audio
                  controls
                  preload="none"
                  src={row.audioUrl}
                  className="h-10 min-w-0 grow"
                  aria-label={`Replay generation: ${row.text.slice(0, 50)}`}
                />
                <a
                  href={row.audioUrl}
                  download="speech.mp3"
                  className="font-mono text-xs uppercase tracking-widest text-cyan underline decoration-dotted underline-offset-4 hover:text-magenta"
                >
                  ⬇ SAVE
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleDelete(row.id)}
                  aria-label={`Delete generation: ${row.text.slice(0, 50)}`}
                >
                  ✕ DELETE
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </TerminalWindow>
  )
}
