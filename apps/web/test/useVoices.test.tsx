import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicesResponse } from "@tts/types";
import {
  __clearVoicesCacheForTests,
  defaultVoiceFor,
  selectDefault,
  useVoices,
} from "../hooks/useVoices";
import { getVoices } from "../services/api";

/**
 * Phase 5 hook tests: load, TTL cache (zero refetch within TTL), stale-while-
 * revalidate, automatic retry → hard error → manual retry, refresh. The
 * service module is mocked — the hook must not know or care what implements
 * it (mock today, real fetch in Phase 10).
 */
vi.mock("../services/api", () => ({
  getVoices: vi.fn(),
  generateSpeech: vi.fn(),
  fetchAudio: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const getVoicesMock = vi.mocked(getVoices);

const CATALOG_A: VoicesResponse = {
  success: true,
  languages: [
    { code: "en-US", label: "English (US)" },
    { code: "es-ES", label: "Spanish (Spain)" },
  ],
  voices: [
    { id: "en-US-AriaNeural", name: "English (US) — Aria", language: "en-US", gender: "female" },
    { id: "en-US-GuyNeural", name: "English (US) — Guy", language: "en-US", gender: "male" },
    { id: "es-ES-ElviraNeural", name: "Spanish (Spain) — Elvira", language: "es-ES", gender: "female" },
  ],
};

const CATALOG_B: VoicesResponse = {
  ...CATALOG_A,
  voices: CATALOG_A.voices.filter((voice) => voice.id !== "en-US-AriaNeural"),
};

beforeEach(() => {
  __clearVoicesCacheForTests();
  getVoicesMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useVoices load + cache", () => {
  it("loads once on mount → ready with voices + languages", async () => {
    getVoicesMock.mockResolvedValue(CATALOG_A);
    const { result } = renderHook(() => useVoices());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.voices).toEqual(CATALOG_A.voices);
    expect(result.current.languages).toEqual(CATALOG_A.languages);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getVoicesMock).toHaveBeenCalledTimes(1);
  });

  it("re-mount within TTL serves the cache: ready immediately, ZERO extra fetches", async () => {
    getVoicesMock.mockResolvedValue(CATALOG_A);
    const first = renderHook(() => useVoices());
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useVoices());
    expect(second.result.current.status).toBe("ready");
    expect(second.result.current.voices).toEqual(CATALOG_A.voices);
    expect(getVoicesMock).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it("expired cache renders stale on mount, revalidates in the background", async () => {
    vi.useFakeTimers();
    getVoicesMock.mockResolvedValue(CATALOG_A);
    const first = renderHook(() => useVoices());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(first.result.current.stale).toBe(false);
    first.unmount();

    // Time-travel past the 5-minute TTL.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1_000);
    });

    const second = renderHook(() => useVoices());
    // Stale-while-revalidate: expired catalog renders immediately, flagged.
    expect(second.result.current.status).toBe("ready");
    expect(second.result.current.stale).toBe(true);
    // …and the background revalidation swaps in fresh data.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(second.result.current.stale).toBe(false);
    expect(getVoicesMock).toHaveBeenCalledTimes(2);
  });
});

describe("useVoices failure paths", () => {
  it("fails twice (1 s backoff) → hard error; manual retry recovers", async () => {
    vi.useFakeTimers();
    getVoicesMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useVoices());

    // First attempt fails…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("loading"); // automatic retry pending
    // …backoff elapses, second attempt fails → error.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("boom");
    expect(getVoicesMock).toHaveBeenCalledTimes(2);

    // Manual retry succeeds.
    getVoicesMock.mockResolvedValue(CATALOG_A);
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
  });

  it("refresh failure with data on screen keeps serving it, flagged stale", async () => {
    vi.useFakeTimers();
    getVoicesMock.mockResolvedValueOnce(CATALOG_A);
    const { result } = renderHook(() => useVoices());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("ready");

    getVoicesMock.mockRejectedValue(new Error("boom"));
    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    // Data still rendered (no broken empty selects), honestly flagged stale.
    expect(result.current.status).toBe("ready");
    expect(result.current.voices).toEqual(CATALOG_A.voices);
    expect(result.current.stale).toBe(true);
  });
});

describe("useVoices refresh + default helpers", () => {
  it("refresh() replaces the catalog in place", async () => {
    getVoicesMock.mockResolvedValueOnce(CATALOG_A);
    const { result } = renderHook(() => useVoices());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    getVoicesMock.mockResolvedValueOnce(CATALOG_B);
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.voices).toEqual(CATALOG_B.voices));
    expect(result.current.stale).toBe(false);
  });

  it("default helpers: first language + first voice of that language", () => {
    expect(selectDefault(CATALOG_A.languages, CATALOG_A.voices)).toEqual({
      language: "en-US",
      voice: "en-US-AriaNeural",
    });
    expect(defaultVoiceFor("es-ES", CATALOG_A.voices)).toBe("es-ES-ElviraNeural");
    expect(defaultVoiceFor("xx-XX", CATALOG_A.voices)).toBe("");
  });
});
