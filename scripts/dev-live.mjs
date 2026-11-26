// Runs a second dev server in live mode (Supabase Auth) on port 3001, with its own build
// directory so it can run beside the demo server on :3000. Variables already set in the
// environment take precedence over .env, so APP_MODE here wins.
import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3001";
const child = spawn("npx", ["next", "dev", "--port", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, APP_MODE: "live", NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-live" },
});
child.on("exit", (code) => process.exit(code ?? 0));
