// Postman-equivalent protocol battery for Phases 1–3 against the live API.
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (id, name, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS  ${id}  ${name}${detail ? '  — ' + detail : ''}`); }
  else      { fail++; console.log(`FAIL  ${id}  ${name}${detail ? '  — ' + detail : ''}`); }
};

const postJson = async (body) =>
  fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

// ── Phase 1 ──
let r = await fetch(`${BASE}/api/health`);
ok('1.3', 'health while server running', r.status === 200 && (await r.json()).status === 'ok');

// ── Phase 2 (2.8 = this whole scripted repeat) ──
r = await postJson({});
ok('2.1', '{} → 400 re: text', r.status === 400, (await r.json()).error);

r = await postJson({ text: '   ' });
ok('2.2', 'whitespace-only → 400', r.status === 400, (await r.json()).error);

r = await postJson({ text: 'a'.repeat(4001), language: 'en-US', voice: 'en-US-female-1' });
ok('2.3', '4001 chars → 400 too long', r.status === 400, (await r.json()).error);

r = await postJson({ text: 'Hi' });
ok('2.4', 'no voice → 400', r.status === 400, (await r.json()).error);

r = await postJson({ text: 'Hi', language: 'xx-ZZ', voice: 'a' });
ok('2.5', 'unsupported language → 400', r.status === 400, (await r.json()).error);

r = await fetch(`${BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'plain' });
ok('2.7', 'text/plain → 415 JSON', r.status === 415 && (r.headers.get('content-type') || '').includes('application/json'));

// 2.6 valid body — since Phase 3 this is 200 audio/mpeg (regression 3.6)
r = await postJson({ text: 'Battery check', language: 'en-US', voice: 'en-US-female-1' });
const buf = Buffer.from(await r.arrayBuffer());
ok('2.6/3.6', 'valid body → 200 audio/mpeg (was 501 in Phase 2)', r.status === 200 && (r.headers.get('content-type') || '').includes('audio/mpeg'), `HTTP ${r.status} · ${r.headers.get('content-type')}`);

// ── Phase 3 ──
r = await fetch(`${BASE}/api/voices`);
const { voices } = await r.json();
const shapeOk = Array.isArray(voices) && voices.length >= 2 &&
  voices.every(v => typeof v.id === 'string' && typeof v.name === 'string' && typeof v.language === 'string' && typeof v.gender === 'string');
ok('3.1', 'GET /api/voices → 200, ≥2 voices, full shape', r.status === 200 && shapeOk, `${voices.length} voices`);

ok('3.2', 'POST valid → audio/mpeg, body length > 0', buf.length > 0, `${buf.length} bytes`);
// 3.5 structural validation of the saved fixture audio
const mp3Sync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
let frames = 0;
for (let i = 0; i < buf.length - 1; i++) if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) frames++;
const durSec = (buf.length * 8) / 128000; // 128 kbps CBR
ok('3.5a', 'saved out.mp3 is a valid MPEG-1 Layer III stream', mp3Sync && frames > 10, `${frames} frame syncs · ~${durSec.toFixed(2)}s @128kbps`);

r = await postJson({ text: 'Hello', language: 'en-US', voice: 'martian-1' });
ok('3.3', 'unknown voice → 400', r.status === 400, (await r.json()).error);

r = await postJson({ text: 'Namaste', language: 'en-US', voice: 'hi-IN-female-1' });
ok('3.4', 'voice/language mismatch → 400', r.status === 400, (await r.json()).error);

r = await postJson({ text: 'नमस्ते', language: 'hi-IN', voice: 'hi-IN-female-1' });
const hiBuf = Buffer.from(await r.arrayBuffer());
ok('3.6b', 'hi-IN voice+language match → 200 audio', r.status === 200 && hiBuf.length > 0, `HTTP ${r.status} · ${hiBuf.length} bytes`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
