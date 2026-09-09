import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { signJwt, verifyJwt, hashPassword, verifyPassword } from '../src/auth.js';

/**
 * Phase 7 — auth: register / login / me (plan tests 7.1, 7.2 + extras).
 * Every group gets a FRESH in-memory database via createApp({ db }).
 */

function freshApp() {
  return createApp({ db: createDb(':memory:') });
}

const EMAIL = 'asha@example.com';
const PASSWORD = 'correct-horse-battery';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/register', () => {
  it('7.1 duplicate email → 409', async () => {
    const app = freshApp();
    const first = await request(app).post('/api/auth/register').send({ email: EMAIL, password: PASSWORD });
    expect(first.status).toBe(201);
    expect(first.body.success).toBe(true);
    expect(first.body.token).toEqual(expect.any(String));
    expect(first.body.user.email).toBe(EMAIL);

    const dup = await request(app).post('/api/auth/register').send({ email: EMAIL, password: 'other-pass-1' });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ success: false, error: 'Email already registered' });
  });

  it('invalid email → 400; short password → 400', async () => {
    const app = freshApp();
    const badEmail = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: PASSWORD });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error).toMatch(/email/i);

    const shortPw = await request(app).post('/api/auth/register').send({ email: 'b@example.com', password: 'short' });
    expect(shortPw.status).toBe(400);
    expect(shortPw.body.error).toMatch(/password/i);
  });

  it('passwords are never stored in plain text (scrypt hash in DB)', async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    const db = createDb(':memory:');
    const app = createApp({ db });
    await request(app).post('/api/auth/register').send({ email: EMAIL, password: PASSWORD });

    const row = db.users.byEmail(EMAIL);
    expect(row.password_hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(row.password_hash).not.toContain(PASSWORD);
  });
});

describe('POST /api/auth/login', () => {
  it('7.2 bad password → 401 (generic message)', async () => {
    const app = freshApp();
    await request(app).post('/api/auth/register').send({ email: EMAIL, password: PASSWORD });

    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Invalid email or password' });
  });

  it('unknown email → 401 with the SAME message (no account enumeration)', async () => {
    const app = freshApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'whatever-1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('happy path → 200 with a working token', async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    const app = freshApp();
    await request(app).post('/api/auth/register').send({ email: EMAIL, password: PASSWORD });

    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(EMAIL);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(EMAIL);
  });
});

describe('auth middleware', () => {
  it('GET /api/history with no token → 401 (plan 7.3)', async () => {
    const app = freshApp();
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Authentication required' });
  });

  it('malformed / garbage token → 401', async () => {
    const app = freshApp();
    const res = await request(app).get('/api/history').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('token signed with a different secret → 401', async () => {
    vi.stubEnv('JWT_SECRET', 'secret-A');
    const app = freshApp();
    // Forge a token with secret-B while the server verifies with secret-A
    vi.stubEnv('JWT_SECRET', 'secret-B');
    const forged = signJwt({ id: 1, email: 'attacker@example.com' });
    vi.stubEnv('JWT_SECRET', 'secret-A');
    const res = await request(app).get('/api/history').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('expired token → 401 (unit + route)', async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    // Hand-build an already-expired token
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    const payload = b64({ sub: 1, email: EMAIL, iat: 1, exp: 2 });
    const crypto = await import('node:crypto');
    const sig = crypto.createHmac('sha256', 'test-secret').update(`${header}.${payload}`).digest('base64url');
    const token = `${header}.${payload}.${sig}`;

    expect(verifyJwt(token)).toBeNull();

    const app = freshApp();
    const res = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('unit: password hash/verify round trip + wrong password rejected', () => {
    const hash = hashPassword(PASSWORD);
    expect(verifyPassword(PASSWORD, hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });
});
