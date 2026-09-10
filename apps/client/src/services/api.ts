/**
 * Thin API layer — the only module that knows where the backend lives.
 * In dev, VITE_API_URL is empty and requests use relative /api paths,
 * which the Vite dev server proxies to Express. In production (Phase 9),
 * VITE_API_URL points at the deployed API origin.
 */
import type { TtsRequestBody, Voice } from '@tts/shared'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/** Build an API URL from a path like "/api/health". */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

/** Phase 1 health contract body (Phase 6 adds the secret-free tts field). */
export interface HealthResponse {
  status: string
  /** "mock" | "configured" | "unconfigured" — never carries secrets. */
  tts?: string
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

/**
 * Error thrown by generateSpeech. `status === null` means the request never
 * reached the server (network failure / offline) — the UI maps that to the
 * plan's "network failure" message (test 4.8).
 */
export class ApiError extends Error {
  /** HTTP status, or null when the request never got a response. */
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * POST /api/tts — sends text and resolves the MP3 as a Blob (plan §Phase 4:
 * "fetch/axios with responseType: 'blob'"). Error bodies are parsed as JSON
 * so the server's human message survives (test 4.7); a refused connection
 * becomes ApiError with status null (test 4.8).
 */
export async function generateSpeech(
  body: TtsRequestBody,
  signal?: AbortSignal,
): Promise<Blob> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(apiUrl('/api/tts'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Network failure — cannot reach the API', null)
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const data = (await response.json()) as { error?: string }
      if (typeof data.error === 'string' && data.error.length > 0) message = data.error
    } catch {
      // Non-JSON error body — keep the generic status message.
    }
    throw new ApiError(message, response.status)
  }

  const blob = await response.blob()
  if (blob.size === 0) {
    throw new ApiError('The server returned empty audio', response.status)
  }
  return blob
}

/* ── Phase 7: auth, history, favorites ──────────────────────────────── */

const TOKEN_KEY = 'tts_token'

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode — session simply won't persist.
  }
}

export interface AuthUser {
  id: string
  email: string
}

/** Contract envelope helper: { success: true, ...payload } / { success: false, error }. */
async function parseEnvelope<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean
    error?: string
  }
  if (!response.ok || data.success === false) {
    throw new ApiError(data.error ?? `Request failed with status ${response.status}`, response.status)
  }
  return data as T
}

export async function registerUser(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(apiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await parseEnvelope<{ user: AuthUser }>(response)
  return data.user
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const response = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return parseEnvelope<{ token: string; user: AuthUser }>(response)
}

/** Session restore — resolves null when the stored token is dead. */
export async function fetchCurrentUser(
  token: string,
  signal?: AbortSignal,
): Promise<AuthUser | null> {
  try {
    const response = await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as { user?: AuthUser }
    return data.user ?? null
  } catch {
    return null
  }
}

export interface Generation {
  id: string
  text: string
  language: string
  voice: string
  audioUrl: string
  createdAt: string
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchHistory(signal?: AbortSignal): Promise<Generation[]> {
  const response = await fetch(apiUrl('/api/history'), {
    headers: authHeaders(),
    signal,
  })
  const data = await parseEnvelope<{ generations: Generation[] }>(response)
  return data.generations
}

export async function deleteGeneration(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/history/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok && response.status !== 204) {
    throw new ApiError('Could not delete the generation', response.status)
  }
}

export async function listFavorites(signal?: AbortSignal): Promise<Voice[]> {
  const response = await fetch(apiUrl('/api/favorites'), {
    headers: authHeaders(),
    signal,
  })
  const data = await parseEnvelope<{ favorites: Voice[] }>(response)
  return data.favorites
}

export async function addFavorite(voiceId: string): Promise<void> {
  const response = await fetch(apiUrl('/api/favorites'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ voiceId }),
  })
  await parseEnvelope(response)
}

export async function removeFavorite(voiceId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/favorites/${encodeURIComponent(voiceId)}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok && response.status !== 204) {
    throw new ApiError('Could not remove the favorite', response.status)
  }
}
