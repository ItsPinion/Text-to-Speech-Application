import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { MAX_TEXT_LENGTH } from '@tts/shared';

import { createApp } from '../src/app.js';

const app = createApp({ rateLimit: false }); // existing suites are not rate-limit tests (6.1 has its own suite)

const postJson = (body) =>
  request(app).post('/api/tts').set('Content-Type', 'application/json').send(body);

const expectContractError = (res, status) => {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toContain('application/json');
  expect(res.body.success).toBe(false);
  expect(typeof res.body.error).toBe('string');
};

// ── Test 2.1 ── {} → 400, message about text
// ── Test 2.2 ── { "text": "   " } → 400, empty after trim
// ── Test 2.3 ── 4001 chars → 400, too long
// ── Test 2.4 ── no voice → 400
// ── Test 2.5 ── unsupported language → 400
// ── Test 2.6 ── valid body → 501 (until Phase 3)
// ── Test 2.7 ── Content-Type: text/plain → 415 (plan allows 400 or 415)
describe('POST /api/tts — Phase 2 validation matrix', () => {
  it('2.1 empty object → 400 with a message about text', async () => {
    const res = await postJson({});
    expectContractError(res, 400);
    expect(res.body.error.toLowerCase()).toContain('text');
  });

  it('2.2 whitespace-only text → 400 (empty after trim)', async () => {
    const res = await postJson({ text: '   ' });
    expectContractError(res, 400);
    expect(res.body.error.toLowerCase()).toContain('text');
  });

  it(`2.3 text of ${MAX_TEXT_LENGTH + 1} chars → 400 too long`, async () => {
    const res = await postJson({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1) });
    expectContractError(res, 400);
    expect(res.body.error).toContain(String(MAX_TEXT_LENGTH));
  });

  it('2.4 text without voice → 400', async () => {
    const res = await postJson({ text: 'Hi' });
    expectContractError(res, 400);
    expect(res.body.error.toLowerCase()).toContain('voice');
  });

  it('2.5 unsupported language → 400', async () => {
    const res = await postJson({ text: 'Hi', language: 'xx-ZZ', voice: 'a' });
    expectContractError(res, 400);
    expect(res.body.error.toLowerCase()).toContain('language');
  });

  it('2.6 valid body → 200 audio/mpeg (Phase 3 superseded the 501, plan 3.6)', async () => {
    const res = await postJson({
      text: 'Hello',
      language: 'en-US',
      voice: 'en-US-female-1',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
  });

  it('2.7 Content-Type text/plain → 415 contract JSON', async () => {
    const res = await request(app)
      .post('/api/tts')
      .set('Content-Type', 'text/plain')
      .send('Hello');
    expectContractError(res, 415);
    expect(res.body.error.toLowerCase()).toContain('content-type');
  });
});

describe('POST /api/tts — validation hardening (beyond the matrix)', () => {
  it('malformed JSON → 400 "Invalid JSON body", never HTML', async () => {
    const res = await request(app)
      .post('/api/tts')
      .set('Content-Type', 'application/json')
      .send('{"text": "broken"');
    expectContractError(res, 400);
    expect(res.body.error).toBe('Invalid JSON body');
  });

  it('oversized body (> 64kb) → 413 "Request body too large"', async () => {
    const res = await request(app)
      .post('/api/tts')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(100_000) }));
    expectContractError(res, 413);
    expect(res.body.error).toBe('Request body too large');
  });

  it('non-object JSON body (array) → 400', async () => {
    const res = await postJson(['not', 'an', 'object']);
    expectContractError(res, 400);
  });

  it('non-string text (number) → 400', async () => {
    const res = await postJson({ text: 12345, voice: 'v' });
    expectContractError(res, 400);
  });

  it(`boundary: exactly ${MAX_TEXT_LENGTH} chars is valid → 200`, async () => {
    const res = await postJson({
      text: 'a'.repeat(MAX_TEXT_LENGTH),
      voice: 'en-US-female-1',
    });
    expect(res.status).toBe(200);
  });

  it('language is optional → defaults to en-US, still 200', async () => {
    const res = await postJson({ text: 'Hello', voice: 'en-US-female-1' });
    expect(res.status).toBe(200);
  });

  it('GET /api/tts (unsupported method) → 404 JSON', async () => {
    const res = await request(app).get('/api/tts');
    expectContractError(res, 404);
  });
});
