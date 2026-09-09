/**
 * Frozen API contract — the published source of truth, served at
 * GET /api/contract and rendered by the client dashboard.
 *
 * Numbers live in constants.js; this file shapes them into the contract
 * both teams (and the dashboard) build against.
 *
 * Frozen means: response SHAPES don't change. Additive, non-breaking
 * metadata (allowedLanguages, endpoint state) is updated as
 * implementation lands — reality catching up to the contract, not a
 * shape change.
 */
import {
  MAX_TEXT_LENGTH,
  DEFAULT_LANGUAGE,
  RATE_LIMIT,
  AUDIO,
  ALLOWED_LANGUAGES,
} from './constants.js';

export const LIMITS = {
  maxTextLength: MAX_TEXT_LENGTH,
  defaultLanguage: DEFAULT_LANGUAGE,
  audioFormat: AUDIO.format,
  audioMimeType: AUDIO.mimeType,
  rateLimit: { maxRequests: RATE_LIMIT.maxRequests, windowMinutes: RATE_LIMIT.windowMinutes },
};

export const CONTRACT = {
  name: 'Text-to-Speech Platform API',
  version: '1.0.0',
  frozen: true,
  frozenAt: '2026-09-09',
  status: 'Phase 7 — Level 2: accounts (JWT), saved generations with replay/download, favorite voices; POST /api/tts auth optional (anonymous still works)',
  limits: LIMITS,
  allowedLanguages: ALLOWED_LANGUAGES,
  errorShape: { success: false, error: 'string' },
  endpoints: [
    {
      method: 'POST',
      path: '/api/tts',
      state: 'live',
      purpose: 'Convert text to spoken audio.',
      requestExample: { text: 'Hello', language: 'en-US', voice: 'en-US-female-1' },
      requestFields: [
        { name: 'text', type: 'string', required: true, notes: '1–4,000 characters after trim' },
        { name: 'language', type: 'string', required: true, notes: 'must be in the allow-list (see allowedLanguages)' },
        { name: 'voice', type: 'string', required: true, notes: 'voice id from GET /api/voices; must speak the requested language' },
      ],
      responses: [
        {
          status: 200,
          description: 'Binary MP3 audio (Content-Type: audio/mpeg; the X-TTS-Provider header names the provider — mock beep, offline eSpeak-NG speech, or Google neural speech).',
        },
        { status: 400, description: 'Validation failed — text missing/empty/too long, unsupported language, unknown voice, or voice/language mismatch.', body: { success: false, error: 'Text is required' } },
        { status: 415, description: 'Wrong media type — Content-Type must be application/json.', body: { success: false, error: 'Content-Type must be application/json' } },
        { status: 429, description: 'Rate limit exceeded — 10 POST /api/tts per IP per 15 min. Response includes a Retry-After header and standard RateLimit-* headers.', body: { success: false, error: 'Too many requests' } },
        { status: 500, description: 'Vendor rejected the server API key (details stay in server logs; the key is never exposed).', body: { success: false, error: 'TTS provider authentication failed' } },
        { status: 503, description: 'TTS provider unavailable or timed out.', body: { success: false, error: 'TTS provider unavailable' } },
      ],
    },
    {
      method: 'GET',
      path: '/api/voices',
      state: 'live',
      purpose: 'List available voices for the UI language/voice selectors (16 voices across 8 languages).',
      responses: [
        {
          status: 200,
          description: 'Voice catalog. The language allow-list is derived from this list.',
          body: { voices: [{ id: 'en-US-female-1', name: 'Aria (English, US)', language: 'en-US', gender: 'female' }] },
        },
      ],
    },
    {
      method: 'POST',
      path: '/api/auth/register',
      state: 'live',
      purpose: 'Create an account. Body: { email, password (8–128 chars) }. Auto-issues a JWT.',
      requestExample: { email: 'asha@example.com', password: 'correct-horse' },
      responses: [
        { status: 201, description: 'Account created.', body: { success: true, token: 'jwt', user: { id: 1, email: 'asha@example.com' } } },
        { status: 400, description: 'Invalid email or password length.', body: { success: false, error: 'Password must be 8–128 characters' } },
        { status: 409, description: 'Email already registered.', body: { success: false, error: 'Email already registered' } },
      ],
    },
    {
      method: 'POST',
      path: '/api/auth/login',
      state: 'live',
      purpose: 'Exchange email + password for a JWT (24 h). Errors are generic to prevent account enumeration.',
      requestExample: { email: 'asha@example.com', password: 'correct-horse' },
      responses: [
        { status: 200, description: 'Signed in.', body: { success: true, token: 'jwt', user: { id: 1, email: 'asha@example.com' } } },
        { status: 401, description: 'Bad credentials.', body: { success: false, error: 'Invalid email or password' } },
      ],
    },
    {
      method: 'GET',
      path: '/api/history',
      state: 'live',
      purpose: 'List MY saved generations (auth: Bearer token). POST /api/tts saves here when authenticated.',
      responses: [
        { status: 200, description: 'Newest first, max 100.', body: { success: true, generations: [{ id: 1, text: 'Hello', language: 'en-US', voice: 'en-US-female-1', audioUrl: '/api/audio/<uuid>.mp3', createdAt: '2026-09-09 12:00:00' }] } },
        { status: 401, description: 'Missing/invalid token.', body: { success: false, error: 'Authentication required' } },
      ],
    },
    {
      method: 'DELETE',
      path: '/api/history/:id',
      state: 'live',
      purpose: 'Delete MY generation (row + audio file). Other users\' ids → 404 (no existence leak).',
      responses: [
        { status: 204, description: 'Deleted.' },
        { status: 401, description: 'Missing/invalid token.', body: { success: false, error: 'Authentication required' } },
        { status: 404, description: 'Not yours or does not exist.', body: { success: false, error: 'Generation not found' } },
      ],
    },
    {
      method: 'POST',
      path: '/api/favorites',
      state: 'live',
      purpose: 'Favorite a voice (auth). Body: { voiceId } — must exist in the catalog. Idempotent.',
      requestExample: { voiceId: 'te-IN-female-1' },
      responses: [
        { status: 201, description: 'Favorited.', body: { success: true, voiceId: 'te-IN-female-1' } },
        { status: 400, description: 'Unknown voice id.', body: { success: false, error: 'Unknown voice id. See GET /api/voices' } },
        { status: 401, description: 'Missing/invalid token.', body: { success: false, error: 'Authentication required' } },
      ],
    },
    {
      method: 'GET',
      path: '/api/favorites',
      state: 'live',
      purpose: 'List my favorite voice ids (auth).',
      responses: [
        { status: 200, description: 'Voice ids.', body: { success: true, favorites: ['te-IN-female-1'] } },
      ],
    },
    {
      method: 'DELETE',
      path: '/api/favorites/:voiceId',
      state: 'live',
      purpose: 'Unfavorite a voice (auth).',
      responses: [
        { status: 204, description: 'Removed.' },
        { status: 404, description: 'Was not favorited.', body: { success: false, error: 'Favorite not found' } },
      ],
    },
    {
      method: 'GET',
      path: '/api/audio/:file',
      state: 'live',
      purpose: 'Serve stored generation audio (UUID filenames = unguessable capability URLs).',
      responses: [
        { status: 200, description: 'audio/mpeg file.' },
        { status: 404, description: 'Unknown file (strict UUID.mp3 pattern — no traversal).', body: { success: false, error: 'Not found' } },
      ],
    },
    {
      method: 'GET',
      path: '/api/health',
      state: 'live',
      purpose: 'Liveness probe for ops and the frontend readiness check.',
      responses: [
        { status: 200, description: 'Server is up.', body: { status: 'ok' } },
      ],
    },
  ],
  decisions: [
    { decision: 'Max text length', value: '4,000 characters', why: 'Cheap, matches many TTS vendor quotas' },
    { decision: 'Default language', value: 'en-US', why: 'Widest voice coverage' },
    { decision: 'Audio format', value: 'MP3 (audio/mpeg)', why: 'Plays in all browsers, small files' },
    { decision: 'Audio transport', value: 'Binary stream first; { audioUrl } files optional later', why: 'Phase 3 streams audio; Phase 4+ can add file mode' },
    { decision: 'TTS provider (Level 1)', value: 'mock (CI default) · espeak (real speech, offline, free) · google (neural, needs key)', why: 'Real speech with no credit card; vendors swap behind one port' },
    { decision: 'Rate limit', value: '10 TTS requests / IP / 15 min', why: 'Abuse protection — enforced: 429 + Retry-After (env-tunable via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MINUTES)' },
  ],
  roadmap: [
    { phase: 0, name: 'Foundation & contracts', status: 'done' },
    { phase: 1, name: 'Express skeleton & health', status: 'done' },
    { phase: 2, name: 'Validation layer (no TTS)', status: 'done' },
    { phase: 3, name: 'Mock TTS + audio response', status: 'done' },
    { phase: 4, name: 'React UI — Level 1 complete', status: 'done' },
    { phase: 5, name: 'Real TTS vendor (Google Cloud TTS adapter)', status: 'done' },
    { phase: 6, name: 'Hardening (rate limit, CORS, logging)', status: 'done' },
    { phase: 7, name: 'Auth, history, favorites', status: 'done' },
    { phase: 8, name: 'Advanced (files, AI enhance, admin)', status: 'next' },
    { phase: 9, name: 'Testing campaign & deployment', status: 'planned' },
  ],
};
