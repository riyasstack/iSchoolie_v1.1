/**
 * Timelines.
 *
 * Latest: posts by the viewer and accounts they follow (plus replies among them)
 * and reposts by followed accounts, strictly newest first. No recommendations.
 *
 * Home (documented, deterministic ranking — not Twitter's proprietary algorithm):
 *   candidates = Latest pool from the last 14 days
 *              + public posts matching followed topics (labelled with the topic)
 *              + public posts liked by 2+ people the viewer follows ("liked" context)
 *   score = recency (half-life 18h) × (1 + 0.25·ln(1 + likes + 2·reposts + replies))
 *           × source weight (followed 1.0, own 1.0, topic 0.55, liked-by-follows 0.45)
 *   Engagement is counted as of the first page's `asOf` instant, and the candidate
 *   set is limited to posts created before it, so paging is stable while new posts
 *   arrive (they surface through the "Show new posts" affordance).
 * Both honour visibility, blocks, mutes and muted words.
 */
import { prisma } from "../db";
import type { RequestContext } from "../context";
import { isMember } from "../viewer";
import { filteredFromFeeds, postAccess, canViewProfileContent, type ViewerGraph } from "../policy";
import { loadViewerGraph, toUserDTO, userSelect } from "./graph";
import { serializePosts, isPost } from "./serialize";
import { AppError, notFound } from "../errors";
import type { EntryContext, PostDTO, TimelineEntry, TimelinePage } from "@/lib/types";

const PAGE = 20;

interface Cand {
  key: string;
  postId: string;
  at: Date;
  context?: EntryContext;
}

function encode(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
function decode<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString()) as T;
  } catch {
    throw new AppError("VALIDATION", "Invalid cursor.");
  }
}

type ChronoCursor = { t: string; k: string };

function beforeCursor(c: Cand, cur: ChronoCursor | null) {
  if (!cur) return true;
  const t = new Date(cur.t).getTime();
  const ct = c.at.getTime();
  return ct < t || (ct === t && c.key < cur.k);
}

const postAuthorInclude = { author: { select: userSelect } } as const;

/** Loads chronological candidates (posts + reposts) for a set of authors. */
async function chronoCandidates(
  ctx: RequestContext,
  g: ViewerGraph,
  opts: { authors: string[] | null; repostersOf?: string[]; includeReplies: "none" | "among" | "all" | "self"; before: Date | null; take: number; mediaOnly?: boolean; applyFeedFilters: boolean },
): Promise<Cand[]> {
  const ws = ctx.workspace.id;
  const time = opts.before ? { lte: opts.before } : undefined;
  const replyFilter =
    opts.includeReplies === "none"
      ? { replyToId: null }
      : opts.includeReplies === "among"
        ? { OR: [{ replyToId: null }, { replyTo: { authorId: { in: opts.authors ?? [] } } }] }
        : opts.includeReplies === "self"
          ? { OR: [{ replyToId: null }, { replyTo: { authorId: { in: opts.authors ?? [] } } }] }
          : {};
  const posts = await prisma.post.findMany({
    where: {
      workspaceId: ws,
      ...(opts.authors ? { authorId: { in: opts.authors } } : {}),
      deletedAt: null,
      ...(time ? { createdAt: time } : {}),
      ...replyFilter,
      ...(opts.mediaOnly ? { media: { some: {} } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.take,
    include: postAuthorInclude,
  });
  const out: Cand[] = [];
  for (const p of posts) {
    if (postAccess(g, p) !== "ok") continue;
    if (opts.applyFeedFilters && filteredFromFeeds(g, p)) continue;
    out.push({ key: `p:${p.id}`, postId: p.id, at: p.createdAt });
  }
  if (opts.repostersOf?.length) {
    const reposts = await prisma.repost.findMany({
      where: { workspaceId: ws, userId: { in: opts.repostersOf }, ...(time ? { createdAt: time } : {}), post: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: opts.take,
      include: { user: { select: userSelect }, post: { include: postAuthorInclude } },
    });
    for (const r of reposts) {
      if (postAccess(g, r.post) !== "ok") continue;
      // In feeds, don't resurface the viewer's own posts via other people's reposts.
      if (opts.applyFeedFilters && (filteredFromFeeds(g, r.post) || g.muting.has(r.userId) || (r.post.authorId === g.id && r.userId !== g.id))) continue;
      out.push({ key: `r:${r.userId}:${r.postId}`, postId: r.postId, at: r.createdAt, context: { type: "repost", by: toUserDTO(r.user) } });
    }
  }
  return out;
}

async function finishChrono(ctx: RequestContext, g: ViewerGraph, cands: Cand[], cursor: ChronoCursor | null, opts: { parents?: boolean } = {}): Promise<TimelinePage> {
  const sorted = cands
    .filter((c) => beforeCursor(c, cursor))
    .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  // Deduplicate: a post appears once per page (the newest entry wins).
  const seen = new Set<string>();
  const page: Cand[] = [];
  for (const c of sorted) {
    if (seen.has(c.postId)) continue;
    seen.add(c.postId);
    page.push(c);
    if (page.length === PAGE) break;
  }
  return materialize(ctx, g, page, page.length === PAGE ? encode({ t: page[PAGE - 1].at.toISOString(), k: page[PAGE - 1].key } satisfies ChronoCursor) : null, opts);
}

async function materialize(ctx: RequestContext, g: ViewerGraph, page: Cand[], nextCursor: string | null, opts: { parents?: boolean } = {}): Promise<TimelinePage> {
  const ids = page.map((c) => c.postId);
  const map = await serializePosts(prisma, ctx, g, ids);
  // Optional parent context for replies (conversation module).
  const parentIds: string[] = [];
  if (opts.parents) {
    for (const id of ids) {
      const p = map.get(id);
      if (isPost(p) && p.replyToId) parentIds.push(p.replyToId);
    }
  }
  const parentMap = parentIds.length ? await serializePosts(prisma, ctx, g, parentIds) : new Map();
  const posts: PostDTO[] = [];
  const entries: TimelineEntry[] = [];
  const included = new Set<string>();
  for (const c of page) {
    const p = map.get(c.postId);
    if (!isPost(p)) continue;
    let parentId: string | undefined;
    if (opts.parents && p.replyToId && !c.context) {
      const parent = parentMap.get(p.replyToId);
      if (isPost(parent) && !filteredFromFeeds(g, { authorId: parent.author.id, textLower: parent.text.toLowerCase() })) {
        parentId = parent.id;
        if (!included.has(parent.id)) {
          posts.push(parent);
          included.add(parent.id);
        }
      }
    }
    if (!included.has(p.id)) {
      posts.push(p);
      included.add(p.id);
    }
    entries.push({ key: c.key, postId: p.id, context: c.context, parentId, sortAt: c.at.toISOString() });
  }
  return { entries, posts, nextCursor };
}

// --------------------------------------------------------------------------------

/**
 * Live-mode guests follow nobody: their Home is the public timeline — newest original
 * posts from public accounts (visibility rules still apply).
 */
export async function publicTimeline(ctx: RequestContext, cursorStr?: string | null): Promise<TimelinePage> {
  const g = await loadViewerGraph(prisma, ctx);
  const cursor = decode<ChronoCursor>(cursorStr);
  const cands = await chronoCandidates(ctx, g, { authors: null, includeReplies: "none", before: cursor ? new Date(cursor.t) : null, take: PAGE * 3, applyFeedFilters: true });
  return finishChrono(ctx, g, cands, cursor, { parents: false });
}

export async function latestTimeline(ctx: RequestContext, cursorStr?: string | null): Promise<TimelinePage> {
  if (!isMember(ctx)) return publicTimeline(ctx, cursorStr);
  const g = await loadViewerGraph(prisma, ctx);
  const cursor = decode<ChronoCursor>(cursorStr);
  const authors = [g.id, ...g.following].filter((id) => !g.muting.has(id) || id === g.id);
  const cands = await chronoCandidates(ctx, g, {
    authors,
    repostersOf: [...g.following, g.id],
    includeReplies: "among",
    before: cursor ? new Date(cursor.t) : null,
    take: PAGE * 3,
    applyFeedFilters: true,
  });
  return finishChrono(ctx, g, cands, cursor, { parents: true });
}

type HomeCursor = { asOf: string; o: number };

export async function homeTimeline(ctx: RequestContext, cursorStr?: string | null): Promise<TimelinePage> {
  if (!isMember(ctx)) return publicTimeline(ctx, cursorStr);
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const cur = decode<HomeCursor>(cursorStr);
  const asOf = cur ? new Date(cur.asOf) : new Date();
  const offset = cur?.o ?? 0;
  const since = new Date(asOf.getTime() - 14 * 86400_000);
  const authors = [g.id, ...g.following];

  const followed = await chronoCandidates(ctx, g, {
    authors,
    repostersOf: [...g.following],
    includeReplies: "among",
    before: asOf,
    take: 300,
    applyFeedFilters: true,
  });
  const source = new Map<string, number>();
  const recent = followed.filter((c) => c.at >= since);
  for (const c of recent) source.set(c.key, 1);

  // Topic matches from accounts the viewer doesn't follow.
  const topics = g.topicIds.size
    ? await prisma.topic.findMany({ where: { workspaceId: ws, id: { in: [...g.topicIds] } }, select: { slug: true, name: true, keywords: true } })
    : [];
  const topicCands: Cand[] = [];
  if (topics.length) {
    const pool = await prisma.post.findMany({
      where: { workspaceId: ws, deletedAt: null, replyToId: null, createdAt: { gte: since, lte: asOf }, authorId: { notIn: authors } },
      include: postAuthorInclude,
      take: 400,
    });
    for (const p of pool) {
      if (postAccess(g, p) !== "ok" || filteredFromFeeds(g, p)) continue;
      const t = topics.find((t) => t.keywords.some((k) => p.textLower.includes(k.toLowerCase())) || p.hashtags.some((h) => t.keywords.includes(h)));
      if (!t) continue;
      const key = `t:${p.id}`;
      topicCands.push({ key, postId: p.id, at: p.createdAt, context: { type: "topic", topic: { slug: t.slug, name: t.name } } });
      source.set(key, 0.55);
    }
  }

  // Posts liked by 2+ followed accounts (from outside the follow graph).
  const likedRows = g.following.size
    ? await prisma.like.groupBy({
        by: ["postId"],
        where: { workspaceId: ws, userId: { in: [...g.following] }, createdAt: { gte: since, lte: asOf }, post: { authorId: { notIn: authors }, deletedAt: null, replyToId: null } },
        _count: { _all: true },
        having: { postId: { _count: { gte: 2 } } },
      })
    : [];
  const likedCands: Cand[] = [];
  if (likedRows.length) {
    const rows = await prisma.post.findMany({ where: { workspaceId: ws, id: { in: likedRows.map((r) => r.postId) } }, include: postAuthorInclude });
    const likers = await prisma.like.findMany({ where: { workspaceId: ws, postId: { in: rows.map((r) => r.id) }, userId: { in: [...g.following] } }, include: { user: { select: userSelect } }, orderBy: { createdAt: "desc" } });
    for (const p of rows) {
      if (postAccess(g, p) !== "ok" || filteredFromFeeds(g, p)) continue;
      const by = likers.find((l) => l.postId === p.id);
      if (!by) continue;
      const key = `l:${p.id}`;
      likedCands.push({ key, postId: p.id, at: p.createdAt, context: { type: "liked", by: toUserDTO(by.user) } });
      source.set(key, 0.45);
    }
  }

  const all = [...recent, ...topicCands, ...likedCands];
  const ids = Array.from(new Set(all.map((c) => c.postId)));
  const [likes, reposts, replies] = await Promise.all([
    prisma.like.groupBy({ by: ["postId"], where: { workspaceId: ws, postId: { in: ids }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    prisma.repost.groupBy({ by: ["postId"], where: { workspaceId: ws, postId: { in: ids }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    prisma.post.groupBy({ by: ["replyToId"], where: { workspaceId: ws, replyToId: { in: ids }, deletedAt: null, createdAt: { lte: asOf } }, _count: { _all: true } }),
  ]);
  const m = (rows: { _count: { _all: number } }[], k: (r: never) => string) => new Map(rows.map((r) => [k(r as never), r._count._all]));
  const L = m(likes, (r: { postId: string }) => r.postId);
  const R = m(reposts, (r: { postId: string }) => r.postId);
  const Rp = m(replies, (r: { replyToId: string }) => r.replyToId);
  const HALF_LIFE_H = 18;
  const score = (c: Cand) => {
    const ageH = Math.max(0, (asOf.getTime() - c.at.getTime()) / 3600_000);
    const engagement = (L.get(c.postId) ?? 0) + 2 * (R.get(c.postId) ?? 0) + (Rp.get(c.postId) ?? 0);
    return Math.pow(0.5, ageH / HALF_LIFE_H) * (1 + 0.25 * Math.log1p(engagement)) * (source.get(c.key) ?? 1);
  };
  const ranked = all
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s || (a.c.key < b.c.key ? -1 : 1))
    .map((x) => x.c);
  const seen = new Set<string>();
  const deduped = ranked.filter((c) => (seen.has(c.postId) ? false : (seen.add(c.postId), true)));
  const page = deduped.slice(offset, offset + PAGE);
  const next = offset + PAGE < deduped.length ? encode({ asOf: asOf.toISOString(), o: offset + PAGE } satisfies HomeCursor) : null;
  const res = await materialize(ctx, g, page, next, { parents: true });
  res.note = "Ranked by recency, engagement and your followed topics.";
  return res;
}

/** Count of posts newer than `since` that would appear in Latest (for "Show new posts"). */
export async function newPostsSince(ctx: RequestContext, since: string) {
  if (!isMember(ctx)) return { count: 0, authors: [] };
  const g = await loadViewerGraph(prisma, ctx);
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) throw new AppError("VALIDATION", "Invalid date.");
  const rows = await prisma.post.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      authorId: { in: [...g.following] },
      deletedAt: null,
      createdAt: { gt: sinceDate },
      OR: [{ replyToId: null }, { replyTo: { authorId: { in: [...g.following, g.id] } } }],
    },
    include: postAuthorInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const visible = rows.filter((p) => postAccess(g, p) === "ok" && !filteredFromFeeds(g, p));
  return { count: visible.length, authors: visible.slice(0, 3).map((p) => toUserDTO(p.author)) };
}

// ------------------------------- profiles ---------------------------------------

async function profileTarget(ctx: RequestContext, g: ViewerGraph, handle: string) {
  const user = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ctx.workspace.id, handleLower: handle.toLowerCase() } }, select: { ...userSelect, pinnedPostId: true } });
  if (!user) throw notFound("That account");
  if (!canViewProfileContent(g, user)) throw new AppError(user.isProtected ? "PROTECTED" : "FORBIDDEN", "These posts are not available.");
  return user;
}

export async function profileTimeline(ctx: RequestContext, handle: string, tab: "posts" | "with_replies" | "media" | "likes", cursorStr?: string | null): Promise<TimelinePage> {
  const g = await loadViewerGraph(prisma, ctx);
  const user = await profileTarget(ctx, g, handle);
  const cursor = decode<ChronoCursor>(cursorStr);
  if (tab === "likes") {
    const rows = await prisma.like.findMany({
      where: { workspaceId: ctx.workspace.id, userId: user.id, post: { deletedAt: null }, ...(cursor ? { createdAt: { lte: new Date(cursor.t) } } : {}) },
      orderBy: [{ createdAt: "desc" }, { postId: "desc" }],
      take: PAGE * 2,
      include: { post: { include: postAuthorInclude } },
    });
    const cands = rows.filter((r) => postAccess(g, r.post) === "ok").map((r) => ({ key: `k:${r.postId}`, postId: r.postId, at: r.createdAt }));
    return finishChrono(ctx, g, cands, cursor);
  }
  const cands = await chronoCandidates(ctx, g, {
    authors: [user.id],
    repostersOf: tab === "media" ? undefined : [user.id],
    includeReplies: tab === "with_replies" ? "all" : tab === "media" ? "all" : "self",
    before: cursor ? new Date(cursor.t) : null,
    take: PAGE * 2,
    mediaOnly: tab === "media",
    applyFeedFilters: false,
  });
  const page = await finishChrono(ctx, g, cands, cursor);
  // Pinned post first on the first page of Posts.
  if (tab === "posts" && !cursor && user.pinnedPostId) {
    const map = await serializePosts(prisma, ctx, g, [user.pinnedPostId]);
    const pinned = map.get(user.pinnedPostId);
    if (isPost(pinned)) {
      page.entries = page.entries.filter((e) => !(e.postId === pinned.id && !e.context));
      page.entries.unshift({ key: `pin:${pinned.id}`, postId: pinned.id, context: { type: "pinned" }, sortAt: pinned.createdAt });
      if (!page.posts.some((p) => p.id === pinned.id)) page.posts.push(pinned);
    }
  }
  return page;
}

// ------------------------------- lists ------------------------------------------

export async function listTimeline(ctx: RequestContext, listId: string, cursorStr?: string | null): Promise<TimelinePage> {
  const g = await loadViewerGraph(prisma, ctx);
  const list = await prisma.list.findFirst({ where: { workspaceId: ctx.workspace.id, id: listId }, include: { members: { select: { userId: true } }, owner: { select: userSelect } } });
  if (!list || (list.isPrivate && list.ownerId !== g.id)) throw notFound("That list");
  if (list.ownerId !== g.id && (g.blockedBy.has(list.ownerId) || g.blocking.has(list.ownerId))) throw notFound("That list");
  const cursor = decode<ChronoCursor>(cursorStr);
  const members = list.members.map((m) => m.userId);
  if (!members.length) return { entries: [], posts: [], nextCursor: null };
  const cands = await chronoCandidates(ctx, g, {
    authors: members,
    repostersOf: members,
    includeReplies: "among",
    before: cursor ? new Date(cursor.t) : null,
    take: PAGE * 3,
    applyFeedFilters: true,
  });
  return finishChrono(ctx, g, cands, cursor);
}

// ------------------------------- topics -----------------------------------------

export async function topicTimeline(ctx: RequestContext, slug: string, cursorStr?: string | null): Promise<TimelinePage> {
  const g = await loadViewerGraph(prisma, ctx);
  const topic = await prisma.topic.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } } });
  if (!topic) throw notFound("That topic");
  const cursor = decode<ChronoCursor>(cursorStr);
  const rows = await prisma.post.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      replyToId: null,
      ...(cursor ? { createdAt: { lte: new Date(cursor.t) } } : {}),
      OR: [...topic.keywords.map((k) => ({ textLower: { contains: k.toLowerCase() } })), { hashtags: { hasSome: topic.keywords } }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE * 2,
    include: postAuthorInclude,
  });
  const cands = rows.filter((p) => postAccess(g, p) === "ok" && !filteredFromFeeds(g, p)).map((p) => ({ key: `p:${p.id}`, postId: p.id, at: p.createdAt }));
  return finishChrono(ctx, g, cands, cursor);
}

// ------------------------------- bookmarks --------------------------------------

export async function bookmarksTimeline(ctx: RequestContext, cursorStr?: string | null): Promise<TimelinePage & { unavailable: number }> {
  const g = await loadViewerGraph(prisma, ctx);
  const cursor = decode<ChronoCursor>(cursorStr);
  const rows = await prisma.bookmark.findMany({
    where: { workspaceId: ctx.workspace.id, userId: g.id, ...(cursor ? { createdAt: { lte: new Date(cursor.t) } } : {}) },
    orderBy: [{ createdAt: "desc" }, { postId: "desc" }],
    take: PAGE * 2,
    include: { post: { include: postAuthorInclude } },
  });
  // Deleted or newly inaccessible bookmarks are skipped (no content leaks) and counted.
  let unavailable = 0;
  const cands: Cand[] = [];
  for (const r of rows) {
    if (postAccess(g, r.post) !== "ok") {
      unavailable++;
      continue;
    }
    cands.push({ key: `b:${r.postId}`, postId: r.postId, at: r.createdAt });
  }
  const page = await finishChrono(ctx, g, cands, cursor);
  return { ...page, unavailable };
}
