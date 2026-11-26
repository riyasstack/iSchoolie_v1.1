/**
 * Durable job queue (Job table) shared by every runner:
 * - `npm run worker` (long-running process, local/VM hosting)
 * - serverless hosting (Vercel): due jobs run in the background after API responses and
 *   from the cron route /api/cron/jobs (see runDueJobs).
 *
 * Jobs are claimed transactionally with FOR UPDATE SKIP LOCKED, so any number of runners
 * can work at once; stale RUNNING jobs (crashed runner) are re-claimed after a lease.
 * Failed jobs retry with exponential backoff up to maxAttempts. Handlers are idempotent
 * (scheduled publication is protected by row locks, status checks and a unique
 * publication key), so a retry never creates duplicate posts.
 */
import { prisma } from "./db";
import { publishScheduled } from "./services/compose";
import { cleanupExpiredWorkspaces } from "./services/workspace";
import { fetchAndStorePreview } from "./services/link-preview";
import { log } from "./log";

const LEASE_MS = 5 * 60_000;

interface JobRow {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export async function claimJobs(workerId: string, limit = 5): Promise<JobRow[]> {
  // Timestamps are stored as UTC "timestamp without time zone"; compare with explicit
  // UTC parameters rather than now(), which follows the DB session's time zone.
  const now = new Date();
  const leaseExpired = new Date(now.getTime() - LEASE_MS);
  return prisma.$queryRaw<JobRow[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = ${now}, "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
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

export async function runJob(job: JobRow) {
  const started = Date.now();
  try {
    let outcome = "done";
    if (job.type === "publish_scheduled") {
      const p = job.payload as { scheduledPostId: string; scheduledFor: string };
      outcome = await publishScheduled(p.scheduledPostId, p.scheduledFor);
    } else if (job.type === "link_preview") {
      const p = job.payload as { workspaceId: string; url: string; requestedBy: string };
      outcome = await fetchAndStorePreview(p.workspaceId, p.url, p.requestedBy);
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

export async function scheduleCleanup(inMs: number) {
  const runAt = new Date(Date.now() + inMs);
  // One cleanup job per 15-minute slot.
  const slot = Math.floor(runAt.getTime() / (15 * 60_000));
  await prisma.job.upsert({ where: { uniqueKey: `cleanup:${slot}` }, create: { type: "cleanup_workspaces", uniqueKey: `cleanup:${slot}`, runAt, payload: {} }, update: {} });
}

/** Claims and runs due jobs until none are left, a batch cap, or a time budget is reached. */
export async function runDueJobs(workerId: string, opts: { maxJobs?: number; budgetMs?: number } = {}) {
  const maxJobs = opts.maxJobs ?? 20;
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  let ran = 0;
  while (ran < maxJobs && Date.now() < deadline) {
    const jobs = await claimJobs(workerId, Math.min(5, maxJobs - ran));
    if (!jobs.length) break;
    for (const j of jobs) await runJob(j);
    ran += jobs.length;
  }
  return ran;
}

let lastInlineRun = 0;

/**
 * Serverless hosting has no worker process: when INLINE_JOBS=true, API requests kick off
 * a small background batch (after the response is sent), at most every 15 s per instance.
 */
export function shouldRunInlineJobs(): boolean {
  if (process.env.INLINE_JOBS !== "true") return false;
  const now = Date.now();
  if (now - lastInlineRun < 15_000) return false;
  lastInlineRun = now;
  return true;
}
