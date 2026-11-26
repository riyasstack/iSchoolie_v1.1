import { defineConfig, devices } from "@playwright/test";

/**
 * Browser journeys. Requires the database and (for scheduling) the worker:
 *   npm run db:start   (or your own DATABASE_URL)
 *   npm run worker
 * Dev servers are started automatically if they aren't already running: the demo server on
 * :3000 and, for the live-guest project, a live-mode (Supabase Auth) server on :3001.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
        { command: "npm run dev:live", url: "http://localhost:3001/api/health", reuseExistingServer: true, timeout: 180_000 },
      ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } }, testIgnore: /(mobile|live-guest).spec.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    {
      name: "live-guest",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, baseURL: process.env.E2E_LIVE_URL ?? "http://localhost:3001" },
      testMatch: /live-guest\.spec\.ts/,
    },
  ],
});
