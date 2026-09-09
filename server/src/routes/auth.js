import { Router } from 'express';
import { hashPassword, verifyPassword, signJwt, requireAuth } from '../auth.js';

/**
 * Auth routes (Phase 7):
 *   POST /api/auth/register { email, password } → 201 { token, user }
 *   POST /api/auth/login    { email, password } → 200 { token, user }
 *   GET  /api/auth/me       (Bearer)            → 200 { user }
 *
 * Login errors are deliberately generic ("Invalid email or password") so
 * they can't be used to enumerate accounts.
 */
const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ success: false, error: 'A valid email address is required' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ success: false, error: 'Password must be 8–128 characters' });
  }

  const db = req.app.locals.db;
  if (db.users.byEmail(cleanEmail)) {
    return res.status(409).json({ success: false, error: 'Email already registered' });
  }

  const user = db.users.create(cleanEmail, hashPassword(password));
  return res.status(201).json({ success: true, token: signJwt(user), user: { id: user.id, email: user.email } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const db = req.app.locals.db;
  const row = db.users.byEmail(cleanEmail);
  if (!row || !verifyPassword(password ?? '', row.password_hash)) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
  const user = { id: row.id, email: row.email };
  return res.json({ success: true, token: signJwt(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const user = db.users.byId(req.user.id);
  if (!user) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  res.json({ success: true, user: { id: user.id, email: user.email } });
});

export default router;
