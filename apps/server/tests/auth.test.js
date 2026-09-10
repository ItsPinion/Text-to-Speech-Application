process.env.DB_PATH = ':memory:';

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

/**
 * Phase 7 — auth matrix (plan 7.1 / 7.2 / 7.3).
 * Each test file gets its own in-memory database (vitest isolates module
 * registries per file).
 */
const app = createApp({ rateLimit: false });

const register = (email, password = 'correct horse battery') =>
  request(app)
    .post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email, password });

const login = (email, password) =>
  request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send({ email, password });

beforeEach(() => {
  // Password hashing is deliberately slow (scrypt) — keep tests honest but quick.
});

// ── Test 7.1 ── duplicate email → 409 ──────────────────────────────
describe('POST /api/auth/register', () => {
  it('7.1 rejects a duplicate email with 409', async () => {
    const first = await register('pilot@tts.dev');
    expect(first.status).toBe(201);
    expect(first.body.success).toBe(true);
    expect(first.body.user.email).toBe('pilot@tts.dev');

    const second = await register('pilot@tts.dev');
    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
  });

  it('normalizes email case for uniqueness', async () => {
    await register('Case@Test.dev');
    const dup = await register('case@test.dev');
    expect(dup.status).toBe(409);
  });

  it('400s on invalid email or short password', async () => {
    expect((await register('not-an-email')).status).toBe(400);
    expect((await register('ok@tts.dev', 'short')).status).toBe(400);
    expect((await register('ok@tts.dev')).status).toBe(201); // 19 chars — fine
  });
});

// ── Test 7.2 ── bad password → 401 ─────────────────────────────────
describe('POST /api/auth/login', () => {
  it('7.2 rejects a wrong password with 401', async () => {
    await register('rider@tts.dev', 'super-secret-9');

    const res = await login('rider@tts.dev', 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Invalid email or password' });
  });

  it('uses the SAME message for unknown emails (no enumeration)', async () => {
    const known = await login('rider@tts.dev', 'wrong-password');
    const unknown = await login('ghost@tts.dev', 'wrong-password');
    expect(known.body.error).toBe(unknown.body.error);
  });

  it('returns a working token on success', async () => {
    await register('valid@tts.dev', 'super-secret-9');
    const res = await login('valid@tts.dev', 'super-secret-9');

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe('valid@tts.dev');

    // The token actually authorizes.
    const history = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(history.status).toBe(200);
  });
});

// ── Test 7.3 ── no token → 401 ─────────────────────────────────────
describe('protected routes without a token', () => {
  it('7.3 rejects GET /api/history with 401', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Authentication required' });
  });

  it('rejects garbage and tampered tokens with 401', async () => {
    const garbage = await request(app)
      .get('/api/history')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(garbage.status).toBe(401);

    const wrongScheme = await request(app)
      .get('/api/history')
      .set('Authorization', 'Basic abcdef');
    expect(wrongScheme.status).toBe(401);
  });

  it('401s favorites too', async () => {
    expect((await request(app).get('/api/favorites')).status).toBe(401);
  });
});
