import { useCallback, useEffect, useState } from 'react'

import type { Voice } from '@tts/shared'

import { listVoices } from '@/services/api'

export interface VoiceCatalog {
  voices: Voice[]
  status: 'loading' | 'ready' | 'error'
  reload: () => void
}

/**
 * Fetches the voice catalog once on mount (Phase 3). Phase 4's language and
 * voice selectors will consume the full list; today the command deck shows
 * the catalog size so the endpoint's liveness is visible in the UI.
 */
export function useVoices(): VoiceCatalog {
  const [voices, setVoices] = useState<Voice[]>([])
  const [status, setStatus] = useState<VoiceCatalog['status']>('loading')
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const controller = new AbortController()

    setStatus('loading')
    listVoices(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setVoices(result)
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setVoices([])
        setStatus('error')
      })

    return () => controller.abort()
  }, [tick])

  return { voices, status, reload }
}
