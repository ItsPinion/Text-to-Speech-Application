/**
 * Thin API layer — the only module that knows where the backend lives.
 * In dev, VITE_API_URL is empty and requests use relative /api paths,
 * which the Vite dev server proxies to Express. In production (Phase 9),
 * VITE_API_URL points at the deployed API origin.
 */
import type { Voice } from '@tts/shared'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/** Build an API URL from a path like "/api/health". */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

/** Phase 1 health contract body. */
export interface HealthResponse {
  status: string
}

/**
 * GET /api/health — used by the UI to wait for backend readiness.
 * Resolves only when the server answers 200 with { status: "ok" }.
 */
export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(apiUrl('/api/health'), {
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  const body = (await response.json()) as HealthResponse
  if (body.status !== 'ok') {
    throw new Error('Health check returned an unexpected body')
  }
  return body
}

/**
 * GET /api/voices — the voice catalog (Phase 3). Voice shape is the frozen
 * contract type from @tts/shared: { id, name, language, gender }.
 */
export async function listVoices(signal?: AbortSignal): Promise<Voice[]> {
  const response = await fetch(apiUrl('/api/voices'), {
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Voices request failed with status ${response.status}`)
  }

  const body = (await response.json()) as { voices?: Voice[] }
  if (!Array.isArray(body.voices)) {
    throw new Error('Voices response is missing the voices array')
  }
  return body.voices
}
