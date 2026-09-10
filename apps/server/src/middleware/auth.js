import { apiError } from '@tts/shared';

import { verifyToken } from '../services/authService.js';

/**
 * Bearer-token auth middleware (Phase 7).
 *
 * requireAuth — 401 contract JSON when the token is missing/invalid.
 * optionalAuth — attaches req.user when a VALID token is present, otherwise
 * passes through silently. Used by POST /api/tts: the documented plan-7.7
 * choice is "works anonymously; logged-in users get history".
 */
function authenticate(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;

  const payload = verifyToken(header.slice('Bearer '.length).trim());
  if (!payload?.sub) return null;

  return { id: payload.sub, email: payload.email };
}

export function requireAuth(req, res, next) {
  const user = authenticate(req);
  if (!user) {
    return res.status(401).json(apiError('Authentication required'));
  }
  req.user = user;
  next();
}

export function optionalAuth(req, _res, next) {
  req.user = authenticate(req);
  next();
}
