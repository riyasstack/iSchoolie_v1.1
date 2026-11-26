/** Public Supabase settings (safe for the browser). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function supabaseConfigured(): boolean {
  return /^https:\/\//.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY.length > 20 && !SUPABASE_PUBLISHABLE_KEY.includes("xxx");
}

/** Only same-site relative paths are allowed as post-auth destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/api/")) return fallback;
  return next.slice(0, 1000);
}
