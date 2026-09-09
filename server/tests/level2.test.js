import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

/**
 * Phase 7 — history, favorites, audio storage, ownership (plan 7.3–7.8).
 * Fresh in-memory DB per group; the TTS provider is the fast mock.
 */

vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');

const A = { email: 'asha@example.com', password: 'password-asha' };
const B = { email: 'bharat@example.com', password: 'password-bharat' };
const VALID_TTS = { text: 'Hello history', language: 'en-US', voice: 'en-US-female-1' };

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

async function registerAndLogin(app, creds) {
  const reg = await request(app).post('/api/auth/register').send(creds);
  expect(reg.status).toBe(201);
  return reg.body.token;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');
});

describe('TTS → history round trip (plan 7.5)', () => {
  it('authenticated TTS saves a row; audioUrl is fetchable and byte-identical', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const token = await registerAndLogin(app, A);

    const tts = await request(app)
      .post('/api/tts')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_TTS)
      .parse(binaryParser);
    expect(tts.status).toBe(200);
    expect(tts.headers['content-type']).toMatch(/audio\/mpeg/);

    const history = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body.generations).toHaveLength(1);

    const row = history.body.generations[0];
    expect(row.text).toBe('Hello history');
    expect(row.language).toBe('en-US');
    expect(row.voice).toBe('en-US-female-1');
    expect(row.audioUrl).toMatch(/^\/api\/audio\/[0-9a-f-]{36}\.mp3$/);

    // 7.5: audio_url fetchable → 200 with the SAME bytes
    const audio = await request(app).get(row.audioUrl).parse(binaryParser);
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(audio.body.equals(tts.body)).toBe(true);
  });

  it('anonymous TTS works and saves NOTHING (auth optional — documented choice)', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const token = await registerAndLogin(app, A);

    const anon = await request(app).post('/api/tts').send(VALID_TTS).parse(binaryParser);
    expect(anon.status).toBe(200);
    expect(anon.body.length).toBeGreaterThan(0);

    const history = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`);
    expect(history.body.generations).toHaveLength(0);
  });

  it('7.8 isolation: each user sees only their own generations', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const tokenA = await registerAndLogin(app, A);
    const tokenB = await registerAndLogin(app, B);

    await request(app).post('/api/tts').set('Authorization', `Bearer ${tokenA}`).send(VALID_TTS);
    await request(app).post('/api/tts').set('Authorization', `Bearer ${tokenA}`).send({ ...VALID_TTS, text: 'second' });
    await request(app).post('/api/tts').set('Authorization', `Bearer ${tokenB}`).send({ ...VALID_TTS, text: 'bharat only' });

    const listA = await request(app).get('/api/history').set('Authorization', `Bearer ${tokenA}`);
    const listB = await request(app).get('/api/history').set('Authorization', `Bearer ${tokenB}`);
    expect(listA.body.generations).toHaveLength(2);
    expect(listB.body.generations).toHaveLength(1);
    expect(listB.body.generations[0].text).toBe('bharat only');
    expect(listA.body.generations.map((g) => g.text).join()).not.toContain('bharat only');
  });
});

describe('DELETE /api/history/:id — ownership (plan 7.4)', () => {
  it('user A deleting user B\'s id → 404 (no existence leak)', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const tokenA = await registerAndLogin(app, A);
    const tokenB = await registerAndLogin(app, B);

    await request(app).post('/api/tts').set('Authorization', `Bearer ${tokenB}`).send(VALID_TTS);
    const listB = await request(app).get('/api/history').set('Authorization', `Bearer ${tokenB}`);
    const bId = listB.body.generations[0].id;

    const attack = await request(app).delete(`/api/history/${bId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(attack.status).toBe(404);

    // B's row is untouched
    const stillThere = await request(app).get('/api/history').set('Authorization', `Bearer ${tokenB}`);
    expect(stillThere.body.generations).toHaveLength(1);
  });

  it('owner deletes → 204; row and audio file are gone; second delete → 404', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const token = await registerAndLogin(app, A);

    await request(app).post('/api/tts').set('Authorization', `Bearer ${token}`).send(VALID_TTS);
    const list = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`);
    const { id, audioUrl } = list.body.generations[0];

    const del = await request(app).delete(`/api/history/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const after = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`);
    expect(after.body.generations).toHaveLength(0);

    const audioGone = await request(app).get(audioUrl);
    expect(audioGone.status).toBe(404);

    const again = await request(app).delete(`/api/history/${id}`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(404);
  });

  it('invalid id → 400; no auth → 401', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const noAuth = await request(app).delete('/api/history/1');
    expect(noAuth.status).toBe(401);

    const token = await registerAndLogin(app, A);
    const bad = await request(app).delete('/api/history/abc').set('Authorization', `Bearer ${token}`);
    expect(bad.status).toBe(400);
  });
});

describe('favorites (plan 7.6)', () => {
  it('7.6 unknown voice id → 400', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const token = await registerAndLogin(app, A);
    const res = await request(app).post('/api/favorites').set('Authorization', `Bearer ${token}`).send({ voiceId: 'xx-XX-ghost-9' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown voice/i);
  });

  it('add / list / idempotent add / remove round trip', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const token = await registerAndLogin(app, A);

    const add = await request(app).post('/api/favorites').set('Authorization', `Bearer ${token}`).send({ voiceId: 'te-IN-female-1' });
    expect(add.status).toBe(201);

    // idempotent: same favorite again is fine
    const again = await request(app).post('/api/favorites').set('Authorization', `Bearer ${token}`).send({ voiceId: 'te-IN-female-1' });
    expect(again.status).toBe(201);

    const list = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(list.body.favorites).toEqual(['te-IN-female-1']);

    const remove = await request(app).delete('/api/favorites/te-IN-female-1').set('Authorization', `Bearer ${token}`);
    expect(remove.status).toBe(204);

    const after = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(after.body.favorites).toEqual([]);

    const removeMissing = await request(app).delete('/api/favorites/te-IN-female-1').set('Authorization', `Bearer ${token}`);
    expect(removeMissing.status).toBe(404);
  });

  it('favorites are per-user; no auth → 401', async () => {
    const app = createApp({ db: createDb(':memory:') });
    const noAuth = await request(app).get('/api/favorites');
    expect(noAuth.status).toBe(401);

    const tokenA = await registerAndLogin(app, A);
    const tokenB = await registerAndLogin(app, B);
    await request(app).post('/api/favorites').set('Authorization', `Bearer ${tokenA}`).send({ voiceId: 'hi-IN-male-1' });

    const listB = await request(app).get('/api/favorites').set('Authorization', `Bearer ${tokenB}`);
    expect(listB.body.favorites).toEqual([]);
  });
});

describe('GET /api/audio/:file (Phase 7 storage)', () => {
  it('path traversal attempts → 404, never reads outside uploads/', async () => {
    const app = createApp({ db: createDb(':memory:') });
    for (const evil of ['..%2f..%2fpackage.json', '....//package.json', 'not-a-uuid.mp3', 'sub/dir/file.mp3']) {
      const res = await request(app).get(`/api/audio/${evil}`);
      expect([404, 400]).toContain(res.status);
    }
  });
});
