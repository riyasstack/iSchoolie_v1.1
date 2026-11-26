"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui-error]", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center" role="alert">
      <h1 className="text-display font-extrabold">Something went wrong</h1>
      <p className="text-fg2">This screen hit an unexpected error. You can try again{error.digest ? ` (reference ${error.digest})` : ""}.</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-accent px-6 py-2.5 font-bold text-accent-on">Try again</button>
        <Link href="/home" className="rounded-full border border-line-strong px-6 py-2.5 font-bold">Go home</Link>
      </div>
    </div>
  );
}
