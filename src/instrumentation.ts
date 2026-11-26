/**
 * Startup configuration checks (Node runtime only).
 * - APP_MODE must be "demo" or "live" (independent of NODE_ENV; no implicit default).
 * - demo: SESSION_SECRET must be strong.
 * - live: there is no authentication provider in this build, so every private API
 *   request is refused with AUTH_NOT_CONFIGURED (see src/server/context.ts). It never
 *   falls back to demo mode.
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
    log("error", "startup", { mode, note: "Live mode has no authentication provider configured; private reads and mutations are refused. See AUTH_INTEGRATION.md." });
  }
}
