import { apiError } from '@tts/shared';

/**
 * Fails closed: any unknown path (inside or outside /api) gets contract-shaped
 * JSON, never an HTML error page. Phase 1 test 1.2.
 */
export function notFoundHandler(req, res) {
  res.status(404).json(apiError('Not found'));
}

/**
 * Last-resort error handler. Deliberately vague — no stack traces, no env
 * details, nothing provider-specific leaks to the client (Phase 5 test 5.4).
 */
// eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
export function errorHandler(err, _req, res, _next) {
  console.error('[server] unhandled error:', err.message);
  res.status(500).json(apiError('Internal server error'));
}
