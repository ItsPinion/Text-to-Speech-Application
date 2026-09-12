"use client";

import { useEffect, useRef, useState } from "react";
import { countChars, validateText } from "@/lib/constants";
import { ApiError, fetchAudio, generateSpeech } from "@/services/api";
import { createObjectUrl, revokeObjectUrl } from "@/services/audio";
import { defaultVoiceFor, selectDefault, useVoices } from "@/hooks/useVoices";
import { AiEnhancePanel } from "@/components/AiEnhancePanel";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DownloadButton } from "@/components/DownloadButton";
import { ErrorMessage } from "@/components/ErrorMessage";
import { FileUpload } from "@/components/FileUpload";
import { GenerateButton, type GenerateStatus } from "@/components/GenerateButton";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TextInput } from "@/components/TextInput";
import { VoiceSelector } from "@/components/VoiceSelector";
import { Badge, Button, Card } from "@/components/ui";

/**
 * TtsWorkspace — the ONE client component tree (the 'use client' boundary is
 * HERE, not at the page: layout/page stay server components for metadata and
 * the future ClerkProvider slot).
 *
 * Parent owns truth; children render state and emit events (frontend.md §3).
 * Phase 4 deepened textState; Phase 5 hands the catalog to the useVoices
 * hook (fetch/cache/retry/refresh) and owns only the SELECTION with the
 * documented reset semantics. Phase 10 adds useTts + real aborts.
 */

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
  // textState (Phase 4): one source of truth (`text`) + error policy — there
  // is no setChars/setWords anywhere; the only stored extra is the field-
  // error STATE (the empty error appears on a generate attempt and dies on
  // edit; over-limit errors are derived and clear themselves when fixed).
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const chars = countChars(text);
  const validation = validateText(text);

  // voiceState (Phase 5): the CATALOG lives in useVoices (loading/ready/
  // error/stale + cache + retry); the workspace owns only the selection.
  const {
    status: catalogStatus,
    voices,
    languages,
    stale: catalogStale,
    error: catalogError,
    retry: retryCatalog,
    refresh: refreshCatalog,
  } = useVoices();

  const [selection, setSelection] = useState({ language: "", voice: "" });
  const [ttsState, setTtsState] = useState<TtsState>(INITIAL_TTS_STATE);

  // Stale-response guard: Cancel/unmount must never let an in-flight mock
  // resolution clobber newer state. Phase 10 adds a real AbortController
  // alongside this (useTts).
  const generateSeqRef = useRef(0);
  // Memory hygiene: the CURRENT object URL, revoked on unmount.
  const blobUrlRef = useRef<string | null>(null);

  // Selection reconciliation (the whole design of dependent selectors):
  // on every catalog load/refresh, keep the selection ONLY if still valid;
  // otherwise reset to the defaults — never ghosts of removed entries.
  useEffect(() => {
    if (languages.length === 0 || voices.length === 0) return;
    setSelection((current) => {
      const languageOk = languages.some((language) => language.code === current.language);
      const nextLanguage = languageOk
        ? current.language
        : selectDefault(languages, voices).language;
      const voiceOk = voices.some(
        (voice) => voice.id === current.voice && voice.language === nextLanguage,
      );
      return voiceOk
        ? current
        : { language: nextLanguage, voice: defaultVoiceFor(nextLanguage, voices) };
    });
  }, [languages, voices]);

  // Revoke the object URL on unmount (created URLs are never leaked).
  useEffect(
    () => () => {
      revokeObjectUrl(blobUrlRef.current);
    },
    [],
  );

  const handleLanguageChange = (language: string) => {
    // FR-004: language change resets the voice to that language's FIRST voice
    // — re-selecting a previous language restores defaults, never stale picks
    // (preferences override this rule in Phase 16).
    setSelection({ language, voice: defaultVoiceFor(language, voices) });
  };

  // ── textState policy (Phase 4) ────────────────────────────────────────────
  // Over-limit is ALWAYS an error (the user must know what to cut); emptiness
  // becomes an error only after a blur or a generate attempt (no annoyance
  // tax mid-thought). Editing always clears the stale error.
  const shownError = validation.ok
    ? null
    : validation.code === "TEXT_TOO_LONG"
      ? validation.message
      : textError;

  const handleTextChange = (value: string) => {
    setText(value);
    setTextError(null); // stale errors die with the input
  };

  // canGenerate: valid text + voice picked + not already generating.
  const canGenerate = validation.ok && selection.voice !== "" && ttsState.status !== "loading";
  const generateReason = !validation.ok
    ? validation.code === "INVALID_TEXT"
      ? "Enter some text to generate speech."
      : "Shorten the text to the 5,000-character limit first."
    : selection.voice === ""
      ? "Pick a voice first."
      : null;

  const handleGenerate = () => {
    if (ttsState.status === "loading") return;
    // Client-side validation is the courtesy gate (SR-02) — no network call
    // on invalid input. The server re-validates with the same schema (Phase 7).
    if (!validation.ok) {
      setTextError(validation.message);
      return;
    }
    const voice = selection.voice;
    const seq = (generateSeqRef.current += 1);
    setTtsState({ ...INITIAL_TTS_STATE, status: "loading" });

    void (async () => {
      try {
        const response = await generateSpeech({ text, voice });
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

  // Clear is ONE state transition, not three coincidences (Phase 4): text,
  // error/touch, and any previously generated audio reset together — cleared
  // text orphans the old audio by definition.
  const handleClear = () => {
    generateSeqRef.current += 1; // an in-flight generation belongs to dead text
    setText("");
    setTextError(null);
    revokeObjectUrl(blobUrlRef.current);
    blobUrlRef.current = null;
    setTtsState(INITIAL_TTS_STATE);
  };

  const handleDismissError = () => {
    setTtsState((state) => ({
      ...state,
      status: state.status === "error" ? "idle" : state.status,
      error: null,
    }));
  };

  const voicesForLanguage = voices.filter((voice) => voice.language === selection.language);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* left column: input + v2 slots + live error region */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <TextInput
            value={text}
            onChange={handleTextChange}
            onClear={handleClear}
            error={shownError}
            disabled={ttsState.status === "loading"}
          />
        </Card>

        <FileUpload />
        <AiEnhancePanel />

        <ErrorMessage error={ttsState.error} onDismiss={handleDismissError} />
      </div>

      {/* right column: voice controls + audio experience */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <div className="flex flex-col gap-4">
            {/* catalog meta row: source-of-truth note + staleness + refresh */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">
                Voice catalog · served by the API
              </span>
              <div className="flex items-center gap-2">
                {catalogStale && <Badge variant="neutral">may be outdated</Badge>}
                <button
                  type="button"
                  onClick={refreshCatalog}
                  aria-label="Refresh voice catalog"
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                    <path
                      fillRule="evenodd"
                      d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 1 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.638a.75.75 0 0 0 1.5 0v-2.033l.4.4a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.372ZM3.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311H10.77a.75.75 0 0 0 0 1.5h3.638a.75.75 0 0 0 .75-.75V3.532a.75.75 0 0 0-1.5 0v2.033l-.4-.4a7 7 0 0 0-11.712 3.138.75.75 0 0 0 1.449.372Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {catalogStatus === "error" ? (
              /* hard error: no broken empty selects — message + retry */
              <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex flex-col gap-1">
                  <Badge variant="danger">CATALOG_UNAVAILABLE</Badge>
                  <p className="text-sm text-red-800">
                    {catalogError ?? "Could not load the voice catalog."}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={retryCatalog}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <LanguageSelector
                  languages={languages}
                  value={selection.language}
                  onChange={handleLanguageChange}
                  loading={catalogStatus === "loading"}
                />
                <VoiceSelector
                  voices={voicesForLanguage}
                  value={selection.voice}
                  onChange={(voice) => setSelection((current) => ({ ...current, voice }))}
                  loading={catalogStatus === "loading"}
                />
                <GenerateButton
                  status={ttsState.status}
                  onGenerate={handleGenerate}
                  onCancel={handleCancel}
                  disabled={!canGenerate}
                  reason={generateReason}
                />
              </>
            )}
            <p aria-live="polite" className="sr-only">
              {catalogStatus === "loading"
                ? "Loading the voice catalog."
                : ttsState.status === "loading"
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
