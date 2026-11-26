/**
 * Durable background worker (run as its own process: `npm run worker`).
 * Job claiming, retries and handlers live in src/server/jobs.ts, shared with the
 * serverless runners (inline after API responses, and /api/cron/jobs).
 * Also enqueues a recurring cleanup that deletes expired demo workspaces + uploads.
 */
import "dotenv/config";
import os from "node:os";
import { prisma } from "../src/server/db";
import { claimJobs, runJob, scheduleCleanup } from "../src/server/jobs";
import { log } from "../src/server/log";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
let stopping = false;

async function loop() {
  log("info", "worker_started", { worker: WORKER_ID, pollMs: POLL_MS });
  await scheduleCleanup(5_000);
  while (!stopping) {
    try {
      const jobs = await claimJobs(WORKER_ID);
      for (const j of jobs) await runJob(j);
      if (!jobs.length) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (e) {
      log("error", "worker_loop_error", { error: e instanceof Error ? e.message : String(e) });
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
    }
  }
  await prisma.$disconnect();
  log("info", "worker_stopped", { worker: WORKER_ID });
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
loop();
