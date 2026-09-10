/**
 * DOWNLOAD — same blob URL as the player, `speech.mp3` per the contract.
 */
import Button from './Button';

export default function DownloadButton({ src }) {
  return (
    <Button as="a" href={src} download="speech.mp3" variant="primary">
      ⬇ DOWNLOAD MP3
    </Button>
  );
}
