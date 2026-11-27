import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { tryResolveRequestContext } from "@/server/context";
import { getPreferences } from "@/server/services/account";

/** Campus Cards typeface (variable font, self-hosted by next/font at build time). */
const campusFont = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-campus", display: "swap" });

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
  themeColor: "#f3f2fa",
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
      className={campusFont.variable}
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
