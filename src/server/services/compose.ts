/**
 * Drafts and scheduled posts (server-persisted source of truth).
 *
 * Scheduling: each schedule/reschedule enqueues a durable Job with uniqueKey
 * "publish:<scheduledId>:<epochMs>". The worker claims jobs transactionally
 * (FOR UPDATE SKIP LOCKED), re-reads the ScheduledPost under a row lock, and only
 * publishes when the job's time still matches and status is PENDING. Posts are
 * created with publicationKey "sched:<id>:<n>" (unique), so retries can never
 * create duplicates.
 */
import { prisma, type Tx } from "../db";
import type { RequestContext } from "../context";
import { AppError, notFound, invalid } from "../errors";
import { rateLimit } from "../ratelimit";
import { composeSchema } from "@/lib/schemas";
import { publishThread } from "./posts";
import { toMediaDTO, mediaSelect } from "./serialize";
import type { ComposePayload, DraftDTO, ScheduledDTO } from "@/lib/types";

async function mediaFor(ctx: RequestContext, payload: ComposePayload) {
  const ids = payload.items.flatMap((i) => i.mediaIds);
  if (!ids.length) return [];
  const rows = await prisma.mediaAsset.findMany({ where: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.id, id: { in: ids } }, select: mediaSelect });
  return rows.map(toMediaDTO);
}

async function assertOwnMedia(ctx: RequestContext, payload: ComposePayload) {
  const ids = payload.items.flatMap((i) => i.mediaIds);
  if (!ids.length) return;
  const n = await prisma.mediaAsset.count({ where: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.id, id: { in: ids } } });
  if (n !== new Set(ids).size) throw invalid("One of the attachments isn’t available.");
}

// --------------------------------- drafts ---------------------------------------

export async function listDrafts(ctx: RequestContext): Promise<DraftDTO[]> {
  const rows = await prisma.draft.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id }, orderBy: { updatedAt: "desc" }, take: 100 });
  return Promise.all(rows.map(async (d) => ({ id: d.id, payload: d.payload as unknown as ComposePayload, media: await mediaFor(ctx, d.payload as unknown as ComposePayload), updatedAt: d.updatedAt.toISOString() })));
}

export async function saveDraft(ctx: RequestContext, id: string | null, payload: ComposePayload): Promise<DraftDTO> {
  await rateLimit(`draft:${ctx.actor.id}`, 600, 600);
  await assertOwnMedia(ctx, payload);
  const json = payload as unknown as object;
  let row;
  if (id) {
    const existing = await prisma.draft.findFirst({ where: { workspaceId: ctx.workspace.id, id, userId: ctx.actor.id } });
    if (!existing) throw notFound("That draft");
    row = await prisma.draft.update({ where: { id }, data: { payload: json } });
  } else {
    const n = await prisma.draft.count({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id } });
    if (n >= 100) throw invalid("You have too many drafts. Delete some first.");
    row = await prisma.draft.create({ data: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, payload: json } });
  }
  return { id: row.id, payload, media: await mediaFor(ctx, payload), updatedAt: row.updatedAt.toISOString() };
}

export async function deleteDraft(ctx: RequestContext, id: string) {
  await prisma.draft.deleteMany({ where: { workspaceId: ctx.workspace.id, id, userId: ctx.actor.id } });
  return { deleted: true };
}

// ------------------------------- scheduled --------------------------------------

function toScheduledDTO(s: { id: string; payload: unknown; scheduledFor: Date; timezone: string; status: ScheduledDTO["status"]; publishedPostId: string | null; lastError: string | null }, media: ScheduledDTO["media"]): ScheduledDTO {
  return { id: s.id, payload: s.payload as ComposePayload, media, scheduledFor: s.scheduledFor.toISOString(), timezone: s.timezone, status: s.status, publishedPostId: s.publishedPostId, lastError: s.lastError };
}

export async function listScheduled(ctx: RequestContext): Promise<ScheduledDTO[]> {
  const rows = await prisma.scheduledPost.findMany({
    where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, status: { in: ["PENDING", "FAILED", "PUBLISHED"] } },
    orderBy: [{ status: "asc" }, { scheduledFor: "asc" }],
    take: 100,
  });
  return Promise.all(rows.map(async (s) => toScheduledDTO(s, await mediaFor(ctx, s.payload as unknown as ComposePayload))));
}

function validateTime(scheduledFor: Date) {
  const now = Date.now();
  if (Number.isNaN(scheduledFor.getTime())) throw invalid("Choose a valid date and time.");
  if (scheduledFor.getTime() < now + 60_000) throw invalid("Choose a time at least 1 minute in the future.");
  if (scheduledFor.getTime() > now + 548 * 86400_000) throw invalid("Posts can be scheduled up to 18 months ahead.");
}

async function enqueue(tx: Tx, scheduledId: string, scheduledFor: Date) {
  await tx.job.upsert({
    where: { uniqueKey: `publish:${scheduledId}:${scheduledFor.getTime()}` },
    create: { type: "publish_scheduled", uniqueKey: `publish:${scheduledId}:${scheduledFor.getTime()}`, runAt: scheduledFor, payload: { scheduledPostId: scheduledId, scheduledFor: scheduledFor.toISOString() } },
    update: {},
  });
}

export async function schedulePost(ctx: RequestContext, input: { payload: ComposePayload; scheduledFor: string; timezone: string }): Promise<ScheduledDTO> {
  await rateLimit(`schedule:${ctx.actor.id}`, 60, 3600);
  const when = new Date(input.scheduledFor);
  validateTime(when);
  await assertOwnMedia(ctx, input.payload);
  const pending = await prisma.scheduledPost.count({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, status: "PENDING" } });
  if (pending >= 50) throw invalid("You can have up to 50 scheduled posts in the demo.");
  const row = await prisma.$transaction(async (tx) => {
    const s = await tx.scheduledPost.create({ data: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, payload: input.payload as unknown as object, scheduledFor: when, timezone: input.timezone } });
    await enqueue(tx, s.id, when);
    return s;
  });
  return toScheduledDTO(row, await mediaFor(ctx, input.payload));
}

export async function updateScheduled(ctx: RequestContext, id: string, input: { payload: ComposePayload; scheduledFor: string; timezone: string }): Promise<ScheduledDTO> {
  const when = new Date(input.scheduledFor);
  validateTime(when);
  await assertOwnMedia(ctx, input.payload);
  const row = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ status: string; userId: string; workspaceId: string }[]>`SELECT "status", "userId", "workspaceId" FROM "ScheduledPost" WHERE "id" = ${id} FOR UPDATE`;
    if (!locked || locked.workspaceId !== ctx.workspace.id || locked.userId !== ctx.actor.id) throw notFound("That scheduled post");
    if (locked.status !== "PENDING") throw new AppError("CONFLICT", "This post was already published or canceled.");
    const s = await tx.scheduledPost.update({ where: { id }, data: { payload: input.payload as unknown as object, scheduledFor: when, timezone: input.timezone, lastError: null } });
    await enqueue(tx, id, when);
    return s;
  });
  return toScheduledDTO(row, await mediaFor(ctx, input.payload));
}

export async function cancelScheduled(ctx: RequestContext, id: string) {
  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ status: string; userId: string; workspaceId: string }[]>`SELECT "status", "userId", "workspaceId" FROM "ScheduledPost" WHERE "id" = ${id} FOR UPDATE`;
    if (!locked || locked.workspaceId !== ctx.workspace.id || locked.userId !== ctx.actor.id) throw notFound("That scheduled post");
    if (locked.status === "PUBLISHED") throw new AppError("CONFLICT", "This post was already published.");
    await tx.scheduledPost.update({ where: { id }, data: { status: "CANCELED" } });
  });
  return { canceled: true };
}

/**
 * Worker entry point. Returns "published" | "skipped" | throws (to be retried).
 * Uses a synthetic, server-derived context for the scheduled post's owner.
 */
export async function publishScheduled(scheduledPostId: string, jobScheduledFor: string): Promise<"published" | "skipped"> {
  return prisma.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string; status: string; userId: string; workspaceId: string; scheduledFor: Date; payload: unknown }[]>`
        SELECT "id", "status", "userId", "workspaceId", "scheduledFor", "payload" FROM "ScheduledPost" WHERE "id" = ${scheduledPostId} FOR UPDATE`;
      if (!row || row.status !== "PENDING") return "skipped";
      if (new Date(row.scheduledFor).getTime() !== new Date(jobScheduledFor).getTime()) return "skipped"; // superseded by a reschedule
      const already = await tx.post.findFirst({ where: { publicationKey: `sched:${row.id}:0` }, select: { id: true } });
      if (already) {
        await tx.scheduledPost.update({ where: { id: row.id }, data: { status: "PUBLISHED", publishedPostId: already.id } });
        return "skipped";
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId }, include: { workspace: true } });
      const ctx: RequestContext = {
        mode: user.workspace.kind === "LIVE" ? "live" : "demo",
        actor: { id: user.id, handle: user.handle },
        workspace: { id: user.workspaceId, kind: user.workspace.kind, createdAt: user.workspace.createdAt, expiresAt: user.workspace.expiresAt },
        capabilities: { switchActor: false, resetWorkspace: false },
      };
      const parsed = composeSchema.safeParse(row.payload);
      if (!parsed.success) {
        await tx.scheduledPost.update({ where: { id: row.id }, data: { status: "FAILED", lastError: parsed.error.issues[0]?.message ?? "Invalid post" } });
        return "skipped";
      }
      try {
        const ids = await publishThread(tx, ctx, parsed.data, { publicationKey: `sched:${row.id}` });
        await tx.scheduledPost.update({ where: { id: row.id }, data: { status: "PUBLISHED", publishedPostId: ids[0], lastError: null } });
        return "published";
      } catch (e) {
        if (e instanceof AppError && e.status < 500) {
          // Permanent validation problem (e.g. reply target deleted): record it truthfully.
          await tx.scheduledPost.update({ where: { id: row.id }, data: { status: "FAILED", lastError: e.message } });
          return "skipped";
        }
        throw e;
      }
    },
    { timeout: 30_000 },
  );
}
