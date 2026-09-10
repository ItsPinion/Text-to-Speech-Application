import { Router, json } from 'express';
import rateLimit from 'express-rate-limit';

import { apiError, apiSuccess } from '@tts/shared';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword, newId, signToken, verifyPassword } from '../services/authService.js';

/** Auth endpoints get their own (looser) limiter — brute-force resistance. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(apiError('Too many requests')),
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phase 7 auth routes.
 *   POST /api/auth/register {email, password} → 201 {user} · 400 · 409 (7.1)
 *   POST /api/auth/login    {email, password} → 200 {token, user} · 401 (7.2)
 * Login errors are deliberately identical for unknown emails and bad
 * passwords (no account enumeration).
 */
export function createAuthRouter() {
  const router = Router();

  // Auth bodies are tiny (email + password) — a strict local parser.
  router.use(json({ limit: '16kb' }));

  router.post('/auth/register', authLimiter, (req, res) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json(apiError('A valid email is required'));
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json(apiError('Password must be at least 8 characters'));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(normalizedEmail);
    if (existing) {
      return res
        .status(409)
        .json(apiError('An account with this email already exists'));
    }

    const user = {
      id: newId(),
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
    };
    db.prepare(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run(user.id, user.email, hashPassword(password), user.createdAt);

    return res.status(201).json(apiSuccess({ user: { id: user.id, email: user.email } }));
  });

  router.post('/auth/login', authLimiter, (req, res) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json(apiError('Email and password are required'));
    }

    const row = getDb()
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(email.trim().toLowerCase());

    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json(apiError('Invalid email or password'));
    }

    const user = { id: row.id, email: row.email };
    return res.json(apiSuccess({ token: signToken(user).token, user }));
  });

  /** Session restore: a valid token returns its user (client boot). */
  router.get('/auth/me', requireAuth, (req, res) => {
    res.json(apiSuccess({ user: req.user }));
  });

  return router;
}
