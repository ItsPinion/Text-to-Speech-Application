/**
 * Thin API client. One base URL, typed per endpoint as the contract grows.
 * In dev, VITE_API_URL is blank and the Vite proxy forwards /api to Express.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** GET /api/health → { status: "ok" } (contract: docs/API.md) */
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
