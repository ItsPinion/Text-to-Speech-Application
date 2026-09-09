/**
 * client/src/services/api.js — the single place the browser talks to Express.
 *
 *  - voices & speech:  getVoices(), synthesizeSpeech()
 *  - auth (Phase 7):   register(), login(), fetchMe(), token storage
 *  - history (Phase 7): fetchHistory(), deleteHistoryItem()
 *  - favorites (Phase 7): fetchFavorites(), addFavorite(), removeFavorite()
 *
 * Everything goes through the Vite proxy (same-origin /api). Authenticated
 * calls attach "Authorization: Bearer <token>" (the plan's token transport).
 */

export class ApiError extends Error {
  /**
   * @param {string} message  human-readable text (server text when we have it)
   * @param {number} status   HTTP status; 0 = network failure
   */
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const NETWORK_FAILURE = 'Network failure — cannot reach the server';

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new ApiError(NETWORK_FAILURE, 0);
  }
}

// ── token storage ─────────────────────────────────────────────────────
const TOKEN_KEY = 'tts_token';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode etc. — session just won't persist */
  }
}

/** Standard headers for authenticated JSON calls. */
function authHeaders(token, extra = {}) {
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// ── catalog & synthesis ───────────────────────────────────────────────
/** GET /api/voices → array of { id, name, language, gender } */
export async function getVoices() {
  const res = await safeFetch('/api/voices');
  if (!res.ok) {
    throw new ApiError(`Could not load the voice catalog (HTTP ${res.status})`, res.status);
  }
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.voices)) {
    throw new ApiError('Voice catalog came back in an unexpected shape', 0);
  }
  return data.voices;
}

/**
 * POST /api/tts → { blob, provider }.
 * With a token the server also saves the generation to history.
 */
export async function synthesizeSpeech({ text, language, voice, token }) {
  const res = await safeFetch('/api/tts', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text, language, voice }),
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.error || `Request failed (HTTP ${res.status})`, res.status);
    }
    throw new ApiError(`Request failed (HTTP ${res.status})`, res.status);
  }

  if (!contentType.includes('audio/')) {
    throw new ApiError('Unexpected response — no audio in the reply', res.status);
  }

  const blob = await res.blob();
  return { blob, provider: res.headers.get('x-tts-provider') || 'unknown' };
}

// ── auth (Phase 7) ────────────────────────────────────────────────────
async function authCall(path, body) {
  const res = await safeFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (HTTP ${res.status})`, res.status);
  }
  return data; // { success, token, user }
}

export const register = (email, password) => authCall('/api/auth/register', { email, password });
export const login = (email, password) => authCall('/api/auth/login', { email, password });

/** GET /api/auth/me → { id, email }; throws ApiError(401) when the token is dead. */
export async function fetchMe(token) {
  const res = await safeFetch('/api/auth/me', { headers: authHeaders(token) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'Session expired', res.status);
  return data.user;
}

// ── history (Phase 7) ─────────────────────────────────────────────────
export async function fetchHistory(token) {
  const res = await safeFetch('/api/history', { headers: authHeaders(token) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'Could not load history', res.status);
  return data.generations;
}

export async function deleteHistoryItem(token, id) {
  const res = await safeFetch(`/api/history/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || 'Could not delete', res.status);
  }
  return true;
}

// ── favorites (Phase 7) ───────────────────────────────────────────────
export async function fetchFavorites(token) {
  const res = await safeFetch('/api/favorites', { headers: authHeaders(token) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'Could not load favorites', res.status);
  return data.favorites; // string[] of voice ids
}

export async function addFavorite(token, voiceId) {
  const res = await safeFetch('/api/favorites', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ voiceId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'Could not save favorite', res.status);
  return true;
}

export async function removeFavorite(token, voiceId) {
  const res = await safeFetch(`/api/favorites/${encodeURIComponent(voiceId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || 'Could not remove favorite', res.status);
  }
  return true;
}
