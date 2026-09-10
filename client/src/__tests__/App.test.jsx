import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';

/**
 * Phase 4 — RTL tests (plan 4.1–4.9).
 *
 * The global fetch is mocked per test; /api/contract and /api/health get
 * canned responses so the dashboard doesn't interfere with the studio.
 */

const VOICES = [
  { id: 'en-US-female-1', name: 'Aria (English, US)', language: 'en-US', gender: 'female' },
  { id: 'en-US-male-1', name: 'Mason (English, US)', language: 'en-US', gender: 'male' },
  { id: 'hi-IN-female-1', name: 'Kalpana (Hindi)', language: 'hi-IN', gender: 'female' },
  { id: 'hi-IN-male-1', name: 'Rahul (Hindi)', language: 'hi-IN', gender: 'male' },
];

const CONTRACT = {
  version: '1.0.0',
  limits: {
    maxTextLength: 4000,
    defaultLanguage: 'en-US',
    audioFormat: 'mp3',
    audioMimeType: 'audio/mpeg',
    rateLimit: { maxRequests: 10, windowMinutes: 15 },
  },
  allowedLanguages: ['en-US', 'hi-IN'],
  endpoints: [],
  decisions: [],
  roadmap: [],
};

function jsonRes(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => payload,
  };
}

function audioRes() {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h) => {
        const n = h.toLowerCase();
        if (n === 'content-type') return 'audio/mpeg';
        if (n === 'x-tts-provider') return 'mock';
        return null;
      },
    },
    blob: async () => new Blob([new Uint8Array([0xff, 0xfb, 0x50])], { type: 'audio/mpeg' }),
  };
}

/** Install a fetch mock; overrides: voices, tts, login/register results. */
function installFetch({ voices, tts, auth } = {}) {
  const fetchMock = vi.fn(async (url, options) => {
    const method = options?.method ?? 'GET';
    if (url === '/api/voices') return voices ?? jsonRes({ voices: VOICES });
    if (url === '/api/models') return jsonRes({ mms: { te: false, ta: false } });
    if (url === '/api/contract') return jsonRes(CONTRACT);
    if (url === '/api/health') return jsonRes({ status: 'ok', tts: { provider: 'mock', configured: true } });
    if (url === '/api/tts') return tts ? tts() : audioRes();
    if (url === '/api/auth/login' || url === '/api/auth/register') {
      if (auth) return auth(url, options);
      return jsonRes({ success: true, token: 'test-jwt-token', user: { id: 1, email: 'asha@example.com' } });
    }
    if (url === '/api/auth/me') return jsonRes({ success: true, user: { id: 1, email: 'asha@example.com' } });
    if (url === '/api/history')
      return jsonRes({
        success: true,
        generations: [
          { id: 11, text: 'First saved speech', language: 'en-US', voice: 'en-US-female-1', audioUrl: '/api/audio/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp3', createdAt: '2026-09-09 12:00:00' },
          { id: 12, text: 'Telugu saved speech', language: 'te-IN', voice: 'te-IN-female-1', audioUrl: '/api/audio/11111111-2222-3333-4444-555555555555.mp3', createdAt: '2026-09-09 12:05:00' },
        ],
      });
    if (url === '/api/favorites' && method === 'GET') return jsonRes({ success: true, favorites: ['hi-IN-female-1'] });
    if (url === '/api/favorites' && method === 'POST') return jsonRes({ success: true, voiceId: 'en-US-female-1' }, 201);
    if (url.startsWith('/api/favorites/') && method === 'DELETE') return { ok: true, status: 204 };
    if (url.startsWith('/api/history/') && method === 'DELETE') return { ok: true, status: 204 };
    return jsonRes({ success: false, error: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function typeAndGenerate(value = 'Hello') {
  const textarea = await screen.findByLabelText(/text to speak/i);
  fireEvent.change(textarea, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /generate speech/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Phase 4 — studio UI', () => {
  it('4.1 empty textarea → Generate disabled, no TTS network call', async () => {
    const fetchMock = installFetch();
    render(<App />);

    await screen.findByText(/Aria \(English, US\)/); // voices loaded (option text is "name · gender")
    const button = screen.getByRole('button', { name: /generate speech/i });
    expect(button).toBeDisabled();

    const ttsCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/tts');
    expect(ttsCalls).toHaveLength(0);
  });

  it('4.2 typing "Hello world" → 11 characters, 2 words', async () => {
    installFetch();
    render(<App />);

    const textarea = await screen.findByLabelText(/text to speak/i);
    fireEvent.change(textarea, { target: { value: 'Hello world' } });

    expect(screen.getByTestId('char-count')).toHaveTextContent('11 / 4,000 characters');
    expect(screen.getByTestId('word-count')).toHaveTextContent('2 words');
  });

  it('4.3 paste 4,001 chars → capped at 4,000 (4001st char blocked)', async () => {
    installFetch();
    render(<App />);

    const textarea = await screen.findByLabelText(/text to speak/i);
    fireEvent.change(textarea, { target: { value: 'a'.repeat(4001) } });

    expect(screen.getByTestId('char-count')).toHaveTextContent('4,000 / 4,000 characters');
  });

  it('4.4 change language → voice list filters, voice resets to a valid one', async () => {
    installFetch();
    render(<App />);

    const voiceSelect = await screen.findByLabelText(/voice/i);
    expect(voiceSelect.value).toBe('en-US-female-1');
    expect(screen.getByText(/Aria \(English, US\)/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/language/i), { target: { value: 'hi-IN' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/voice/i).value).toBe('hi-IN-female-1');
    });
    // English voices no longer offered
    expect(screen.queryByText(/Aria/)).toBeNull();
    expect(screen.queryByText(/Mason/)).toBeNull();
    expect(screen.getByText('Kalpana (Hindi) · female')).toBeInTheDocument();
  });

  it('4.5 voices API failure → ErrorMessage visible; Generate disabled', async () => {
    installFetch({ voices: jsonRes({ success: false, error: 'boom' }, 500) });
    render(<App />);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load the voice catalog/i);
    expect(screen.getByRole('button', { name: /generate speech/i })).toBeDisabled();
  });

  it('4.6 TTS 200 blob → <audio> appears with blob: src', async () => {
    installFetch();
    render(<App />);

    await typeAndGenerate('Hello');

    const audio = await screen.findByTestId('audio-player');
    expect(audio).toBeInTheDocument();
    expect(audio).toHaveAttribute('src', 'blob:mock-audio');
  });

  it('4.7 TTS 400 → error text parsed from the JSON body', async () => {
    installFetch({
      tts: () => jsonRes({ success: false, error: 'Text cannot be empty' }, 400),
    });
    render(<App />);

    await typeAndGenerate('Hi');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error 400');
    expect(alert).toHaveTextContent('Text cannot be empty');
  });

  it('4.8 network offline → "Network failure" message', async () => {
    installFetch({
      tts: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    render(<App />);

    await typeAndGenerate('Hi');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/network failure/i);
  });

  it('4.9 download link → download attribute + href = blob URL', async () => {
    installFetch();
    render(<App />);

    await typeAndGenerate('Hello');

    const link = await screen.findByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('download', 'speech.mp3');
    expect(link).toHaveAttribute('href', 'blob:mock-audio');
  });

  it('extra: editing text after generation clears the previous audio', async () => {
    installFetch();
    render(<App />);

    await typeAndGenerate('Hello');
    expect(await screen.findByTestId('audio-player')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/text to speak/i), {
      target: { value: 'Something else' },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('audio-player')).toBeNull();
    });
  });

  it('7.7 logged-out Generate works anonymously — no Authorization header sent', async () => {
    const fetchMock = installFetch();
    render(<App />);

    await typeAndGenerate('Anonymous hello');

    const [, options] = fetchMock.mock.calls.find(([u]) => u === '/api/tts');
    expect(options.headers.Authorization).toBeUndefined(); // truly anonymous
    expect(await screen.findByTestId('audio-player')).toBeInTheDocument(); // and it still works
  });

  it('extra: Generate sends the trimmed text with the selected language/voice', async () => {
    const fetchMock = installFetch();
    render(<App />);

    await typeAndGenerate('  Hello world  ');

    const [url, options] = fetchMock.mock.calls.find(([u]) => u === '/api/tts');
    expect(url).toBe('/api/tts');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      text: 'Hello world',
      language: 'en-US',
      voice: 'en-US-female-1',
    });
  });

describe('Phase 7 — auth, history, favorites', () => {
  it('login flow: submit credentials → signed in, token stored, Authorization used afterwards', async () => {
    const fetchMock = installFetch();
    render(<App />);

    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'asha@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    // signed-in state (email appears in both the pill and the panel — assert the button)
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(localStorage.getItem('tts_token')).toBe('test-jwt-token');

    // login request had the right shape
    const [loginUrl, loginOpts] = fetchMock.mock.calls.find(([u]) => u === '/api/auth/login');
    expect(JSON.parse(loginOpts.body)).toEqual({ email: 'asha@example.com', password: 'correct-horse' });

    // history loads for the signed-in user
    expect(await screen.findByText('First saved speech')).toBeInTheDocument();
    expect(screen.getByText('Telugu saved speech')).toBeInTheDocument();

    // subsequent TTS calls carry the token
    await typeAndGenerate('Hello again');
    const [, ttsOpts] = fetchMock.mock.calls.filter(([u]) => u === '/api/tts').pop();
    expect(ttsOpts.headers.Authorization).toBe('Bearer test-jwt-token');
  });

  it('login failure shows the server error inline', async () => {
    installFetch({
      auth: () => jsonRes({ success: false, error: 'Invalid email or password' }, 401),
    });
    render(<App />);

    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'x@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull(); // still signed out
  });

  it('history: replay player + download per item; delete removes the row', async () => {
    const fetchMock = installFetch();
    render(<App />);

    // sign in
    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'asha@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await screen.findByText('First saved speech');

    // two history rows with players and download links
    expect(screen.getAllByTestId('audio-player').length).toBeGreaterThanOrEqual(2);
    const dl = screen.getAllByRole('link', { name: /download/i });
    expect(dl[0]).toHaveAttribute('href', '/api/audio/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp3');

    // delete the first row
    fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    await waitFor(() => {
      expect(screen.queryByText('First saved speech')).toBeNull();
    });
    const delCall = fetchMock.mock.calls.find(([u, o]) => u === '/api/history/11' && o?.method === 'DELETE');
    expect(delCall).toBeDefined();
  });

  it('favorites: star button toggles; favorites-only filter narrows the list', async () => {
    const fetchMock = installFetch();
    render(<App />);

    // signed out → no star button
    await screen.findByText(/Aria \(English, US\)/);
    expect(screen.queryByRole('button', { name: /add .* to favorites/i })).toBeNull();

    // sign in (favorites already contain te-IN-female-1 per the mock)
    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'asha@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await screen.findByRole('button', { name: /sign out/i });

    // switch language to hi-IN — Kalpana is already favorited (★ + aria-pressed)
    fireEvent.change(screen.getByLabelText(/language/i), { target: { value: 'hi-IN' } });
    const star = await screen.findByRole('button', { name: /remove .* to favorites|remove .* from favorites/i });
    expect(star.getAttribute('aria-pressed')).toBe('true');

    // favorites-only filter: en-US has no favorites → voice select disabled-ish (empty list)
    fireEvent.change(screen.getByLabelText(/language/i), { target: { value: 'en-US' } });
    const filter = await screen.findByText(/favorites only/i);
    fireEvent.click(filter);
    await waitFor(() => {
      expect(screen.queryByText(/Aria \(English, US\)/)).toBeNull(); // filtered out
    });

    // click the star on the (now first) voice → POST /api/favorites
    fireEvent.click(screen.getByRole('button', { name: /add .* to favorites/i }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u, o]) => u === '/api/favorites' && o?.method === 'POST')).toBe(true);
    });
  });
});
});

// ── Neural voice import panel (browser bridge) ─────────────────────────
describe('neural voice import panel', () => {
  it('stays hidden while the provider is not piper (mock mode)', async () => {
    installFetch();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate speech/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Enable neural Telugu/i)).not.toBeInTheDocument();
  });
});
