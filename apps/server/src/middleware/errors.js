import { apiError } from '@tts/shared';

/**
 * Fails closed: any unknown path (inside or outside /api) gets contract-shaped
 * JSON, never an HTML error page. Phase 1 test 1.2.
 */
export function notFoundHandler(req, res) {
  res.status(404).json(apiError('Not found'));
}

/**
 * Last-resort error handler. Two jobs:
 *  1. Keep every failure contract-shaped JSON — including body-parser errors
 *     (malformed JSON → 400, oversized body → 413) that would otherwise
 *     surface as Express's HTML error page.
 *  2. Stay deliberately vague for 500s — no stack traces, no env details,
 *     nothing provider-specific leaks to the client (Phase 5 test 5.4).
 */
// eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
export function errorHandler(err, req, res, _next) {
  const status =
    Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : 500;

  let message = status >= 500 ? 'Internal server error' : 'Invalid request body';
  if (err?.type === 'entity.parse.failed') message = 'Invalid JSON body';
  if (err?.type === 'entity.too.large') message = 'Request body too large';

  if (status >= 500) {
    console.error(
      `[server] unhandled error request_id=${req?.id ?? 'n/a'}:`,
      err?.message ?? err,
    );
  }
  res.status(status).json(apiError(message));
}
