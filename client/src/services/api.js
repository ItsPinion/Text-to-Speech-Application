/**
 * Thin API client — one base URL, one function per contract endpoint.
 * In dev VITE_API_URL is blank and the Vite proxy forwards /api to Express.
 * Contract: docs/API.md
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Error with an HTTP-ish status; status 0 means the network itself failed. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const networkError = (err) =>
  err instanceof TypeError
    ? new ApiError(0, 'Network failure')
    : err;

/** Turn a failed Response into an ApiError, unwrapping the JSON envelope. */
async function toApiError(res) {
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') message = body.error;
  } catch {
    /* non-JSON error body — keep the HTTP status text */
  }
  return new ApiError(res.status, message);
}

/** GET /api/health → { status: "ok" } */
export async function getHealth({ timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/voices → { success, voices: [{ id, name, language, gender }] } */
export async function getVoices() {
  try {
    const res = await fetch(`${API_BASE}/api/voices`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw await toApiError(res);
    const body = await res.json();
    return Array.isArray(body.voices) ? body.voices : [];
  } catch (err) {
    throw networkError(err);
  }
}

/**
 * POST /api/tts → Blob (audio/mpeg).
 * The server streams binary MP3; error responses arrive as JSON, which we
 * unwrap so the UI can show the exact validation message.
 */
export async function synthesize({ text, language, voice }) {
  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, voice }),
    });
    if (!res.ok) throw await toApiError(res);
    return await res.blob();
  } catch (err) {
    throw networkError(err);
  }
}
