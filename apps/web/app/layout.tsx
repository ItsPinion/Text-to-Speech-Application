import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Text to Speech",
  description: "Turn text into natural speech — free TTS, free AI enhancement.",
};

// The layout shell is a server component (Phase 3 contract). Phase 14 drops
// <ClerkProvider> in here — the slot is intentional.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
