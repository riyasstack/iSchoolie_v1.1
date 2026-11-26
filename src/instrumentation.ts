/**
 * Startup configuration checks (Node runtime only).
 * - APP_MODE must be "demo" or "live" (independent of NODE_ENV; no implicit default).
 * - demo: SESSION_SECRET must be strong.
 * - live: Supabase Auth settings must be present; without them sign-in is unavailable and
 *   private API requests are refused with AUTH_NOT_CONFIGURED. Never falls back to demo.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./server/env");
  const { log } = await import("./server/log");
  const mode = env.mode; // throws on invalid APP_MODE
  if (mode === "demo") {
    void env.sessionSecret; // throws if missing/weak
    log("info", "startup", { mode, note: "Isolated demo workspaces per browser session." });
  } else {
    const { supabaseConfigured } = await import("./lib/supabase/config");
    if (supabaseConfigured()) log("info", "startup", { mode, note: "Live network with Supabase Auth; signed-out visitors are read-only guests." });
    else log("error", "startup", { mode, note: "Supabase Auth isn't configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); private requests are refused. See AUTH_INTEGRATION.md." });
  }
}
