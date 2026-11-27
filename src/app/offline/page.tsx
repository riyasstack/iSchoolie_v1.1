import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Unavailable" };

export default async function Offline({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const limited = reason === "rate_limited";
  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center gap-4 px-6 text-center">
      <img src="/brand/ischoolie-symbol.png" alt="iSchoolie" width={56} height={56} />
      <h1 className="text-display font-extrabold">{limited ? "Too many new demo sessions" : "You’re offline"}</h1>
      <p className="text-fg2">
        {limited
          ? "This network has started a lot of demo workspaces recently. Please wait a while and try again."
          : "iSchoolie can’t reach the server right now. Check your connection and try again."}
      </p>
      <Link href="/home" className="rounded-xl bg-accent px-6 py-2.5 font-semibold text-white">Try again</Link>
    </main>
  );
}
