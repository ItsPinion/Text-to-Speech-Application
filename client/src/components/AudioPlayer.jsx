/**
 * AUDIO.OUT panel — native <audio> with a neon frame, plus a status line
 * describing the synthesis that produced it.
 */
export default function AudioPlayer({ src, meta }) {
  return (
    <div
      data-testid="audio-out"
      className="animate-boot-reveal border-2 border-neon-cyan bg-black/70 p-4 shadow-[0_0_20px_rgba(0,255,255,0.2)]"
    >
      <p className="font-mono text-xs uppercase tracking-widest text-neon-cyan">
        {'> AUDIO.OUT'}
      </p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- pre-recorded speech, no captions available */}
      <audio controls src={src} data-testid="audio-element" className="mt-3 w-full" />
      {meta && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-chrome/50">
          {meta}
        </p>
      )}
    </div>
  );
}
