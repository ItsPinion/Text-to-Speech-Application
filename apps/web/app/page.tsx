import { TtsWorkspace } from "@/components/TtsWorkspace";
import { Badge, Button } from "@/components/ui";

/**
 * Server shell (Phase 3 contract): header + workspace. Everything stateful
 * lives behind the TtsWorkspace 'use client' boundary — this file stays a
 * server component for metadata and the future ClerkProvider slot (Phase 14).
 */
export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            Text to Speech <Badge variant="outline">v1</Badge>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Turn text into natural-sounding speech — free TTS, optional free AI enhancement.
          </p>
        </div>
        {/* v2 (Phase 14): Clerk sign-in slot. */}
        <Button variant="secondary" size="sm" disabled title="Sign in arrives in Phase 14">
          Sign in
        </Button>
      </header>

      <main>
        <TtsWorkspace />
      </main>

      <footer className="mt-auto pt-4 text-center text-xs text-slate-400">
        Phase 3 shell — components run on mock data; the live API replaces mocks in Phase 10.
      </footer>
    </div>
  );
}
