import type { Voice } from '@tts/shared'

import { buttonVariants } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

interface AudioPlayerProps {
  /** Object URL of the generated MP3 blob. */
  url: string
  sizeBytes: number
  voice?: Voice
}

/**
 * Plan §Phase 4 AudioPlayer + DownloadButton: native <audio controls> fed
 * by the blob URL, plus an <a download="speech.mp3"> pointing at the same
 * object URL — play, seek, volume, and download for free.
 */
export function AudioPlayer({ url, sizeBytes, voice }: AudioPlayerProps) {
  return (
    <section
      aria-label="Generated audio"
      className="border border-cyan/40 bg-black/60 p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs uppercase tracking-widest text-chrome/60">
        <span>
          OUTPUT://SPEECH.MP3
          {voice && <span className="text-chrome/40"> — {voice.name.toUpperCase()}</span>}
        </span>
        <span className="text-cyan text-glow-cyan">{(sizeBytes / 1024).toFixed(1)} KB</span>
      </div>
      <audio controls src={url} className="w-full" data-testid="audio-player" />
      <a
        href={url}
        download="speech.mp3"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
      >
        <span className="inline-block skew-x-12 transition-transform duration-200 ease-linear group-hover:skew-x-0">
          <span aria-hidden="true">⬇</span> DOWNLOAD MP3
        </span>
      </a>
    </section>
  )
}
