"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageOption, Voice, VoicesResponse } from "@tts/types";
import { getVoices } from "@/services/api";

/**
 * useVoices (Phase 5) — the SOLE owner of the catalog lifecycle (tts.md §4).
 * The API owns the catalog; the UI renders it. Zero hard-coded voices in
 * apps/web: what renders here is whatever `GET /api/voices` returned (mock
 * today, real in Phase 10 — same signature, same shape).
 *
 * Behaviors:
 * - fetch once on mount; module-level cache with a 5-minute TTL → re-mounts
 *   inside the TTL make ZERO network calls (ready on the first render);
 * - stale-while-revalidate: an expired cache still renders (stale: true)
 *   while a refresh runs; a refresh that fails keeps serving stale — honest
 *   staleness beats fake freshness;
 * - failure with nothing cached → ONE automatic retry after 1 s → hard-error
 *   state with retry();
 * - refresh(): explicit (UI button) or an INVALID_VOICE signal (Phase 10);
 * - defaults flow through `selectDefault()` so Phase 16 preferences plug into
 *   ONE place without touching the hook's callers.
 */

export type VoicesStatus = "idle" | "loading" | "ready" | "error";

export interface UseVoicesResult {
  status: VoicesStatus;
  voices: Voice[];
  languages: LanguageOption[];
  /** True when the rendered catalog came from an expired cache. */
  stale: boolean;
  /** Set only in the hard-error state (no data to render at all). */
  error: string | null;
  /** Manual retry from the error state. */
  retry: () => void;
  /** Force a catalog reload (keeps rendering current data while running). */
  refresh: () => void;
}

export interface VoicesState {
  status: VoicesStatus;
  voices: Voice[];
  languages: LanguageOption[];
  stale: boolean;
  error: string | null;
}

const TTL_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 1_000;

interface CacheEntry {
  response: VoicesResponse;
  fetchedAt: number;
}

// Module-level: the cache outlives any single component instance.
let cache: CacheEntry | null = null;

/** Test hook: reset the module cache (the only "state" tests may touch). */
export function __clearVoicesCacheForTests(): void {
  cache = null;
}

function isFresh(entry: CacheEntry, now = Date.now()): boolean {
  return now - entry.fetchedAt < TTL_MS;
}

/** First voice of a language (catalog order) — the documented default rule. */
export function defaultVoiceFor(language: string, voices: Voice[]): string {
  return voices.find((voice) => voice.language === language)?.id ?? "";
}

/**
 * Default selection for a (re)loaded catalog: first language, its first
 * voice. Phase 16 swaps this single function for a preferences-aware one.
 */
export function selectDefault(
  languages: LanguageOption[],
  voices: Voice[],
): { language: string; voice: string } {
  const language = languages[0]?.code ?? "";
  return { language, voice: defaultVoiceFor(language, voices) };
}

const INITIAL_STATE: VoicesState = {
  status: "loading",
  voices: [],
  languages: [],
  stale: false,
  error: null,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stateFromCache(entry: CacheEntry): VoicesState {
  return {
    status: "ready",
    voices: entry.response.voices,
    languages: entry.response.languages,
    stale: !isFresh(entry),
    error: null,
  };
}

export function useVoices(): UseVoicesResult {
  // Any cached catalog (fresh or expired) renders on the FIRST render —
  // no loading flash, no fetch when fresh.
  const [state, setState] = useState<VoicesState>(() =>
    cache ? stateFromCache(cache) : INITIAL_STATE,
  );

  // Monotonic token: only the newest run may write state (unmount/refresh safety).
  const runRef = useRef(0);

  const run = useCallback((force: boolean) => {
    // Fresh cache short-circuits UNLESS the caller forces a reload.
    if (!force && cache && isFresh(cache)) {
      setState(stateFromCache(cache));
      return;
    }

    const runId = (runRef.current += 1);
    // Keep any data already on screen; mark staleness honestly while fetching.
    setState((current) =>
      current.voices.length > 0
        ? { ...current, stale: !(cache && isFresh(cache)) }
        : { ...INITIAL_STATE },
    );

    const attempt = async (triesLeft: number): Promise<void> => {
      try {
        const response = await getVoices();
        if (runRef.current !== runId) return; // superseded/unmounted
        cache = { response, fetchedAt: Date.now() };
        setState({
          status: "ready",
          voices: response.voices,
          languages: response.languages,
          stale: false,
          error: null,
        });
      } catch (error: unknown) {
        if (runRef.current !== runId) return;
        if (triesLeft > 0) {
          await sleep(RETRY_DELAY_MS);
          if (runRef.current !== runId) return;
          return attempt(triesLeft - 1);
        }
        const message =
          error instanceof Error ? error.message : "Could not load the voice catalog.";
        // Serve stale on refresh failure (if we have anything); hard error
        // only when there is nothing to render.
        setState((current) =>
          current.voices.length > 0
            ? { ...current, stale: true }
            : { ...INITIAL_STATE, status: "error", error: message },
        );
      }
    };

    void attempt(1);
  }, []);

  useEffect(() => {
    run(false);
    return () => {
      runRef.current += 1; // cancel in-flight work on unmount
    };
  }, [run]);

  const retry = useCallback(() => run(true), [run]);
  const refresh = useCallback(() => run(true), [run]);

  return { ...state, retry, refresh };
}
