import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

/**
 * Phase 7 auth primitives — scrypt password hashing (Node built-in, memory-
 * hard, recommended over bcrypt by Node docs) + HS256 JWTs. The secret lives
 * in env (JWT_SECRET); a dev-only fallback is allowed but screams about it.
 */

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, KEY_LENGTH);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return (
    actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
  );
}

/** @returns {{ token: string, expiresIn: string }} */
export function signToken(user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, {
    expiresIn: '7d',
  });
  return { token, expiresIn: '7d' };
}

/** @returns {{ sub: string, email: string } | null} payload or null */
export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
}

export function newId() {
  return randomUUID();
}
