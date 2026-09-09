import crypto from 'node:crypto';
import { createDb, DEFAULT_DB_PATH } from './db.js';

/**
 * Auth utilities (Phase 7) — zero dependencies beyond node:crypto.
 *
 * - Passwords: scrypt (memory-hard) with a per-user random salt,
 *   constant-time comparison. Format: "scrypt$<saltHex>$<hashHex>"
 * - Tokens: JWT HS256 (hand-rolled — header.payload.signature, base64url,
 *   HMAC-SHA256, constant-time signature check, exp enforced). We only
 *   accept alg=HS256, so alg-confusion attacks are rejected by design.
 *
 * JWT_SECRET comes from env. If unset (dev), a random per-process secret
 * is generated — tokens then die on restart, which is safe-but-annoying,
 * so production should always set one.
 */

const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS ?? 24);

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Dev fallback: random per process (warn once)
  if (!getSecret._warned) {
    console.warn('[auth] JWT_SECRET not set — using a random per-process secret (tokens reset on restart)');
    getSecret._warned = true;
  }
  getSecret._dev ??= crypto.randomBytes(32).toString('hex');
  return getSecret._dev;
}

// ── passwords ─────────────────────────────────────────────────────────
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ── JWT (HS256) ───────────────────────────────────────────────────────
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function signJwt(user) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, email: user.email, iat: now, exp: now + TOKEN_TTL_HOURS * 3600 };
  const unsigned = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}

/**
 * Verify a token → { sub, email, exp } or null (bad signature, wrong alg,
 * expired, malformed).
 */
export function verifyJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  let header;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256') return null; // we only ever sign HS256

  const expected = crypto.createHmac('sha256', getSecret()).update(`${h}.${p}`).digest();
  let actual;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(expected, actual)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  if (typeof payload.sub !== 'number') return null;
  return payload;
}

// ── middleware ────────────────────────────────────────────────────────
/** Parse a bearer token; attach req.user = { id, email } when valid. Never rejects. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    const payload = verifyJwt(token);
    if (payload) req.user = { id: payload.sub, email: payload.email };
  }
  next();
}

/** Require a valid token: 401 with the contract error shape otherwise. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const payload = verifyJwt(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  req.user = { id: payload.sub, email: payload.email };
  next();
}

// ── app-level DI ──────────────────────────────────────────────────────
let sharedDb = null;
/** Default DB handle (file-backed). Tests inject their own via createApp({ db }). */
export function getSharedDb() {
  if (!sharedDb) sharedDb = createDb(process.env.DB_PATH || DEFAULT_DB_PATH);
  return sharedDb;
}
