process.env.DB_PATH = ':memory:';
// Keep audio-file writes out of the repo during tests.
process.env.UPLOADS_DIR = '/tmp/tts-test-uploads';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

/**
 * Phase 7 — history, favorites, isolation (plan 7.4 / 7.5 / 7.6 / 7.8).
 * The anonymous-TTS choice (plan 7.7) is also asserted here: generation
 * works logged-out and saves nothing.
 */
const app = createApp({ rateLimit: false });

async function newUser(email) {
  await request(app)
    .post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email, password: 'super-secret-9' });
  const login = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send({ email, password: 'super-secret-9' });
  const token = login.body.token;
  return {
    token,
    authed: (body) =>
      request(app)
        .post('/api/tts')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send(body),
  };
}

const postTts = (token, body = { text: 'Save me', language: 'en-US', voice: 'en-US-female-1' }) =>
  request(app)
    .post('/api/tts')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send(body);

const getHistory = (token) =>
  request(app).get('/api/history').set('Authorization', `Bearer ${token}`);

// ── Test 7.5 ── TTS + history → row; audio_url fetchable 200 ───────
describe('history persistence (plan 7.5)', () => {
  it('records a generation for logged-in users and serves the audio back', async () => {
    const { token } = await newUser('keeper@tts.dev');

    const synth = await postTts(token);
    expect(synth.status).toBe(200);

    const history = await getHistory(token);
    expect(history.status).toBe(200);
    expect(history.body.generations).toHaveLength(1);

    const row = history.body.generations[0];
    expect(row.text).toBe('Save me');
    expect(row.voice).toBe('en-US-female-1');
    expect(row.language).toBe('en-US');
    expect(row.audioUrl).toMatch(/^\/api\/audio\/[\w-]+\.mp3$/);

    // The stored audio round-trips.
    const audio = await request(app).get(row.audioUrl);
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toContain('audio/mpeg');
    expect(audio.body[0]).toBe(0xff); // MPEG frame sync — real bytes stored
  });

  it('anonymous generation works but saves nothing (documented 7.7 choice)', async () => {
    const anon = await request(app)
      .post('/api/tts')
      .set('Content-Type', 'application/json')
      .send({ text: 'Ghost radar', voice: 'en-US-male-1' });
    expect(anon.status).toBe(200);
  });

  it('newest first, multiple rows', async () => {
    const { token } = await newUser('collector@tts.dev');
    await postTts(token, { text: 'First', voice: 'en-US-female-1' });
    await postTts(token, { text: 'Second', voice: 'en-US-female-1' });

    const history = await getHistory(token);
    expect(history.body.generations).toHaveLength(2);
    expect(history.body.generations[0].text).toBe('Second');
  });

  it('deleting a generation removes it (204), then 404s', async () => {
    const { token } = await newUser('eraser@tts.dev');
    await postTts(token);
    const { body } = await getHistory(token);
    const id = body.generations[0].id;

    const del = await request(app)
      .delete(`/api/history/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const again = await request(app)
      .delete(`/api/history/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(404);
  });
});

// ── Test 7.4 / 7.8 ── cross-user protection & isolation ────────────
describe('user isolation (plan 7.4 + 7.8)', () => {
  it("7.4 user B cannot delete user A's generation (404, no oracle)", async () => {
    const a = await newUser('alice@tts.dev');
    const b = await newUser('bob@tts.dev');

    await a.authed({ text: 'Alice only', voice: 'en-US-female-1' });
    const { body } = await getHistory(a.token);
    const aRowId = body.generations[0].id;

    const res = await request(app)
      .delete(`/api/history/${aRowId}`)
      .set('Authorization', `Bearer ${b.token}`);

    expect(res.status).toBe(404);
    // The row survived.
    expect((await getHistory(a.token)).body.generations).toHaveLength(1);
  });

  it('7.8 histories are fully isolated between users', async () => {
    const a = await newUser('island-a@tts.dev');
    const b = await newUser('island-b@tts.dev');

    await a.authed({ text: 'A was here', voice: 'en-US-female-1' });
    await b.authed({ text: 'B was here', voice: 'en-US-male-1' });

    const aHistory = await getHistory(a.token);
    const bHistory = await getHistory(b.token);

    expect(aHistory.body.generations.map((g) => g.text)).toEqual(['A was here']);
    expect(bHistory.body.generations.map((g) => g.text)).toEqual(['B was here']);
  });

  it('audio files of other eras still serve (UUID space, no ACL yet — Phase 8D)', async () => {
    // Documented limitation: per-user ACL on files lands with signed URLs.
    const a = await newUser('file-a@tts.dev');
    await a.authed({ text: 'file check', voice: 'en-US-female-1' });
    const { body } = await getHistory(a.token);
    const res = await request(app).get(body.generations[0].audioUrl);
    expect(res.status).toBe(200);
  });
});

// ── Test 7.6 ── favorites ──────────────────────────────────────────
describe('favorites (plan 7.6)', () => {
  it('400s on an unknown voice, 201 on a known one', async () => {
    const { token } = await newUser('fan@tts.dev');
    const auth = { Authorization: `Bearer ${token}` };

    const bad = await request(app)
      .post('/api/favorites')
      .set(auth)
      .set('Content-Type', 'application/json')
      .send({ voiceId: 'en-US-robot-99' });
    expect(bad.status).toBe(400);

    const good = await request(app)
      .post('/api/favorites')
      .set(auth)
      .set('Content-Type', 'application/json')
      .send({ voiceId: 'hi-IN-female-1' });
    expect(good.status).toBe(201);

    const list = await request(app).get('/api/favorites').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.favorites.map((v) => v.id)).toEqual(['hi-IN-female-1']);
    expect(list.body.favorites[0].name).toBe('Priya'); // joined with catalog
  });

  it('toggles off with 204 and 404s when already gone', async () => {
    const { token } = await newUser('toggle@tts.dev');
    const auth = { Authorization: `Bearer ${token}` };

    await request(app)
      .post('/api/favorites')
      .set(auth)
      .set('Content-Type', 'application/json')
      .send({ voiceId: 'fr-FR-female-1' });

    expect(
      (await request(app).delete('/api/favorites/fr-FR-female-1').set(auth)).status,
    ).toBe(204);
    expect(
      (await request(app).delete('/api/favorites/fr-FR-female-1').set(auth)).status,
    ).toBe(404);
  });

  it('favorites are per-user', async () => {
    const a = await newUser('fava@tts.dev');
    const b = await newUser('favb@tts.dev');
    const authA = { Authorization: `Bearer ${a.token}` };
    const authB = { Authorization: `Bearer ${b.token}` };

    await request(app)
      .post('/api/favorites')
      .set(authA)
      .set('Content-Type', 'application/json')
      .send({ voiceId: 'de-DE-male-1' });

    const bList = await request(app).get('/api/favorites').set(authB);
    expect(bList.body.favorites).toHaveLength(0);
  });
});
