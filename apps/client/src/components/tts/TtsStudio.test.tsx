import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Voice } from '@tts/shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, generateSpeech, listVoices } from '@/services/api'

import { TtsStudio } from './TtsStudio'

// ── Mock the API layer (the only module that talks to the network) ──
vi.mock('@/services/api', () => {
  class ApiError extends Error {
    readonly status: number | null
    constructor(message: string, status: number | null) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  return {
    ApiError,
    apiUrl: (path: string) => path,
    listVoices: vi.fn(),
    generateSpeech: vi.fn(),
  }
})

const mockedListVoices = vi.mocked(listVoices)
const mockedGenerateSpeech = vi.mocked(generateSpeech)

const CATALOG: Voice[] = [
  { id: 'en-US-female-1', name: 'Aria', language: 'en-US', gender: 'female' },
  { id: 'en-US-male-1', name: 'Marcus', language: 'en-US', gender: 'male' },
  { id: 'hi-IN-female-1', name: 'Priya', language: 'hi-IN', gender: 'female' },
  { id: 'en-GB-female-1', name: 'Iris', language: 'en-GB', gender: 'female' },
]

const AUDIO_BLOB = () =>
  new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3])], { type: 'audio/mpeg' })

beforeAll(() => {
  // jsdom has no blob URL store — provide deterministic fakes.
  let counter = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:mock-${(counter += 1)}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  mockedListVoices.mockResolvedValue(CATALOG)
  mockedGenerateSpeech.mockResolvedValue(AUDIO_BLOB())
})

const renderStudio = () => render(<TtsStudio />)

const getGenerateButton = () => screen.getByRole('button', { name: /generate speech/i })

const typeText = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText(/text input/i), text)
}

// ── Test 4.1 ── Empty textarea → Generate disabled; no network call ──
describe('TtsStudio — plan test 4.1 (empty input never hits the API)', () => {
  it('disables Generate on an empty textarea and never calls the API', async () => {
    const user = userEvent.setup()
    renderStudio()

    const generate = getGenerateButton()
    expect(generate).toBeDisabled()

    await user.click(generate)
    expect(mockedGenerateSpeech).not.toHaveBeenCalled()
  })
})

// ── Test 4.2 ── "Hello world" → Characters 11, words 2 ─────────────
describe('TtsStudio — plan test 4.2 (live counts)', () => {
  it('shows 11 characters and 2 words while typing', async () => {
    const user = userEvent.setup()
    renderStudio()

    await typeText(user, 'Hello world')

    const stats = screen.getByTestId('text-stats').textContent ?? ''
    expect(stats).toMatch(/CHARS\s*11\/4000/)
    expect(stats).toMatch(/WORDS\s*2/)
  })
})

// ── Test 4.3 ── 4000-char paste: count 4000, 4001st blocked + warned ──
describe('TtsStudio — plan test 4.3 (max-length clamp)', () => {
  it('clamps at 4000 chars and shows the MAX warning', () => {
    renderStudio()

    const pasted = 'a'.repeat(4001)
    fireEvent.change(screen.getByLabelText(/text input/i), {
      target: { value: pasted },
    })

    const textarea = screen.getByLabelText(/text input/i) as HTMLTextAreaElement
    expect(textarea.value.length).toBe(4000)

    const stats = screen.getByTestId('text-stats').textContent ?? ''
    expect(stats).toMatch(/CHARS\s*4000\/4000/)
    expect(stats).toMatch(/MAX REACHED/)
  })
})

// ── Test 4.4 ── Language change filters voices + resets invalid voice ──
describe('TtsStudio — plan test 4.4 (voice list filters by language)', () => {
  it('filters the voice list and resets to a valid voice on language change', async () => {
    const user = userEvent.setup()
    renderStudio()

    // Catalog loads async — wait for the en-US voices to populate.
    expect(await screen.findByRole('option', { name: /Aria/ })).toBeDefined()
    // Default language (en-US) → initial voice snaps to Aria.
    expect((screen.getByLabelText(/voice/i) as HTMLSelectElement).value).toBe(
      'en-US-female-1',
    )

    await user.selectOptions(screen.getByLabelText(/language/i), 'hi-IN')

    // en-US voices are gone from the dropdown…
    expect(screen.queryByRole('option', { name: /Aria/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Priya/ })).toBeDefined()
    // …and the selection was reset to the first hi-IN voice (no stale voice).
    expect((screen.getByLabelText(/voice/i) as HTMLSelectElement).value).toBe(
      'hi-IN-female-1',
    )
  })
})

// ── Test 4.5 ── Voices API failure → error visible; Generate disabled ──
describe('TtsStudio — plan test 4.5 (catalog failure)', () => {
  it('shows an error and disables generation when /api/voices fails', async () => {
    mockedListVoices.mockRejectedValue(new Error('catalog offline'))
    renderStudio()

    expect(await screen.findByRole('alert')).toHaveTextContent(/catalog unavailable/i)
    expect(getGenerateButton()).toBeDisabled()
    // A retry path is offered once the API might be back.
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined()
  })
})

// ── Tests 4.6 / 4.9 ── 200 blob → <audio blob:> + download link ──
describe('TtsStudio — happy path (plan tests 4.6 + 4.9)', () => {
  it('renders an audio element with a blob: src and a download link', async () => {
    const user = userEvent.setup()
    renderStudio()
    await typeText(user, 'Hello world')

    await user.click(getGenerateButton())

    const player = await screen.findByTestId('audio-player')
    await waitFor(() => {
      expect(player.getAttribute('src')).toMatch(/^blob:/)
    })

    const download = screen.getByRole('link', { name: /download mp3/i })
    expect(download).toHaveAttribute('download', 'speech.mp3')
    expect(download.getAttribute('href')).toMatch(/^blob:/)

    expect(mockedGenerateSpeech).toHaveBeenCalledWith({
      text: 'Hello world',
      language: 'en-US',
      voice: 'en-US-female-1',
    })
  })

  it('clears the previous audio when the text changes (documented choice)', async () => {
    const user = userEvent.setup()
    renderStudio()
    await typeText(user, 'Hello world')
    await user.click(getGenerateButton())
    const player = await screen.findByTestId('audio-player')
    const url = player.getAttribute('src')
    expect(url).toMatch(/^blob:/)

    await typeText(user, '!')

    expect(screen.queryByTestId('audio-player')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })
})

// ── Test 4.7 ── 400 → server's error text surfaces ─────────────────
describe('TtsStudio — plan test 4.7 (API 400 shows server message)', () => {
  it('surfaces the JSON error message from the server', async () => {
    const user = userEvent.setup()
    mockedGenerateSpeech.mockRejectedValue(
      new ApiError('Voice is required', 400),
    )
    renderStudio()
    await typeText(user, 'Hello world')

    await user.click(getGenerateButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Voice is required')
  })
})

// ── Test 4.8 ── Network offline → network failure message ──────────
describe('TtsStudio — plan test 4.8 (network failure)', () => {
  it('shows the network failure message when the API is unreachable', async () => {
    const user = userEvent.setup()
    mockedGenerateSpeech.mockRejectedValue(
      new ApiError('Network failure — cannot reach the API', null),
    )
    renderStudio()
    await typeText(user, 'Hello world')

    await user.click(getGenerateButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/network failure/i)
  })
})
