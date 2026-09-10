import { useCallback, useEffect, useState } from 'react'

import { checkHealth } from '@/services/api'

export type HealthStatus = 'checking' | 'online' | 'offline'

export interface ApiHealth {
  status: HealthStatus
  latencyMs: number | null
  lastCheckedAt: Date | null
  checks: number
  recheck: () => void
}

/** How often the UI polls GET /api/health. */
export const HEALTH_POLL_MS = 10_000

/**
 * Polls the backend health endpoint so the UI can wait for readiness
 * (Phase 1: "Frontend can wait for backend readiness"). Self-reschedules
 * after each attempt and exposes a manual recheck for the FORCE SCAN button.
 */
export function useApiHealth(pollMs: number = HEALTH_POLL_MS): ApiHealth {
  const [status, setStatus] = useState<HealthStatus>('checking')
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  const [checks, setChecks] = useState(0)
  const [tick, setTick] = useState(0)

  const recheck = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      const startedAt = performance.now()
      try {
        await checkHealth(controller.signal)
        setStatus('online')
        setLatencyMs(Math.round(performance.now() - startedAt))
      } catch {
        if (controller.signal.aborted) return
        setStatus('offline')
        setLatencyMs(null)
      } finally {
        if (!controller.signal.aborted) {
          setLastCheckedAt(new Date())
          setChecks((n) => n + 1)
          timer = setTimeout(poll, pollMs)
        }
      }
    }

    void poll()

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [pollMs, tick])

  return { status, latencyMs, lastCheckedAt, checks, recheck }
}
