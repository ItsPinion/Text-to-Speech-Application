"use client";

import { useEffect, useRef, useState } from "react";
import type { LanguageOption, Voice } from "@tts/types";
import { countChars } from "@/lib/constants";
import { ApiError, fetchAudio, generateSpeech, getVoices } from "@/services/api";
import { createObjectUrl, revokeObjectUrl } from "@/services/audio";
import { AiEnhancePanel } from "@/components/AiEnhancePanel";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DownloadButton } from "@/components/DownloadButton";
import { ErrorMessage } from "@/components/ErrorMessage";
import { FileUpload } from "@/components/FileUpload";
import { GenerateButton, type GenerateStatus } from "@/components/GenerateButton";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TextInput } from "@/components/TextInput";
import { VoiceSelector } from "@/components/VoiceSelector";
import { Card } from "@/components/ui";

/**
 * TtsWorkspace — the ONE client component tree (the 'use client' boundary is
 * HERE, not at the page: layout/page stay server components for metadata and
 * the future ClerkProvider slot).
 *
 * Parent owns truth; children render state and emit events (frontend.md §3).
 * Phase 3 baseline of the state model (§2) — Phase 4 deepens textState,
 * Phase 5 voiceState (useVoices), Phase 10 ttsState (useTts + real aborts).
 */
interface VoiceState {
  languages: LanguageOption[];
  voices: Voice[];
  language: string;
  voice: string;
  loading: boolean;
  error: string | null;
}

interface TtsState {
  status: GenerateStatus;
  audioId: string | null;
  /** API-relative URL of the generation (contract field, kept for Phase 10). */
  audioUrl: string | null;
  /** Local object URL actually played/downloaded — always revoked on replace. */
  blobUrl: string | null;
  error: ApiError | null;
}

const INITIAL_TTS_STATE: TtsState = {
  status: "idle",
  audioId: null,
  audioUrl: null,
  blobUrl: null,
  error: null,
};

export function TtsWorkspace() {
  // textState (Phase 3 baseline) — counts are DERIVED on every render.
  const [text, setText] = useState("");
  const chars = countChars(text);

  const [voiceState, setVoiceState] = useState<VoiceState>({
    languages: [],
    voices: [],
    language: "",
    voice: "",
    loading: true,
    error: null,
  });

  const [ttsState, setTtsState] = useState<TtsState>(INITIAL_TTS_STATE);

  // Stale-response guard: Cancel/unmount must never let an in-flight mock
  // resolution clobber newer state. Phase 10 adds a real AbortController
  // alongside this (useTts).
  const generateSeqRef = useRef(0);
  // Memory hygiene: the CURRENT object URL, revoked on unmount.
  const blobUrlRef = useRef<string | null>(null);

  // Catalog load — inline today; Phase 5 swaps in the useVoices hook with the
  // exact same data flow (and its once-with-backoff retry).
  useEffect(() => {
    let cancelled = false;
    getVoices()
      .then((res) => {
        if (cancelled) return;
        const firstLanguage = res.languages[0]?.code ?? "";
        const firstVoice = res.voices.find((v) => v.language === firstLanguage)?.id ?? "";
        setVoiceState({
          languages: res.languages,
          voices: res.voices,
          language: firstLanguage,
          voice: firstVoice,
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Could not load the voice catalog.";
        setVoiceState((state) => ({ ...state, loading: false, error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Revoke the object URL on unmount (created URLs are never leaked).
  useEffect(
    () => () => {
      revokeObjectUrl(blobUrlRef.current);
    },
    [],
  );

  const handleLanguageChange = (language: string) => {
    // FR-004: language change resets the voice to that language's first voice.
    setVoiceState((state) => ({
      ...state,
      language,
      voice: state.voices.find((v) => v.language === language)?.id ?? "",
    }));
  };

  const handleGenerate = () => {
    if (ttsState.status === "loading") return;
    const seq = (generateSeqRef.current += 1);
    setTtsState({ ...INITIAL_TTS_STATE, status: "loading" });

    void (async () => {
      try {
        const response = await generateSpeech({ text, voice: voiceState.voice });
        if (generateSeqRef.current !== seq) return; // cancelled meanwhile
        const blob = await fetchAudio(response.audioId);
        if (generateSeqRef.current !== seq) return;
        revokeObjectUrl(blobUrlRef.current);
        const blobUrl = createObjectUrl(blob);
        blobUrlRef.current = blobUrl;
        setTtsState({
          status: "ready",
          audioId: response.audioId,
          audioUrl: response.audioUrl,
          blobUrl,
          error: null,
        });
      } catch (error: unknown) {
        if (generateSeqRef.current !== seq) return;
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError({
                code: "INTERNAL",
                status: 0,
                message: error instanceof Error ? error.message : "Generation failed.",
              });
        setTtsState((state) => ({ ...state, status: "error", error: apiError }));
      }
    })();
  };

  const handleCancel = () => {
    // Aborts are USER INTENT, not errors — reset cleanly, no banner.
    generateSeqRef.current += 1;
    setTtsState(INITIAL_TTS_STATE);
  };

  const handleDismissError = () => {
    setTtsState((state) => ({
      ...state,
      status: state.status === "error" ? "idle" : state.status,
      error: null,
    }));
  };

  const voicesForLanguage = voiceState.voices.filter((v) => v.language === voiceState.language);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* left column: input + v2 slots + live error region */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <TextInput value={text} onChange={setText} onClear={() => setText("")} />
        </Card>

        <FileUpload />
        <AiEnhancePanel />

        <ErrorMessage error={ttsState.error} onDismiss={handleDismissError} />
      </div>

      {/* right column: voice controls + audio experience */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <div className="flex flex-col gap-4">
            <LanguageSelector
              languages={voiceState.languages}
              value={voiceState.language}
              onChange={handleLanguageChange}
              loading={voiceState.loading}
            />
            <VoiceSelector
              voices={voicesForLanguage}
              value={voiceState.voice}
              onChange={(voice) => setVoiceState((state) => ({ ...state, voice }))}
              loading={voiceState.loading}
              error={voiceState.error}
            />
            <GenerateButton
              status={ttsState.status}
              onGenerate={handleGenerate}
              onCancel={handleCancel}
            />
            <p aria-live="polite" className="sr-only">
              {ttsState.status === "loading"
                ? "Generating speech…"
                : ttsState.status === "ready"
                  ? `Speech ready, ${chars.toLocaleString()} characters spoken.`
                  : ""}
            </p>
          </div>
        </Card>

        <Card>
          <AudioPlayer src={ttsState.blobUrl} audioId={ttsState.audioId} />
          <div className="mt-4">
            <DownloadButton
              enabled={ttsState.status === "ready"}
              audioId={ttsState.audioId}
              url={ttsState.blobUrl}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
