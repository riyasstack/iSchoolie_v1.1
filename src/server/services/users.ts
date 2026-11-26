import { prisma } from "../db";
import type { RequestContext } from "../context";
import { AppError, notFound, forbidden, invalid } from "../errors";
import { rateLimit } from "../ratelimit";
import { authorAccess, canViewProfileContent, type ViewerGraph } from "../policy";
import { loadViewerGraph, mediaUrl, relationshipsFor, toUserDTO, userSelect } from "./graph";
import { notify, retractNotification, dedupeKeys } from "./notifications";
import { validateHandle } from "@/lib/text";
import type { ProfileDTO, UserListItem } from "@/lib/types";

async function findByHandle(ctx: RequestContext, handle: string) {
  const u = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ctx.workspace.id, handleLower: handle.toLowerCase() } } });
  if (!u) throw notFound("That account");
  return u;
}

export async function getProfile(ctx: RequestContext, handle: string): Promise<ProfileDTO> {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const u = await findByHandle(ctx, handle);
  const access = authorAccess(g, u);
  const canView = access === "ok";
  const [followersCount, followingCount, postsCount, likesCount, mediaCount, listedCount, rel] = await Promise.all([
    prisma.follow.count({ where: { workspaceId: ws, followeeId: u.id } }),
    prisma.follow.count({ where: { workspaceId: ws, followerId: u.id } }),
    prisma.post.count({ where: { workspaceId: ws, authorId: u.id, deletedAt: null } }),
    canView ? prisma.like.count({ where: { workspaceId: ws, userId: u.id, post: { deletedAt: null } } }) : Promise.resolve(0),
    canView ? prisma.post.count({ where: { workspaceId: ws, authorId: u.id, deletedAt: null, media: { some: {} } } }) : Promise.resolve(0),
    prisma.listMember.count({ where: { workspaceId: ws, userId: u.id, list: { isPrivate: false } } }),
    relationshipsFor(prisma, ctx, g, [u.id]),
  ]);
  const relationship = rel.get(u.id)!;
  const isSelf = u.id === g.id;
  let canMessage = !isSelf && !relationship.blocking && !relationship.blockedBy && !u.suspended;
  if (canMessage && u.dmPolicy === "FOLLOWING" && !g.followers.has(u.id)) canMessage = false;
  return {
    ...toUserDTO(u),
    bio: access === "suspended" ? "" : u.bio,
    location: access === "suspended" ? "" : u.location,
    website: access === "suspended" ? "" : u.website,
    bannerUrl: access === "suspended" ? null : mediaUrl(u.bannerMediaId),
    avatarMediaId: u.avatarMediaId,
    bannerMediaId: u.bannerMediaId,
    createdAt: u.createdAt.toISOString(),
    followersCount,
    followingCount,
    postsCount,
    likesCount,
    mediaCount,
    listedCount,
    pinnedPostId: canView ? u.pinnedPostId : null,
    isSelf,
    suspended: u.suspended,
    canViewContent: canView,
    relationship,
    dmPolicy: u.dmPolicy,
    canMessage,
  };
}

/** Hover cards and mention lookups. */
export async function getProfileCard(ctx: RequestContext, handle: string) {
  return getProfile(ctx, handle);
}

export async function follow(ctx: RequestContext, handle: string) {
  await rateLimit(`follow:${ctx.actor.id}`, 200, 3600);
  const ws = ctx.workspace.id;
  const me = ctx.actor.id;
  const target = await findByHandle(ctx, handle);
  if (target.id === me) throw invalid("You can’t follow yourself.");
  if (target.suspended) throw forbidden("This account is suspended.");
  const block = await prisma.block.findFirst({ where: { workspaceId: ws, OR: [{ blockerId: me, blockedId: target.id }, { blockerId: target.id, blockedId: me }] } });
  if (block) throw new AppError("BLOCKED", block.blockerId === me ? "Unblock this account to follow it." : "You can’t follow this account.");
  if (target.isProtected) {
    const already = await prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: me, followeeId: target.id } } });
    if (!already) {
      await prisma.$transaction(async (tx) => {
        await tx.followRequest.createMany({ data: [{ workspaceId: ws, requesterId: me, targetId: target.id }], skipDuplicates: true });
        await notify(tx, ws, { recipientId: target.id, actorId: me, type: "FOLLOW_REQUEST", dedupeKey: dedupeKeys.followRequest(me, target.id) });
      });
      return getProfile(ctx, handle);
    }
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.follow.createMany({ data: [{ workspaceId: ws, followerId: me, followeeId: target.id }], skipDuplicates: true });
      await notify(tx, ws, { recipientId: target.id, actorId: me, type: "FOLLOW", dedupeKey: dedupeKeys.follow(me, target.id) });
    });
  }
  return getProfile(ctx, handle);
}

export async function unfollow(ctx: RequestContext, handle: string) {
  const ws = ctx.workspace.id;
  const target = await findByHandle(ctx, handle);
  await prisma.$transaction([
    prisma.follow.deleteMany({ where: { workspaceId: ws, followerId: ctx.actor.id, followeeId: target.id } }),
    // Cancels a pending request too.
    prisma.followRequest.deleteMany({ where: { workspaceId: ws, requesterId: ctx.actor.id, targetId: target.id } }),
    prisma.notification.deleteMany({ where: { workspaceId: ws, dedupeKey: dedupeKeys.followRequest(ctx.actor.id, target.id) } }),
  ]);
  return getProfile(ctx, handle);
}

export async function setProfileNotify(ctx: RequestContext, handle: string, on: boolean) {
  const target = await findByHandle(ctx, handle);
  const r = await prisma.follow.updateMany({ where: { workspaceId: ctx.workspace.id, followerId: ctx.actor.id, followeeId: target.id }, data: { notify: on } });
  if (!r.count) throw invalid("Follow this account to get notifications for its posts.");
  return getProfile(ctx, handle);
}

export async function listFollowRequests(ctx: RequestContext) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const [incoming, outgoing] = await Promise.all([
    prisma.followRequest.findMany({ where: { workspaceId: ws, targetId: ctx.actor.id }, orderBy: { createdAt: "desc" }, include: { requester: { select: { ...userSelect, bio: true } } } }),
    prisma.followRequest.findMany({ where: { workspaceId: ws, requesterId: ctx.actor.id }, orderBy: { createdAt: "desc" }, include: { target: { select: { ...userSelect, bio: true } } } }),
  ]);
  const rel = await relationshipsFor(prisma, ctx, g, [...incoming.map((r) => r.requesterId), ...outgoing.map((r) => r.targetId)]);
  return {
    incoming: incoming.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), user: toUserDTO(r.requester), bio: r.requester.bio, relationship: rel.get(r.requesterId)!, isSelf: false })),
    outgoing: outgoing.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), user: toUserDTO(r.target), bio: r.target.bio, relationship: rel.get(r.targetId)!, isSelf: false })),
  };
}

export async function respondToFollowRequest(ctx: RequestContext, handle: string, accept: boolean) {
  const ws = ctx.workspace.id;
  const requester = await findByHandle(ctx, handle);
  const req = await prisma.followRequest.findUnique({ where: { requesterId_targetId: { requesterId: requester.id, targetId: ctx.actor.id } } });
  if (!req || req.workspaceId !== ws) throw notFound("That follow request");
  await prisma.$transaction(async (tx) => {
    await tx.followRequest.delete({ where: { id: req.id } });
    await retractNotification(tx, ws, dedupeKeys.followRequest(requester.id, ctx.actor.id));
    if (accept) {
      await tx.follow.createMany({ data: [{ workspaceId: ws, followerId: requester.id, followeeId: ctx.actor.id }], skipDuplicates: true });
      await notify(tx, ws, { recipientId: requester.id, actorId: ctx.actor.id, type: "FOLLOW_ACCEPTED", dedupeKey: dedupeKeys.followAccepted(ctx.actor.id, requester.id) });
    }
  });
  return { accepted: accept };
}

export async function setBlock(ctx: RequestContext, handle: string, on: boolean) {
  const ws = ctx.workspace.id;
  const me = ctx.actor.id;
  const target = await findByHandle(ctx, handle);
  if (target.id === me) throw invalid("You can’t block yourself.");
  if (on) {
    await prisma.$transaction([
      prisma.block.createMany({ data: [{ workspaceId: ws, blockerId: me, blockedId: target.id }], skipDuplicates: true }),
      // Blocking removes follows and pending requests in both directions, and list memberships of the blocker's lists.
      prisma.follow.deleteMany({ where: { workspaceId: ws, OR: [{ followerId: me, followeeId: target.id }, { followerId: target.id, followeeId: me }] } }),
      prisma.followRequest.deleteMany({ where: { workspaceId: ws, OR: [{ requesterId: me, targetId: target.id }, { requesterId: target.id, targetId: me }] } }),
      prisma.listMember.deleteMany({ where: { workspaceId: ws, userId: target.id, list: { ownerId: me } } }),
      prisma.listSubscription.deleteMany({ where: { workspaceId: ws, userId: target.id, list: { ownerId: me } } }),
    ]);
  } else {
    await prisma.block.deleteMany({ where: { workspaceId: ws, blockerId: me, blockedId: target.id } });
  }
  return getProfile(ctx, handle);
}

export async function setMute(ctx: RequestContext, handle: string, on: boolean) {
  const ws = ctx.workspace.id;
  const target = await findByHandle(ctx, handle);
  if (target.id === ctx.actor.id) throw invalid("You can’t mute yourself.");
  if (on) await prisma.mute.createMany({ data: [{ workspaceId: ws, muterId: ctx.actor.id, mutedId: target.id }], skipDuplicates: true });
  else await prisma.mute.deleteMany({ where: { workspaceId: ws, muterId: ctx.actor.id, mutedId: target.id } });
  return getProfile(ctx, handle);
}

async function userItems(ctx: RequestContext, g: ViewerGraph, users: { id: string; bio: string; handle: string; displayName: string; avatarMediaId: string | null; isProtected: boolean; demoTeamBadge: boolean; suspended: boolean }[]): Promise<UserListItem[]> {
  const visible = users.filter((u) => !u.suspended && !g.blockedBy.has(u.id));
  const rel = await relationshipsFor(prisma, ctx, g, visible.map((u) => u.id));
  return visible.map((u) => ({ user: toUserDTO(u), bio: u.bio, relationship: rel.get(u.id)!, isSelf: u.id === g.id }));
}

export async function connections(ctx: RequestContext, handle: string, kind: "followers" | "following", opts: { cursor?: string | null; q?: string }) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const u = await findByHandle(ctx, handle);
  if (!canViewProfileContent(g, u)) throw new AppError(u.isProtected ? "PROTECTED" : "FORBIDDEN", "This list isn’t available.");
  const offset = opts.cursor ? parseInt(opts.cursor, 10) || 0 : 0;
  const PAGE = 30;
  const q = opts.q?.trim().toLowerCase();
  const userFilter = q ? { OR: [{ handleLower: { contains: q } }, { displayName: { contains: q, mode: "insensitive" as const } }] } : {};
  const rows =
    kind === "followers"
      ? (await prisma.follow.findMany({ where: { workspaceId: ws, followeeId: u.id, follower: userFilter }, orderBy: { createdAt: "desc" }, skip: offset, take: PAGE + 1, include: { follower: { select: { ...userSelect, bio: true } } } })).map((r) => r.follower)
      : (await prisma.follow.findMany({ where: { workspaceId: ws, followerId: u.id, followee: userFilter }, orderBy: { createdAt: "desc" }, skip: offset, take: PAGE + 1, include: { followee: { select: { ...userSelect, bio: true } } } })).map((r) => r.followee);
  return { items: await userItems(ctx, g, rows.slice(0, PAGE)), nextCursor: rows.length > PAGE ? String(offset + PAGE) : null };
}

/**
 * Suggestions ("Who to follow" / Connect). Predictable policy: accounts followed by
 * people you follow, ranked by how many of them follow it, then by shared topics;
 * excludes you, accounts you follow/requested, blocked either way, muted and suspended.
 */
export async function suggestions(ctx: RequestContext, limit = 3) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const exclude = new Set([g.id, ...g.following, ...g.requested, ...g.blocking, ...g.blockedBy, ...g.muting]);
  const fof = g.following.size
    ? await prisma.follow.groupBy({ by: ["followeeId"], where: { workspaceId: ws, followerId: { in: [...g.following] } }, _count: { _all: true } })
    : [];
  const score = new Map<string, number>();
  for (const r of fof) if (!exclude.has(r.followeeId)) score.set(r.followeeId, r._count._all * 10);
  const others = await prisma.user.findMany({ where: { workspaceId: ws, suspended: false, id: { notIn: [...exclude] } }, select: { ...userSelect, bio: true, avatarMediaId: true } });
  for (const u of others) if (!score.has(u.id)) score.set(u.id, u.bio ? 1 : 0);
  const ranked = others.filter((u) => u.avatarMediaId).sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.handle.localeCompare(b.handle));
  return userItems(ctx, g, ranked.slice(0, limit));
}

export async function blockedAccounts(ctx: RequestContext) {
  const g = await loadViewerGraph(prisma, ctx);
  const rows = await prisma.block.findMany({ where: { workspaceId: ctx.workspace.id, blockerId: ctx.actor.id }, orderBy: { createdAt: "desc" }, include: { blocked: { select: { ...userSelect, bio: true } } } });
  const rel = await relationshipsFor(prisma, ctx, g, rows.map((r) => r.blockedId));
  return rows.map((r) => ({ user: toUserDTO(r.blocked), bio: r.blocked.bio, relationship: rel.get(r.blockedId)!, isSelf: false }));
}

export async function mutedAccounts(ctx: RequestContext) {
  const g = await loadViewerGraph(prisma, ctx);
  const rows = await prisma.mute.findMany({ where: { workspaceId: ctx.workspace.id, muterId: ctx.actor.id }, orderBy: { createdAt: "desc" }, include: { muted: { select: { ...userSelect, bio: true } } } });
  const rel = await relationshipsFor(prisma, ctx, g, rows.map((r) => r.mutedId));
  return rows.map((r) => ({ user: toUserDTO(r.muted), bio: r.muted.bio, relationship: rel.get(r.mutedId)!, isSelf: false }));
}

export async function updateProfile(
  ctx: RequestContext,
  data: { displayName: string; bio: string; location: string; website: string; avatarMediaId: string | null; bannerMediaId: string | null },
) {
  await rateLimit(`profile:${ctx.actor.id}`, 30, 600);
  const ws = ctx.workspace.id;
  for (const mid of [data.avatarMediaId, data.bannerMediaId]) {
    if (!mid) continue;
    const m = await prisma.mediaAsset.findFirst({ where: { workspaceId: ws, id: mid } });
    if (!m || m.ownerId !== ctx.actor.id || m.kind !== "IMAGE" || m.status !== "READY") throw invalid("That image isn’t available. Upload it again.");
    if (m.scope !== "PROFILE") throw invalid("That image can’t be used as a profile image.");
  }
  await prisma.user.update({
    where: { id: ctx.actor.id },
    data: { displayName: data.displayName, bio: data.bio, location: data.location, website: data.website, avatarMediaId: data.avatarMediaId, bannerMediaId: data.bannerMediaId },
  });
  return getProfile(ctx, ctx.actor.handle);
}

export async function updateAccount(ctx: RequestContext, data: { isProtected?: boolean; dmPolicy?: "EVERYONE" | "FOLLOWING"; handle?: string }) {
  const ws = ctx.workspace.id;
  const patch: { isProtected?: boolean; dmPolicy?: "EVERYONE" | "FOLLOWING"; handle?: string; handleLower?: string } = {};
  if (data.isProtected !== undefined) patch.isProtected = data.isProtected;
  if (data.dmPolicy) patch.dmPolicy = data.dmPolicy;
  if (data.handle !== undefined && data.handle !== ctx.actor.handle) {
    const err = validateHandle(data.handle);
    if (err) throw invalid(err);
    const taken = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ws, handleLower: data.handle.toLowerCase() } } });
    if (taken && taken.id !== ctx.actor.id) throw new AppError("CONFLICT", "That username has been taken. Please choose another.");
    patch.handle = data.handle;
    patch.handleLower = data.handle.toLowerCase();
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.actor.id }, data: patch });
    // Unprotecting approves all pending follow requests (legacy behaviour).
    if (data.isProtected === false) {
      const pending = await tx.followRequest.findMany({ where: { workspaceId: ws, targetId: ctx.actor.id } });
      if (pending.length) {
        await tx.follow.createMany({ data: pending.map((p) => ({ workspaceId: ws, followerId: p.requesterId, followeeId: ctx.actor.id })), skipDuplicates: true });
        await tx.followRequest.deleteMany({ where: { workspaceId: ws, targetId: ctx.actor.id } });
      }
    }
  });
  const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx.actor.id } });
  return { handle: u.handle, isProtected: u.isProtected, dmPolicy: u.dmPolicy };
}

export async function demoIdentities(ctx: RequestContext) {
  const users = await prisma.user.findMany({ where: { workspaceId: ctx.workspace.id, isSeedActor: true, suspended: false }, select: { ...userSelect, bio: true }, orderBy: { handleLower: "asc" } });
  return users.map((u) => ({ ...toUserDTO(u), current: u.id === ctx.actor.id }));
}

export async function mentionSuggestions(ctx: RequestContext, q: string) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const s = q.replace(/^@/, "").toLowerCase();
  const users = await prisma.user.findMany({
    where: { workspaceId: ws, suspended: false, OR: [{ handleLower: { startsWith: s } }, { displayName: { contains: s, mode: "insensitive" } }] },
    select: { ...userSelect, bio: true },
    take: 20,
  });
  return users
    .filter((u) => !g.blockedBy.has(u.id) && !g.blocking.has(u.id))
    .sort((a, b) => Number(g.following.has(b.id)) - Number(g.following.has(a.id)) || a.handle.localeCompare(b.handle))
    .slice(0, 6)
    .map(toUserDTO);
}
