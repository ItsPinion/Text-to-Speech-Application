/**
 * Centralised config. Reads the repo-root `.env` (or a `server/.env` if you
 * prefer to keep server vars local). Env vars are the ONLY place secrets live.
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load the first .env we find: server/.env, then repo root .env.
for (const candidate of [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
]) {
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate });
}

const env = process.env.NODE_ENV || 'development';

module.exports = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',

  /** Port the Express server listens on. */
  port: Number.parseInt(process.env.PORT, 10) || 3000,

  /** Browser origins allowed by CORS (comma-separated in CLIENT_ORIGIN). */
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
