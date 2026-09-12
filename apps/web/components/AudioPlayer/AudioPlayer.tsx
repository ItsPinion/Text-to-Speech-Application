import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";

export type AudioPlayerStatus = "idle" | "playing" | "paused";

/**
 * AudioPlayer (FR-006) — a custom UI ON the native <audio> element (play/
 * pause/seek/volume/progress with design control; native controls are the
 * graceful fallback). Owns the element; never fetches. MP3 is the only
 * format the pipeline produces (tts.md §6).
 */
export interface AudioPlayerProps {
  /** Object URL of the current audio (null → empty state). */
  src?: string | null;
  audioId?: string | null;
  onStateChange?: (status: AudioPlayerStatus) => void;
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function AudioPlayer({ src, audioId, onStateChange }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<AudioPlayerStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  // New audio → reset the transport UI (the element reloads via src change).
  useEffect(() => {
    setStatus("idle");
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  const applyStatus = (next: AudioPlayerStatus) => {
    setStatus(next);
    onStateChange?.(next);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      void audio.play().catch(() => applyStatus("paused")); // autoplay refusal etc.
    } else {
      audio.pause();
    }
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const hasAudio = Boolean(src);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Audio</h2>
        {hasAudio && audioId && <Badge variant="outline">{audioId}</Badge>}
      </div>

      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        onPlay={() => applyStatus("playing")}
        onPause={() => applyStatus("paused")}
        onEnded={() => applyStatus("paused")}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />

      {!hasAudio ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400 ring-1 ring-inset ring-slate-200">
          Generate speech to preview audio here.
        </p>
      ) : (
        <>
          {/* transport: play/pause + progress + time */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={status === "playing" ? "Pause" : "Play"}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {status === "playing" ? (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
                  <path d="M5.75 3h1.5a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V3.75A.75.75 0 0 1 5.75 3Zm7 0h1.5a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V3.75A.75.75 0 0 1 12.75 3Z" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
                  <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" />
                </svg>
              )}
            </button>

            <div className="flex flex-1 items-center gap-3">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={(event) => seekTo(Number(event.target.value))}
                aria-label="Seek"
                aria-valuetext={formatTime(currentTime)}
                disabled={duration === 0}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                style={
                  progress > 0
                    ? {
                        background: `linear-gradient(to right, rgb(79 70 229) ${progress}%, rgb(226 232 240) ${progress}%)`,
                      }
                    : undefined
                }
              />
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-500">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* volume row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                audio.muted = !muted;
                setMuted(!muted);
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              aria-pressed={muted}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              {muted || volume === 0 ? (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path d="M9.02 3.28a.75.75 0 0 1 .48.66v12a.75.75 0 0 1-1.22.58L4.9 13.5H2.75A.75.75 0 0 1 2 12.75v-5.5A.75.75 0 0 1 2.75 6.5H4.9l3.38-3.02a.75.75 0 0 1 .74-.2ZM13.28 7.22a.75.75 0 1 1 1.06 1.06L13.06 9.5l1.28 1.22a.75.75 0 1 1-1.06 1.06L12 10.56l-1.28 1.22a.75.75 0 1 1-1.06-1.06l1.28-1.22-1.28-1.22a.75.75 0 1 1 1.06-1.06L12 8.44l1.28-1.22Z" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path d="M9.02 3.28a.75.75 0 0 1 .48.66v12a.75.75 0 0 1-1.22.58L4.9 13.5H2.75A.75.75 0 0 1 2 12.75v-5.5A.75.75 0 0 1 2.75 6.5H4.9l3.38-3.02a.75.75 0 0 1 .74-.2ZM12.72 6.72a.75.75 0 0 1 1.06 0 4.5 4.5 0 0 1 0 6.56.75.75 0 1 1-1.06-1.06 3 3 0 0 0 0-4.44.75.75 0 0 1 0-1.06Zm2.34-2.1a.75.75 0 0 1 1.06 0 7.5 7.5 0 0 1 0 10.76.75.75 0 1 1-1.06-1.06 6 6 0 0 0 0-8.64.75.75 0 0 1 0-1.06Z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                setMuted(next === 0);
                const audio = audioRef.current;
                if (audio) {
                  audio.volume = next;
                  audio.muted = next === 0;
                }
              }}
              aria-label="Volume"
              className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600"
            />
          </div>
        </>
      )}
    </div>
  );
}
