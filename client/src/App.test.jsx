/**
 * Phase 4 — RTL suite (plan cases 4.1–4.9). global.fetch is stubbed per test
 * with URL+method handlers; no test ever touches the real network.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const CATALOG = [
  { id: 'en-US-female-1', name: 'Aria', language: 'en-US', gender: 'female' },
  { id: 'en-US-male-1', name: 'Orion', language: 'en-US', gender: 'male' },
  { id: 'hi-IN-female-1', name: 'Kavya', language: 'hi-IN', gender: 'female' },
  { id: 'hi-IN-male-1', name: 'Arjun', language: 'hi-IN', gender: 'male' },
];

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const voicesOk = () => jsonRes(200, { success: true, voices: CATALOG });
const ttsOk = () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'audio/mpeg' },
  blob: async () => new Blob(['fake-mp3-bytes'], { type: 'audio/mpeg' }),
});

/** Stub fetch with { 'VERB:/path': handler } routing. */
function stubFetch(handlers) {
  const fn = vi.fn((url, opts = {}) => {
    const key = `${opts.method ?? 'GET'}:${url}`;
    const handler = handlers[key];
    if (!handler) return Promise.reject(new TypeError(`no handler for ${key}`));
    return Promise.resolve(handler());
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Load the catalog and return user + handles for form interaction. */
async function renderWithCatalog(handlers = {}) {
  const fetchMock = stubFetch({
    'GET:/api/health': () => jsonRes(200, { status: 'ok' }),
    'GET:/api/voices': voicesOk,
    ...handlers,
  });
  render(<App />);
  const user = userEvent.setup();
  // wait until the catalog populates the language channel
  await screen.findByRole('option', { name: /ARIA/i });
  return { user, fetchMock };
}

const textarea = () => screen.getByLabelText(/source text/i);
const generateBtn = () => screen.getByRole('button', { name: /generate/i });

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('Phase 4 — TTS workspace', () => {
  test('4.1 empty textarea → Generate disabled, no TTS request', async () => {
    const { fetchMock } = await renderWithCatalog();

    expect(generateBtn()).toBeDisabled();
    // only the two GETs (health + voices) should have happened
    const posts = fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  test('4.2 typing "Hello world" → 11 chars, 2 words', async () => {
    const { user } = await renderWithCatalog();

    await user.type(textarea(), 'Hello world');

    expect(screen.getByText(/CHARS: 11\/4000/i)).toBeInTheDocument();
    expect(screen.getByText(/WORDS: 2\b/i)).toBeInTheDocument();
  });

  test('4.3 pasting 4001 chars → clamped to 4000', async () => {
    await renderWithCatalog();

    fireEvent.change(textarea(), { target: { value: 'a'.repeat(4001) } });

    expect(screen.getByText(/CHARS: 4000\/4000/i)).toBeInTheDocument();
    expect(textarea().value).toHaveLength(4000);
  });

  test('4.4 changing language filters voices and resets invalid selection', async () => {
    const { user } = await renderWithCatalog();

    // default voice is the first en-US one (Aria)
    expect(screen.getByLabelText(/voice/i)).toHaveValue('en-US-female-1');

    await user.selectOptions(screen.getByLabelText(/language/i), 'hi-IN');

    const voiceSelect = screen.getByLabelText(/voice/i);
    expect(voiceSelect).toHaveValue('hi-IN-female-1'); // reset to first valid
    expect(within(voiceSelect).getByRole('option', { name: /KAVYA/i })).toBeInTheDocument();
    expect(within(voiceSelect).getByRole('option', { name: /ARJUN/i })).toBeInTheDocument();
    expect(within(voiceSelect).queryByRole('option', { name: /ARIA/i })).not.toBeInTheDocument();
  });

  test('4.5 voices API failure → error visible, Generate disabled', async () => {
    stubFetch({
      'GET:/api/health': () => jsonRes(200, { status: 'ok' }),
      'GET:/api/voices': () => jsonRes(500, { success: false, error: 'boom' }),
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(generateBtn()).toBeDisabled();
  });

  test('4.6 TTS 200 blob → audio element with blob: src', async () => {
    const { user } = await renderWithCatalog({ 'POST:/api/tts': ttsOk });

    await user.type(textarea(), 'Hello world');
    await user.click(generateBtn());

    const panel = await screen.findByTestId('audio-out');
    expect(within(panel).getByTestId('audio-element')).toHaveAttribute(
      'src',
      'blob:mock-url'
    );
  });

  test('4.7 TTS 400 → server validation message shown', async () => {
    const { user } = await renderWithCatalog({
      'POST:/api/tts': () =>
        jsonRes(400, { success: false, error: 'Voice "x" does not support language "y"' }),
    });

    await user.type(textarea(), 'Hello world');
    await user.click(generateBtn());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /does not support language/i
    );
  });

  test('4.8 network offline → network failure message', async () => {
    const { user } = await renderWithCatalog({
      'POST:/api/tts': () => Promise.reject(new TypeError('Failed to fetch')),
    });

    await user.type(textarea(), 'Hello world');
    await user.click(generateBtn());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /cannot reach the server/i
    );
  });

  test('4.9 download link carries download attr + blob href', async () => {
    const { user } = await renderWithCatalog({ 'POST:/api/tts': ttsOk });

    await user.type(textarea(), 'Hello world');
    await user.click(generateBtn());

    const link = await screen.findByRole('link', { name: /download mp3/i });
    expect(link).toHaveAttribute('download', 'speech.mp3');
    expect(link).toHaveAttribute('href', 'blob:mock-url');
  });
});
