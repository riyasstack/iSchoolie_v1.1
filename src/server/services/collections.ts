/** Lists, Topics and Moments. All reuse the central visibility policy and post serializer. */
import { prisma } from "../db";
import type { RequestContext } from "../context";
import { AppError, notFound, forbidden, invalid } from "../errors";
import { rateLimit } from "../ratelimit";
import { authorAccess, postAccess } from "../policy";
import { loadViewerGraph, mediaUrl, relationshipsFor, toUserDTO, userSelect } from "./graph";
import { serializePosts, isPost } from "./serialize";
import type { ListDTO, MomentDTO, TopicDTO, UserListItem } from "@/lib/types";

// ================================ Lists =========================================

type ListRow = Awaited<ReturnType<typeof loadList>>;

async function loadList(ctx: RequestContext, id: string) {
  const l = await prisma.list.findFirst({
    where: { workspaceId: ctx.workspace.id, id },
    include: { owner: { select: userSelect }, _count: { select: { members: true, subscriptions: true } } },
  });
  return l;
}

async function visibleList(ctx: RequestContext, id: string) {
  const l = await loadList(ctx, id);
  const g = await loadViewerGraph(prisma, ctx);
  // Private lists are visible only to their owner; blocked parties can't see each other's lists.
  if (!l || (l.isPrivate && l.ownerId !== ctx.actor.id) || (l.ownerId !== ctx.actor.id && authorAccess(g, { ...l.owner, isProtected: false }) !== "ok")) throw notFound("That circle");
  return l;
}

async function listDTOs(ctx: RequestContext, rows: NonNullable<ListRow>[]): Promise<ListDTO[]> {
  const ids = rows.map((r) => r.id);
  const [subs, pins] = await Promise.all([
    prisma.listSubscription.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, listId: { in: ids } }, select: { listId: true } }),
    prisma.listPin.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, listId: { in: ids } }, select: { listId: true } }),
  ]);
  const s = new Set(subs.map((x) => x.listId));
  const p = new Set(pins.map((x) => x.listId));
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    isPrivate: l.isPrivate,
    bannerUrl: mediaUrl(l.bannerMediaId),
    bannerMediaId: l.bannerMediaId,
    owner: toUserDTO(l.owner),
    memberCount: l._count.members,
    subscriberCount: l._count.subscriptions,
    viewer: { isOwner: l.ownerId === ctx.actor.id, subscribed: s.has(l.id), pinned: p.has(l.id) },
    createdAt: l.createdAt.toISOString(),
  }));
}

const listInclude = { owner: { select: userSelect }, _count: { select: { members: true, subscriptions: true } } } as const;

export async function myLists(ctx: RequestContext) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const [owned, subscribed, pinnedRows, discover] = await Promise.all([
    prisma.list.findMany({ where: { workspaceId: ws, ownerId: ctx.actor.id }, include: listInclude, orderBy: { createdAt: "desc" } }),
    prisma.list.findMany({ where: { workspaceId: ws, isPrivate: false, subscriptions: { some: { userId: ctx.actor.id } } }, include: listInclude }),
    prisma.listPin.findMany({ where: { workspaceId: ws, userId: ctx.actor.id }, select: { listId: true }, orderBy: { createdAt: "asc" } }),
    prisma.list.findMany({
      where: { workspaceId: ws, isPrivate: false, ownerId: { not: ctx.actor.id }, subscriptions: { none: { userId: ctx.actor.id } } },
      include: listInclude,
      take: 10,
    }),
  ]);
  const ok = (l: NonNullable<ListRow>) => l.ownerId === g.id || (!g.blockedBy.has(l.ownerId) && !g.blocking.has(l.ownerId) && !l.owner.suspended);
  const all = await listDTOs(ctx, [...owned, ...subscribed.filter(ok), ...discover.filter(ok)]);
  const byId = new Map(all.map((l) => [l.id, l]));
  return {
    pinned: pinnedRows.map((p) => byId.get(p.listId)).filter((x): x is ListDTO => !!x),
    yours: [...owned, ...subscribed.filter(ok)].map((l) => byId.get(l.id)!).filter(Boolean),
    discover: discover.filter(ok).map((l) => byId.get(l.id)!).filter(Boolean),
  };
}

export async function getList(ctx: RequestContext, id: string): Promise<ListDTO> {
  const l = await visibleList(ctx, id);
  return (await listDTOs(ctx, [l]))[0];
}

async function checkBanner(ctx: RequestContext, bannerMediaId: string | null) {
  if (!bannerMediaId) return;
  const m = await prisma.mediaAsset.findFirst({ where: { workspaceId: ctx.workspace.id, id: bannerMediaId } });
  if (!m || m.ownerId !== ctx.actor.id || m.kind !== "IMAGE" || m.status !== "READY" || m.scope !== "LIST") throw invalid("That cover image isn’t available.");
}

export async function createList(ctx: RequestContext, data: { name: string; description: string; isPrivate: boolean; bannerMediaId: string | null }) {
  await rateLimit(`list:${ctx.actor.id}`, 30, 3600);
  await checkBanner(ctx, data.bannerMediaId);
  const count = await prisma.list.count({ where: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.id } });
  if (count >= 100) throw invalid("You can own up to 100 lists in the demo.");
  const l = await prisma.list.create({ data: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.id, ...data } });
  return getList(ctx, l.id);
}

async function ownedList(ctx: RequestContext, id: string) {
  const l = await prisma.list.findFirst({ where: { workspaceId: ctx.workspace.id, id } });
  if (!l || (l.isPrivate && l.ownerId !== ctx.actor.id)) throw notFound("That circle");
  if (l.ownerId !== ctx.actor.id) throw forbidden("Only the circle owner can do that.");
  return l;
}

export async function updateList(ctx: RequestContext, id: string, data: { name: string; description: string; isPrivate: boolean; bannerMediaId: string | null }) {
  await ownedList(ctx, id);
  await checkBanner(ctx, data.bannerMediaId);
  await prisma.$transaction(async (tx) => {
    await tx.list.update({ where: { id }, data });
    // Making a list private removes its subscribers (they can no longer see it).
    if (data.isPrivate) {
      await tx.listSubscription.deleteMany({ where: { listId: id } });
      await tx.listPin.deleteMany({ where: { listId: id, userId: { not: ctx.actor.id } } });
    }
  });
  return getList(ctx, id);
}

export async function deleteList(ctx: RequestContext, id: string) {
  await ownedList(ctx, id);
  await prisma.list.delete({ where: { id } });
  return { deleted: true };
}

export async function setListMember(ctx: RequestContext, id: string, handle: string, on: boolean) {
  await ownedList(ctx, id);
  const ws = ctx.workspace.id;
  const u = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ws, handleLower: handle.toLowerCase() } } });
  if (!u) throw notFound("That account");
  if (on) {
    const g = await loadViewerGraph(prisma, ctx);
    if (g.blockedBy.has(u.id)) throw forbidden("You can’t add this account to lists.");
    if (g.blocking.has(u.id)) throw forbidden("Unblock this account to add it to a circle.");
    if (u.suspended) throw forbidden("This account is suspended.");
    const count = await prisma.listMember.count({ where: { listId: id } });
    if (count >= 500) throw invalid("Lists can have up to 500 members in the demo.");
    await prisma.listMember.createMany({ data: [{ workspaceId: ws, listId: id, userId: u.id }], skipDuplicates: true });
  } else {
    await prisma.listMember.deleteMany({ where: { workspaceId: ws, listId: id, userId: u.id } });
  }
  return getList(ctx, id);
}

export async function setListSubscription(ctx: RequestContext, id: string, on: boolean) {
  const l = await visibleList(ctx, id);
  if (l.ownerId === ctx.actor.id) throw invalid("You own this circle.");
  if (on) await prisma.listSubscription.createMany({ data: [{ workspaceId: ctx.workspace.id, listId: id, userId: ctx.actor.id }], skipDuplicates: true });
  else {
    await prisma.listSubscription.deleteMany({ where: { listId: id, userId: ctx.actor.id } });
    await prisma.listPin.deleteMany({ where: { listId: id, userId: ctx.actor.id } });
  }
  return getList(ctx, id);
}

export async function setListPin(ctx: RequestContext, id: string, on: boolean) {
  await visibleList(ctx, id);
  if (on) {
    const n = await prisma.listPin.count({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id } });
    if (n >= 5) throw invalid("You can pin up to 5 lists.");
    await prisma.listPin.createMany({ data: [{ workspaceId: ctx.workspace.id, listId: id, userId: ctx.actor.id }], skipDuplicates: true });
  } else await prisma.listPin.deleteMany({ where: { listId: id, userId: ctx.actor.id } });
  return getList(ctx, id);
}

export async function listPeople(ctx: RequestContext, id: string, kind: "members" | "followers"): Promise<UserListItem[]> {
  await visibleList(ctx, id);
  const g = await loadViewerGraph(prisma, ctx);
  const rows =
    kind === "members"
      ? (await prisma.listMember.findMany({ where: { listId: id }, include: { user: { select: { ...userSelect, bio: true } } }, orderBy: { addedAt: "desc" } })).map((r) => r.user)
      : (await prisma.listSubscription.findMany({ where: { listId: id }, include: { user: { select: { ...userSelect, bio: true } } }, orderBy: { createdAt: "desc" } })).map((r) => r.user);
  const visible = rows.filter((u) => !u.suspended && !g.blockedBy.has(u.id));
  const rel = await relationshipsFor(prisma, ctx, g, visible.map((u) => u.id));
  return visible.map((u) => ({ user: toUserDTO(u), bio: u.bio, relationship: rel.get(u.id)!, isSelf: u.id === g.id }));
}

/** Lists a user is a member of (public lists, plus the viewer's own private lists). */
export async function listsContaining(ctx: RequestContext, handle: string) {
  const u = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ctx.workspace.id, handleLower: handle.toLowerCase() } } });
  if (!u) throw notFound("That account");
  const rows = await prisma.list.findMany({
    where: { workspaceId: ctx.workspace.id, members: { some: { userId: u.id } }, OR: [{ isPrivate: false }, { ownerId: ctx.actor.id }] },
    include: listInclude,
  });
  return listDTOs(ctx, rows);
}

/** Lists owned by a user (public ones, or all if it's the viewer). */
export async function listsOwnedBy(ctx: RequestContext, handle: string) {
  const u = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ctx.workspace.id, handleLower: handle.toLowerCase() } } });
  if (!u) throw notFound("That account");
  const rows = await prisma.list.findMany({ where: { workspaceId: ctx.workspace.id, ownerId: u.id, ...(u.id === ctx.actor.id ? {} : { isPrivate: false }) }, include: listInclude });
  return listDTOs(ctx, rows);
}

/** For the membership selector: the viewer's own lists and whether `handle` is in each. */
export async function membershipFor(ctx: RequestContext, handle: string) {
  const u = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ctx.workspace.id, handleLower: handle.toLowerCase() } } });
  if (!u) throw notFound("That account");
  const rows = await prisma.list.findMany({ where: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.id }, include: listInclude, orderBy: { name: "asc" } });
  const members = new Set((await prisma.listMember.findMany({ where: { userId: u.id, listId: { in: rows.map((r) => r.id) } }, select: { listId: true } })).map((m) => m.listId));
  const dtos = await listDTOs(ctx, rows);
  return dtos.map((l) => ({ list: l, isMember: members.has(l.id) }));
}

// ================================ Topics ========================================

export async function topics(ctx: RequestContext): Promise<{ followed: TopicDTO[]; suggested: TopicDTO[] }> {
  const ws = ctx.workspace.id;
  const rows = await prisma.topic.findMany({ where: { workspaceId: ws }, include: { _count: { select: { follows: true } }, follows: { where: { userId: ctx.actor.id }, select: { userId: true } } }, orderBy: { name: "asc" } });
  const dto = rows.map((t) => ({ id: t.id, slug: t.slug, name: t.name, category: t.category, description: t.description, following: t.follows.length > 0, followerCount: t._count.follows }));
  return { followed: dto.filter((t) => t.following), suggested: dto.filter((t) => !t.following) };
}

export async function getTopic(ctx: RequestContext, slug: string): Promise<TopicDTO> {
  const t = await prisma.topic.findUnique({
    where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } },
    include: { _count: { select: { follows: true } }, follows: { where: { userId: ctx.actor.id }, select: { userId: true } } },
  });
  if (!t) throw notFound("That interest");
  return { id: t.id, slug: t.slug, name: t.name, category: t.category, description: t.description, following: t.follows.length > 0, followerCount: t._count.follows };
}

export async function setTopicFollow(ctx: RequestContext, slug: string, on: boolean) {
  const t = await getTopic(ctx, slug);
  if (on) await prisma.topicFollow.createMany({ data: [{ workspaceId: ctx.workspace.id, topicId: t.id, userId: ctx.actor.id }], skipDuplicates: true });
  else await prisma.topicFollow.deleteMany({ where: { topicId: t.id, userId: ctx.actor.id } });
  return getTopic(ctx, slug);
}

// ================================ Moments =======================================

const momentInclude = { owner: { select: userSelect }, _count: { select: { items: true } } } as const;

function momentDTO(ctx: RequestContext, m: { id: string; title: string; description: string; coverMediaId: string | null; owner: Parameters<typeof toUserDTO>[0]; ownerId: string; publishedAt: Date | null; createdAt: Date; updatedAt: Date; _count: { items: number } }): MomentDTO {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    coverUrl: mediaUrl(m.coverMediaId),
    coverMediaId: m.coverMediaId,
    owner: toUserDTO(m.owner),
    publishedAt: m.publishedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    itemCount: m._count.items,
    isOwner: m.ownerId === ctx.actor.id,
  };
}

export async function moments(ctx: RequestContext) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const [mine, published] = await Promise.all([
    prisma.moment.findMany({ where: { workspaceId: ws, ownerId: ctx.actor.id }, include: momentInclude, orderBy: { updatedAt: "desc" } }),
    prisma.moment.findMany({ where: { workspaceId: ws, publishedAt: { not: null }, ownerId: { not: ctx.actor.id } }, include: momentInclude, orderBy: { publishedAt: "desc" }, take: 30 }),
  ]);
  return {
    mine: mine.map((m) => momentDTO(ctx, m)),
    discover: published.filter((m) => authorAccess(g, { ...m.owner, isProtected: false }) === "ok").map((m) => momentDTO(ctx, m)),
  };
}

export async function getMoment(ctx: RequestContext, id: string) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const m = await prisma.moment.findFirst({ where: { workspaceId: ws, id }, include: { ...momentInclude, items: { orderBy: { position: "asc" }, select: { postId: true } } } });
  if (!m || (!m.publishedAt && m.ownerId !== ctx.actor.id)) throw notFound("That story");
  if (m.ownerId !== ctx.actor.id && authorAccess(g, { ...m.owner, isProtected: false }) !== "ok") throw notFound("That story");
  // Visibility is re-checked for every post at render time: curation never exposes protected content.
  const map = await serializePosts(prisma, ctx, g, m.items.map((i) => i.postId));
  const posts = m.items.map((i) => map.get(i.postId)!).filter(Boolean);
  return { moment: momentDTO(ctx, m), items: posts.map((p) => (isPost(p) ? { post: p } : { unavailable: p })), posts: posts.filter(isPost) };
}

async function validateMomentPosts(ctx: RequestContext, postIds: string[]) {
  const g = await loadViewerGraph(prisma, ctx);
  const rows = await prisma.post.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: postIds } }, include: { author: { select: userSelect } } });
  if (rows.length !== new Set(postIds).size) throw invalid("Some posts don’t exist.");
  for (const r of rows) {
    if (postAccess(g, r) !== "ok") throw invalid("You can only add posts you can see.");
    if (r.author.isProtected) throw invalid("Posts from protected accounts can’t be added to Moments.");
  }
}

async function checkCover(ctx: RequestContext, coverMediaId: string | null) {
  if (!coverMediaId) return;
  const m = await prisma.mediaAsset.findFirst({ where: { workspaceId: ctx.workspace.id, id: coverMediaId } });
  if (!m || m.ownerId !== ctx.actor.id || m.kind !== "IMAGE" || m.status !== "READY" || m.scope !== "MOMENT") throw invalid("That cover image isn’t available.");
}

export async function createMoment(ctx: RequestContext, data: { title: string; description: string; coverMediaId: string | null; postIds: string[] }) {
  await rateLimit(`moment:${ctx.actor.id}`, 30, 3600);
  await validateMomentPosts(ctx, data.postIds);
  await checkCover(ctx, data.coverMediaId);
  const m = await prisma.$transaction(async (tx) => {
    const m = await tx.moment.create({ data: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.id, title: data.title, description: data.description, coverMediaId: data.coverMediaId } });
    await tx.momentItem.createMany({ data: Array.from(new Set(data.postIds)).map((postId, position) => ({ workspaceId: ctx.workspace.id, momentId: m.id, postId, position })) });
    return m;
  });
  return getMoment(ctx, m.id);
}

async function ownedMoment(ctx: RequestContext, id: string) {
  const m = await prisma.moment.findFirst({ where: { workspaceId: ctx.workspace.id, id } });
  if (!m || (!m.publishedAt && m.ownerId !== ctx.actor.id)) throw notFound("That story");
  if (m.ownerId !== ctx.actor.id) throw forbidden("Only the creator can edit this story.");
  return m;
}

export async function updateMoment(ctx: RequestContext, id: string, data: { title: string; description: string; coverMediaId: string | null; postIds: string[] }) {
  await ownedMoment(ctx, id);
  await validateMomentPosts(ctx, data.postIds);
  await checkCover(ctx, data.coverMediaId);
  await prisma.$transaction(async (tx) => {
    await tx.moment.update({ where: { id }, data: { title: data.title, description: data.description, coverMediaId: data.coverMediaId } });
    await tx.momentItem.deleteMany({ where: { momentId: id } });
    await tx.momentItem.createMany({ data: Array.from(new Set(data.postIds)).map((postId, position) => ({ workspaceId: ctx.workspace.id, momentId: id, postId, position })) });
  });
  return getMoment(ctx, id);
}

export async function publishMoment(ctx: RequestContext, id: string, publish: boolean) {
  const m = await ownedMoment(ctx, id);
  if (publish) {
    const n = await prisma.momentItem.count({ where: { momentId: id } });
    if (!n) throw invalid("Add at least one post before publishing.");
  }
  await prisma.moment.update({ where: { id }, data: { publishedAt: publish ? m.publishedAt ?? new Date() : null } });
  return getMoment(ctx, id);
}

export async function deleteMoment(ctx: RequestContext, id: string) {
  await ownedMoment(ctx, id);
  await prisma.moment.delete({ where: { id } });
  return { deleted: true };
}

export { AppError };
