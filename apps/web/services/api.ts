/**
 * services/api.ts — the API client (frontend.md §5).
 *
 * Phase 3: the function signatures below are FINAL; the internals are a mock
 * (fixtures + artificial delay) so the whole UI shell is demoable without a
 * backend. `NEXT_PUBLIC_USE_MOCKS=0` switches to the real `request()` paths —
 * they already exist and speak the exact error contract (ApiError from
 * `@tts/validation`'s registry). Phase 10 flips the default and deletes the
 * mock branch; components are untouched.
 *
 * No secrets in this file — it runs in the browser (SR-01).
 */
import type { ApiErrorResponse, TtsRequest, TtsResponse, VoicesResponse } from "@tts/types";
import { ERROR_REGISTRY, countChars } from "@tts/validation";
import { MOCK_AUDIO_URL, MOCK_VOICES_RESPONSE } from "@/mocks/voices";

// ── ApiError — the only error type this app's UI ever handles ───────────────

export class ApiError extends Error {
  /** Stable machine-readable code (ERROR_REGISTRY) — the UI switches on this. */
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(init: { code: string; message: string; status: number; requestId?: string }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
  }
}

// ── Real transport (Phase 10 default; exercisable today via USE_MOCKS=0) ────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const TIMEOUT_MS = 45_000;

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  responseType?: "json" | "blob";
}

/**
 * fetch + JSON/blob + error-envelope parsing + timeout. Aborts are surfaced
 * as AbortError to the caller (user intent — never rendered as an error).
 */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, responseType = "json" } = opts;

  // Combine the caller's signal with a hard timeout without AbortSignal.any.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // Network failure/timeout: no error envelope exists to parse.
    throw new ApiError({
      code: "INTERNAL",
      status: 0,
      message: "Cannot reach the server. Is the API running?",
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  if (!res.ok) {
    // Parse the documented error envelope; unparseable → generic BAD_REQUEST.
    let code = "BAD_REQUEST";
    let message: string = ERROR_REGISTRY.BAD_REQUEST.message;
    try {
      const parsed = (await res.json()) as ApiErrorResponse;
      if (parsed && typeof parsed === "object" && parsed.error) {
        code = parsed.error.code;
        message = parsed.error.message;
      }
    } catch {
      // body was not the documented envelope — keep the generic fallback
    }
    const requestId = res.headers.get("x-request-id") ?? undefined;
    throw new ApiError({ code, message, status: res.status, requestId });
  }

  return responseType === "blob" ? ((await res.blob()) as T) : ((await res.json()) as T);
}

// ── Public API — these signatures never change again ─────────────────────────

export async function getVoices(signal?: AbortSignal): Promise<VoicesResponse> {
  if (USE_MOCKS) return mockGetVoices();
  return request<VoicesResponse>("/voices", { signal });
}

export async function generateSpeech(req: TtsRequest, signal?: AbortSignal): Promise<TtsResponse> {
  if (USE_MOCKS) return mockGenerateSpeech(req);
  return request<TtsResponse>("/tts", { method: "POST", body: req, signal });
}

export async function fetchAudio(audioId: string, signal?: AbortSignal): Promise<Blob> {
  if (USE_MOCKS) return mockFetchAudio();
  return request<Blob>(`/audio/${encodeURIComponent(audioId)}`, { responseType: "blob", signal });
}

// ── Mock internals (deleted in Phase 10) ─────────────────────────────────────

/**
 * Mocks are the default until Phase 10 swaps the real client in — the shell
 * must demo without a backend. Set NEXT_PUBLIC_USE_MOCKS=0 to hit the live
 * API through the dev proxy (voices/tts routes exist from Phases 5/9).
 */
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "0";

/** Small enough to see loading states, small enough not to annoy. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockAudioSeq = 0;

async function mockGetVoices(): Promise<VoicesResponse> {
  await sleep(400);
  return MOCK_VOICES_RESPONSE;
}

async function mockGenerateSpeech(req: TtsRequest): Promise<TtsResponse> {
  await sleep(700);

  // Same authority the server enforces in Phase 7 — identical codes, identical
  // messages (both sides read ERROR_REGISTRY). The UI can dress-rehearse its
  // failure states today.
  if (countChars(req.text.trim()) === 0) {
    const spec = ERROR_REGISTRY.INVALID_TEXT;
    throw new ApiError({ code: spec.code, message: spec.message, status: spec.status });
  }
  const voice = MOCK_VOICES_RESPONSE.voices.find((v) => v.id === req.voice);
  if (!voice) {
    const spec = ERROR_REGISTRY.INVALID_VOICE;
    throw new ApiError({ code: spec.code, message: spec.message, status: spec.status });
  }

  const audioId = `mock-${Date.now().toString(36)}-${(mockAudioSeq += 1)}`;
  return {
    success: true,
    audioId,
    audioUrl: `/api/audio/${audioId}`,
    voice: voice.id,
    language: voice.language,
    format: "mp3",
    chars: countChars(req.text),
  };
}

async function mockFetchAudio(): Promise<Blob> {
  await sleep(250);
  const res = await fetch(MOCK_AUDIO_URL);
  if (!res.ok) {
    const spec = ERROR_REGISTRY.AUDIO_EXPIRED;
    throw new ApiError({ code: spec.code, message: spec.message, status: spec.status });
  }
  return res.blob();
}
