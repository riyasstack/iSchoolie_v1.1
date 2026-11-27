import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { tryResolveRequestContext } from "@/server/context";
import { getPreferences } from "@/server/services/account";

/** UI typeface: the system SF Pro on Apple devices, Inter (self-hosted by next/font) elsewhere. */
const uiFont = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: { default: "iSchoolie", template: "%s / iSchoolie" },
  description: "iSchoolie — a campus social network for classmates, clubs and study groups.",
  applicationName: "iSchoolie",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f7",
  interactiveWidget: "resizes-content",
};

export const dynamic = "force-dynamic";

/** Reads display preferences server-side so the first paint already uses the right theme. */
async function displayPrefs() {
  try {
    const ctx = await tryResolveRequestContext();
    if (!ctx) return null;
    return await getPreferences(ctx);
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const p = await displayPrefs();
  return (
    <html
      lang="en"
      className={uiFont.variable}
      data-theme={p?.theme ?? "DEFAULT"}
      data-accent={p?.accent ?? "brand"}
      data-reduced-motion={String(p?.reducedMotion ?? false)}
      style={{ ["--font-scale" as string]: String(p?.fontScale ?? 100) }}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
