/**
 * DownloadButton — <a download> pointing at the SAME object URL the
 * audio player uses, so no second request is made.
 */
export default function DownloadButton({ href, filename = 'speech.mp3' }) {
  return (
    <a className="download-btn" href={href} download={filename}>
      ⬇ Download {filename}
    </a>
  );
}
