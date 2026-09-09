/**
 * Shared provider error type.
 *
 * `statusCode` is the HTTP status the /api/tts route should return:
 *   500 — server-side misconfiguration (e.g. missing key, engine not installed)
 *   503 — vendor/engine failure (timeout, network, bad response)
 *
 * Messages may contain operational detail (they go to the server log),
 * but must NEVER contain secrets — the route maps them to generic text.
 */
export class ProviderError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = 'ProviderError';
    this.statusCode = statusCode;
  }
}
