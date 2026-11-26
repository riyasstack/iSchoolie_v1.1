/**
 * Durable background worker (run as its own process: `npm run worker`).
 *
 * Claims due jobs transactionally with FOR UPDATE SKIP LOCKED so several workers
 * can run safely; stale RUNNING jobs (crashed worker) are re-claimed after a lease.
 * Failed jobs retry with exponential backoff up to maxAttempts. Job handlers are
 * idempotent (scheduled publication is protected by row locks, status checks and a
 * unique publication key), so a retry never creates duplicate posts.
 *
 * Also enqueues a recurring cleanup that deletes expired demo workspaces + uploads.
 */
import "dotenv/config";
import os from "node:os";
import { prisma } from "../src/server/db";
import { publishScheduled } from "../src/server/services/compose";
import { cleanupExpiredWorkspaces } from "../src/server/services/workspace";
import { log } from "../src/server/log";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const LEASE_MS = 5 * 60_000;
let stopping = false;

interface JobRow {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

async function claim(limit = 5): Promise<JobRow[]> {
  // Timestamps are stored as UTC "timestamp without time zone"; compare with explicit
  // UTC parameters rather than now(), which follows the DB session's time zone.
  const now = new Date();
  const leaseExpired = new Date(now.getTime() - LEASE_MS);
  return prisma.$queryRaw<JobRow[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = ${now}, "lockedBy" = ${WORKER_ID}, "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE ("status" = 'QUEUED' AND "runAt" <= ${now})
         OR ("status" = 'RUNNING' AND "lockedAt" < ${leaseExpired})
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

async function run(job: JobRow) {
  const started = Date.now();
  try {
    let outcome = "done";
    if (job.type === "publish_scheduled") {
      const p = job.payload as { scheduledPostId: string; scheduledFor: string };
      outcome = await publishScheduled(p.scheduledPostId, p.scheduledFor);
    } else if (job.type === "cleanup_workspaces") {
      const n = await cleanupExpiredWorkspaces();
      outcome = `deleted ${n}`;
      await scheduleCleanup(15 * 60_000);
    } else {
      throw new Error(`unknown job type ${job.type}`);
    }
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date(), lastError: null } });
    log("info", "job_done", { job: job.id.slice(-8), type: job.type, outcome, ms: Date.now() - started });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : String(e);
    const final = job.attempts >= job.maxAttempts;
    const backoff = Math.min(60 * 60_000, 2 ** job.attempts * 15_000);
    await prisma.job.update({
      where: { id: job.id },
      data: final ? { status: "FAILED", lastError: message, finishedAt: new Date() } : { status: "QUEUED", lastError: message, runAt: new Date(Date.now() + backoff), lockedAt: null, lockedBy: null },
    });
    if (final && job.type === "publish_scheduled") {
      const p = job.payload as { scheduledPostId: string };
      await prisma.scheduledPost.updateMany({ where: { id: p.scheduledPostId, status: "PENDING" }, data: { status: "FAILED", lastError: "The server couldn’t publish this post after several attempts." } });
    }
    log(final ? "error" : "warn", "job_failed", { job: job.id.slice(-8), type: job.type, attempt: job.attempts, final, error: message });
  }
}

async function scheduleCleanup(inMs: number) {
  const runAt = new Date(Date.now() + inMs);
  // One cleanup job per 15-minute slot.
  const slot = Math.floor(runAt.getTime() / (15 * 60_000));
  await prisma.job.upsert({ where: { uniqueKey: `cleanup:${slot}` }, create: { type: "cleanup_workspaces", uniqueKey: `cleanup:${slot}`, runAt, payload: {} }, update: {} });
}

async function loop() {
  log("info", "worker_started", { worker: WORKER_ID, pollMs: POLL_MS });
  await scheduleCleanup(5_000);
  while (!stopping) {
    try {
      const jobs = await claim();
      for (const j of jobs) await run(j);
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
