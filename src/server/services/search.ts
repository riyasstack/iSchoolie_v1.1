import { prisma } from "../db";
import type { RequestContext } from "../context";
import { invalid } from "../errors";
import { rateLimit } from "../ratelimit";
import { postAccess, filteredFromFeeds } from "../policy";
import { loadViewerGraph, relationshipsFor, toUserDTO, userSelect } from "./graph";
import { serializePosts, isPost } from "./serialize";
import { parseSearchQuery } from "@/lib/search-query";
import { CURATED_TRENDS } from "../seed/fixtures";
import type { Prisma } from "@/generated/prisma/client";
import type { TimelinePage, TrendDTO, UserListItem } from "@/lib/types";

const PAGE = 20;

export type SearchTab = "top" | "live" | "user" | "image" | "video";

function postWhere(ws: string, q: ReturnType<typeof parseSearchQuery>, userIds: Map<string, string>): Prisma.PostWhereInput {
  const and: Prisma.PostWhereInput[] = [{ workspaceId: ws }, { deletedAt: null }];
  for (const w of q.all) and.push({ textLower: { contains: w } });
  for (const p of q.phrases) and.push({ textLower: { contains: p } });
  if (q.any.length) and.push({ OR: q.any.map((w) => ({ textLower: { contains: w } })) });
  for (const n of q.none) and.push({ NOT: { textLower: { contains: n } } });
  for (const h of q.hashtags) and.push({ hashtags: { has: h } });
  const idOf = (h: string) => userIds.get(h) ?? "__none__";
  if (q.from.length) and.push({ authorId: { in: q.from.map(idOf) } });
  if (q.to.length) and.push({ replyTo: { authorId: { in: q.to.map(idOf) } } });
  for (const m of q.mentions) and.push({ mentions: { some: { userId: idOf(m) } } });
  if (q.since) and.push({ createdAt: { gte: new Date(`${q.since}T00:00:00Z`) } });
  if (q.until) and.push({ createdAt: { lt: new Date(`${q.until}T00:00:00Z`) } });
  if (q.filters.has("replies")) and.push({ replyToId: { not: null } });
  if (q.excludeReplies) and.push({ replyToId: null });
  if (q.filters.has("media")) and.push({ media: { some: {} } });
  if (q.filters.has("images")) and.push({ media: { some: { media: { kind: { in: ["IMAGE", "GIF"] } } } } });
  if (q.filters.has("videos")) and.push({ media: { some: { media: { kind: "VIDEO" } } } });
  if (q.filters.has("links")) and.push({ OR: [{ textLower: { contains: "http://" } }, { textLower: { contains: "https://" } }] });
  if (q.lang) and.push({ lang: q.lang });
  return { AND: and };
}

export async function searchPosts(ctx: RequestContext, query: string, tab: SearchTab, cursor?: string | null): Promise<TimelinePage> {
  await rateLimit(`search:${ctx.actor.id}`, 120, 60, "Too many searches. Wait a moment.");
  const q = parseSearchQuery(query.slice(0, 500));
  const empty = !q.all.length && !q.phrases.length && !q.any.length && !q.hashtags.length && !q.from.length && !q.to.length && !q.mentions.length && !q.filters.size && !q.since && !q.until;
  if (empty) return { entries: [], posts: [], nextCursor: null };
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const handles = [...q.from, ...q.to, ...q.mentions];
  const users = handles.length ? await prisma.user.findMany({ where: { workspaceId: ws, handleLower: { in: handles } }, select: { id: true, handleLower: true } }) : [];
  const userIds = new Map(users.map((u) => [u.handleLower, u.id]));
  const where = postWhere(ws, q, userIds);
  if (tab === "image") (where.AND as Prisma.PostWhereInput[]).push({ media: { some: { media: { kind: { in: ["IMAGE", "GIF"] } } } } });
  if (tab === "video") (where.AND as Prisma.PostWhereInput[]).push({ media: { some: { media: { kind: "VIDEO" } } } });
  const rows = await prisma.post.findMany({
    where,
    include: { author: { select: userSelect }, _count: { select: { likes: true, reposts: true, replies: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 500,
  });
  const prefs = await prisma.preferences.findUnique({ where: { userId: ctx.actor.id } });
  // Search respects visibility; muted accounts (and blocked) are excluded. Muted words apply to Home only.
  let visible = rows.filter((p) => postAccess(g, p) === "ok" && !(p.authorId !== g.id && g.muting.has(p.authorId)));
  if (prefs?.searchHideSensitive) visible = visible.filter((p) => !p.sensitive);
  visible = visible.filter((p) => p._count.likes >= q.minFaves && p._count.replies >= q.minReplies && p._count.reposts >= q.minReposts);
  if (tab === "top") {
    const now = Date.now();
    visible.sort((a, b) => {
      const s = (p: (typeof rows)[number]) => (p._count.likes + 2 * p._count.reposts + p._count.replies + 1) * Math.pow(0.5, (now - p.createdAt.getTime()) / (72 * 3600_000));
      return s(b) - s(a) || b.createdAt.getTime() - a.createdAt.getTime();
    });
  }
  const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
  const page = visible.slice(offset, offset + PAGE);
  const map = await serializePosts(prisma, ctx, g, page.map((p) => p.id));
  const posts = page.map((p) => map.get(p.id)).filter(isPost);
  return {
    entries: posts.map((p) => ({ key: `s:${p.id}`, postId: p.id, sortAt: p.createdAt })),
    posts,
    nextCursor: offset + PAGE < visible.length ? String(offset + PAGE) : null,
  };
}

export async function searchPeople(ctx: RequestContext, query: string, cursor?: string | null): Promise<{ items: UserListItem[]; nextCursor: string | null }> {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const s = query.trim().replace(/^@/, "").toLowerCase();
  if (!s) return { items: [], nextCursor: null };
  const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
  const rows = await prisma.user.findMany({
    where: { workspaceId: ws, suspended: false, OR: [{ handleLower: { contains: s } }, { displayName: { contains: s, mode: "insensitive" } }, { bio: { contains: s, mode: "insensitive" } }] },
    select: { ...userSelect, bio: true },
    take: 200,
  });
  const visible = rows
    .filter((u) => !g.blockedBy.has(u.id) && !(g.muting.has(u.id)))
    .sort((a, b) => Number(b.handle.toLowerCase().startsWith(s)) - Number(a.handle.toLowerCase().startsWith(s)) || Number(g.following.has(b.id)) - Number(g.following.has(a.id)) || a.handle.localeCompare(b.handle));
  const page = visible.slice(offset, offset + 30);
  const rel = await relationshipsFor(prisma, ctx, g, page.map((u) => u.id));
  return {
    items: page.map((u) => ({ user: toUserDTO(u), bio: u.bio, relationship: rel.get(u.id)!, isSelf: u.id === g.id })),
    nextCursor: offset + 30 < visible.length ? String(offset + 30) : null,
  };
}

/** Typeahead: people, hashtags and topics matching a prefix. */
export async function typeahead(ctx: RequestContext, query: string) {
  const ws = ctx.workspace.id;
  const s = query.trim().toLowerCase();
  if (!s) return { users: [], hashtags: [], topics: [] };
  const g = await loadViewerGraph(prisma, ctx);
  const bare = s.replace(/^[@#]/, "");
  const [users, tagRows, topics] = await Promise.all([
    s.startsWith("#")
      ? Promise.resolve([])
      : prisma.user.findMany({ where: { workspaceId: ws, suspended: false, OR: [{ handleLower: { startsWith: bare } }, { displayName: { contains: bare, mode: "insensitive" } }] }, select: userSelect, take: 8 }),
    prisma.$queryRaw<{ tag: string; n: bigint }[]>`
      SELECT tag, COUNT(*) AS n FROM (SELECT unnest("hashtags") AS tag FROM "Post" WHERE "workspaceId" = ${ws} AND "deletedAt" IS NULL) t
      WHERE tag LIKE ${bare.replace(/[%_\\]/g, "") + "%"} GROUP BY tag ORDER BY n DESC LIMIT 5`,
    prisma.topic.findMany({ where: { workspaceId: ws, name: { contains: bare, mode: "insensitive" } }, take: 3 }),
  ]);
  return {
    users: users.filter((u) => !g.blockedBy.has(u.id)).slice(0, 5).map(toUserDTO),
    hashtags: tagRows.map((r) => ({ tag: r.tag, count: Number(r.n) })),
    topics: topics.map((t) => ({ slug: t.slug, name: t.name })),
  };
}

export async function recordRecentSearch(ctx: RequestContext, query: string) {
  const q = query.trim().slice(0, 200);
  if (!q) return;
  await prisma.recentSearch.upsert({
    where: { userId_query: { userId: ctx.actor.id, query: q } },
    create: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, query: q },
    update: { createdAt: new Date() },
  });
  const extra = await prisma.recentSearch.findMany({ where: { userId: ctx.actor.id }, orderBy: { createdAt: "desc" }, skip: 10, select: { id: true } });
  if (extra.length) await prisma.recentSearch.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
}

export async function searchHistory(ctx: RequestContext) {
  const [recent, saved] = await Promise.all([
    prisma.recentSearch.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.savedSearch.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return { recent: recent.map((r) => ({ id: r.id, query: r.query })), saved: saved.map((s) => ({ id: s.id, query: s.query })) };
}

export async function clearRecentSearches(ctx: RequestContext, id?: string) {
  await prisma.recentSearch.deleteMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, ...(id ? { id } : {}) } });
  return searchHistory(ctx);
}

export async function saveSearch(ctx: RequestContext, query: string, on: boolean) {
  const q = query.trim().slice(0, 200);
  if (!q) throw invalid("Nothing to save.");
  if (on) {
    const n = await prisma.savedSearch.count({ where: { userId: ctx.actor.id } });
    if (n >= 25) throw invalid("You can save up to 25 searches.");
    await prisma.savedSearch.createMany({ data: [{ workspaceId: ctx.workspace.id, userId: ctx.actor.id, query: q }], skipDuplicates: true });
  } else await prisma.savedSearch.deleteMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, query: q } });
  return searchHistory(ctx);
}

/**
 * Trends: "measured" trends are hashtags counted from posts created in this
 * workspace during the last 7 days (distinct authors ≥ 2). "Curated" trends are
 * editorial demo entries and are labelled as such.
 */
export async function trends(ctx: RequestContext, category?: string | null): Promise<TrendDTO[]> {
  const ws = ctx.workspace.id;
  const since = new Date(Date.now() - 7 * 86400_000);
  const rows = await prisma.$queryRaw<{ tag: string; posts: bigint; authors: bigint }[]>`
    SELECT tag, COUNT(*) AS posts, COUNT(DISTINCT "authorId") AS authors FROM (
      SELECT unnest(p."hashtags") AS tag, p."authorId" FROM "Post" p JOIN "User" u ON u."id" = p."authorId"
      WHERE p."workspaceId" = ${ws} AND p."deletedAt" IS NULL AND p."createdAt" >= ${since} AND u."isProtected" = false AND u."suspended" = false
    ) t GROUP BY tag HAVING COUNT(DISTINCT "authorId") >= 2 ORDER BY posts DESC, tag ASC LIMIT 10`;
  const measured: TrendDTO[] = rows.map((r) => ({
    key: `m:${r.tag}`,
    label: `#${r.tag}`,
    query: `#${r.tag}`,
    category: "Buzzing in this demo",
    source: "measured",
    postCount: Number(r.posts),
    context: null,
  }));
  const curated: TrendDTO[] = [];
  for (const t of CURATED_TRENDS) {
    const q = parseSearchQuery(t.query);
    const where = postWhere(ws, q, new Map());
    const n = await prisma.post.count({ where });
    curated.push({ key: `c:${t.label}`, label: t.label, query: t.query, category: t.category, source: "curated", postCount: n, context: t.context });
  }
  const all = [...measured, ...curated];
  if (!category || category === "for-you") return all;
  if (category === "trending") return measured;
  return curated.filter((t) => t.category.toLowerCase() === category.toLowerCase());
}

export { filteredFromFeeds };
