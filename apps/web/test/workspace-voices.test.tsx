import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicesResponse } from "@tts/types";
import { TtsWorkspace } from "../components/TtsWorkspace";
import { __clearVoicesCacheForTests } from "../hooks/useVoices";
import { getVoices } from "../services/api";

/**
 * Phase 5 workspace tests: dependent-selector reset semantics (FR-003/004)
 * against the catalog-driven UI — language change resets to that language's
 * DEFAULT (never stale picks), a refresh that removes the selected voice
 * auto-resets safely, and a hard catalog error renders retry (no broken
 * empty selects).
 */
vi.mock("@/services/api", () => ({
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

/** Same languages; Aria removed — the documented drift scenario. */
const CATALOG_B: VoicesResponse = {
  success: true,
  languages: CATALOG_A.languages,
  voices: CATALOG_A.voices.filter((voice) => voice.id !== "en-US-AriaNeural"),
};

beforeEach(() => {
  __clearVoicesCacheForTests();
  getVoicesMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const languageSelect = () => screen.getByLabelText("Language") as HTMLSelectElement;
const voiceSelect = () => screen.getByLabelText("Voice") as HTMLSelectElement;

describe("TtsWorkspace dependent selectors", () => {
  it("defaults to the first language + its first voice; gender hint shown", async () => {
    getVoicesMock.mockResolvedValue(CATALOG_A);
    render(<TtsWorkspace />);

    await waitFor(() => expect(voiceSelect().value).toBe("en-US-AriaNeural"));
    expect(languageSelect().value).toBe("en-US");
    // Voice label carries the gender hint ("… · Female").
    expect(within(voiceSelect()).getByText(/Aria · Female/)).toBeTruthy();
  });

  it("language change resets the voice to that language's default — never stale picks", async () => {
    getVoicesMock.mockResolvedValue(CATALOG_A);
    render(<TtsWorkspace />);
    await waitFor(() => expect(voiceSelect().value).toBe("en-US-AriaNeural"));

    // pick the non-default voice, then switch away and back:
    fireEvent.change(voiceSelect(), { target: { value: "en-US-GuyNeural" } });
    expect(voiceSelect().value).toBe("en-US-GuyNeural");

    fireEvent.change(languageSelect(), { target: { value: "es-ES" } });
    await waitFor(() => expect(voiceSelect().value).toBe("es-ES-ElviraNeural"));

    fireEvent.change(languageSelect(), { target: { value: "en-US" } });
    await waitFor(() => expect(voiceSelect().value).toBe("en-US-AriaNeural"));
    expect(languageSelect().value).toBe("en-US");
  });

  it("refresh that removes the selected voice auto-resets, no crash", async () => {
    getVoicesMock.mockResolvedValueOnce(CATALOG_A).mockResolvedValueOnce(CATALOG_B);
    render(<TtsWorkspace />);
    await waitFor(() => expect(voiceSelect().value).toBe("en-US-AriaNeural"));

    fireEvent.click(screen.getByRole("button", { name: /refresh voice catalog/i }));
    // Aria vanished from the catalog → selection resets to the language default.
    await waitFor(() => expect(voiceSelect().value).toBe("en-US-GuyNeural"));
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("hard catalog error → message + working Retry, no broken empty selects", async () => {
    vi.useFakeTimers();
    getVoicesMock.mockRejectedValue(new Error("boom"));
    render(<TtsWorkspace />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    // Error panel replaces the selectors (no dead <select>s on screen).
    expect(screen.getByText("boom")).toBeTruthy();
    expect(screen.queryByLabelText("Voice")).toBeNull();

    // Retry recovers into the normal selectors.
    getVoicesMock.mockResolvedValue(CATALOG_A);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(voiceSelect().value).toBe("en-US-AriaNeural");
    expect(languageSelect().value).toBe("en-US");
  });
});
