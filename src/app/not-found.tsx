import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center gap-4 px-6 text-center">
      <img src="/brand/ischoolie-symbol.png" alt="iSchoolie" width={56} height={56} />
      <h1 className="text-display font-extrabold">This page doesn’t exist</h1>
      <p className="text-fg2">Try searching for something else, or head back home.</p>
      <div className="flex gap-3">
        <Link href="/home" className="rounded-full bg-accent px-6 py-2.5 font-bold text-accent-on">Go home</Link>
        <Link href="/explore" className="rounded-full border border-line-strong px-6 py-2.5 font-bold">Search</Link>
      </div>
    </main>
  );
}
