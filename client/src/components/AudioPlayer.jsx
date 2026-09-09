/**
 * AudioPlayer — native <audio controls> on the blob URL:
 * play, pause, seek and volume for free (spec §32).
 * key={src} resets playback state when new audio arrives.
 */
export default function AudioPlayer({ src }) {
  return (
    <audio
      data-testid="audio-player"
      key={src}
      controls
      src={src}
      preload="metadata"
      aria-label="Generated speech player"
    />
  );
}
