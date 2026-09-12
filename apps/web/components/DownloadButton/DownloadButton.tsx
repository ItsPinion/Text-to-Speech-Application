import { buttonClass } from "@/components/ui";
import { audioFilename } from "@/services/audio";

/**
 * DownloadButton (FR-007) — anchor with `download` pointing at the in-memory
 * object URL. Never fetches: the blob already exists when this is enabled.
 */
export interface DownloadButtonProps {
  enabled: boolean;
  audioId?: string | null;
  url?: string | null;
}

export function DownloadButton({ enabled, audioId, url }: DownloadButtonProps) {
  if (enabled && audioId && url) {
    return (
      <a
        href={url}
        download={audioFilename(audioId)}
        className={buttonClass("secondary", "md", "w-full")}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
        Download Audio
      </a>
    );
  }

  return (
    <button type="button" disabled className={buttonClass("secondary", "md", "w-full")}>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
      </svg>
      Download Audio
    </button>
  );
}
