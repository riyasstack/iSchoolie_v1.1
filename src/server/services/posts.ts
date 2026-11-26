import { prisma, type Db, type Tx } from "../db";
import type { RequestContext } from "../context";
import { isMember } from "../viewer";
import { AppError, notFound, forbidden, invalid } from "../errors";
import { rateLimit } from "../ratelimit";
import { canRepost, postAccess, replyEligibility, type ViewerGraph } from "../policy";
import { loadViewerGraph, toUserDTO, userSelect, relationshipsFor } from "./graph";
import { serializePosts, isPost, visiblePosts } from "./serialize";
import { notify, retractNotification, dedupeKeys } from "./notifications";
import { extractHashtags, extractMentions } from "@/lib/text";
import { firstLink, requestPreview } from "./link-preview";
import type { ComposePayload, PostDTO, PostDetailDTO, UnavailableDTO, UserListItem } from "@/lib/types";

function rid() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function one(db: Db, ctx: RequestContext, g: ViewerGraph, id: string): Promise<PostDTO> {
  const map = await serializePosts(db, ctx, g, [id]);
  const p = map.get(id);
  if (!isPost(p)) throw notFound("That post");
  return p;
}

async function loadVisiblePost(db: Db, ctx: RequestContext, g: ViewerGraph, id: string) {
  const post = await db.post.findFirst({
    where: { workspaceId: ctx.workspace.id, id },
    include: { author: { select: userSelect } },
  });
  if (!post) throw notFound("That post");
  const access = postAccess(g, post);
  if (access === "deleted") throw new AppError("GONE", "This post was deleted.");
  if (access !== "ok") throw new AppError(access === "protected" ? "PROTECTED" : "BLOCKED", "You can’t interact with this post.");
  return post;
}

// ------------------------------------------------------------------------------
// Publishing (shared by the API and the scheduled-publication worker)
// ------------------------------------------------------------------------------

export interface PublishOptions {
  /** Idempotency key from the client; retries return the original posts. */
  clientKey?: string;
  /** Unique publication key prefix for scheduled publication. */
  publicationKey?: string;
}

/** Validates and creates a post or thread inside `tx`. Returns created ids in order. */
export async function publishThread(tx: Tx, ctx: RequestContext, payload: ComposePayload, opts: PublishOptions): Promise<string[]> {
  const ws = ctx.workspace.id;
  const me = ctx.actor.id;

  if (opts.clientKey) {
    const existing = await tx.post.findUnique({ where: { authorId_clientKey: { authorId: me, clientKey: opts.clientKey } }, select: { id: true } });
    if (existing) {
      const rest = await tx.post.findMany({
        where: { authorId: me, clientKey: { startsWith: `${opts.clientKey}:` } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      return [existing.id, ...rest.map((r) => r.id)];
    }
  }

  const g = await loadViewerGraph(tx, ctx);
  const actor = await tx.user.findFirst({ where: { workspaceId: ws, id: me }, select: { suspended: true, isProtected: true } });
  if (!actor || actor.suspended) throw forbidden("This account can’t post.");

  // Reply target & eligibility.
  let parent: { id: string; conversationId: string | null } | null = null;
  if (payload.replyToId) {
    const p = await tx.post.findFirst({ where: { workspaceId: ws, id: payload.replyToId }, include: { author: { select: userSelect } } });
    if (!p) throw notFound("The post you’re replying to");
    const access = postAccess(g, p);
    if (access !== "ok") throw new AppError(access === "deleted" ? "GONE" : "FORBIDDEN", access === "deleted" ? "The post you’re replying to was deleted." : "You can’t reply to this post.");
    const rootId = p.conversationId ?? p.id;
    const root = await tx.post.findFirst({
      where: { workspaceId: ws, id: rootId },
      include: { author: { select: userSelect }, mentions: { select: { userId: true } } },
    });
    if (root) {
      const rootFollowsMe = await tx.follow.findUnique({ where: { followerId_followeeId: { followerId: root.authorId, followeeId: me } } });
      const elig = replyEligibility(
        g,
        { authorId: root.authorId, replyAudience: root.replyAudience, mentionIds: root.mentions.map((m) => m.userId), authorFollowing: new Set(rootFollowsMe ? [me] : []) },
        root.author,
      );
      if (!elig.ok) throw forbidden(elig.reason ?? "You can’t reply to this conversation.");
    }
    parent = { id: p.id, conversationId: rootId };
  }

  // Quote target.
  if (payload.quotedPostId) {
    const q = await tx.post.findFirst({ where: { workspaceId: ws, id: payload.quotedPostId }, include: { author: { select: userSelect } } });
    if (!q) throw notFound("The quoted post");
    const access = postAccess(g, q);
    if (access !== "ok") throw forbidden(access === "deleted" ? "The quoted post was deleted." : "You can’t quote this post.");
  }

  // Media ownership, state and combination rules.
  const allMedia = payload.items.flatMap((i) => i.mediaIds);
  if (new Set(allMedia).size !== allMedia.length) throw invalid("An attachment can only be used once.");
  const assets = allMedia.length
    ? await tx.mediaAsset.findMany({
        where: { workspaceId: ws, id: { in: allMedia } },
        include: { postLinks: { select: { postId: true } }, messageLinks: { select: { messageId: true } } },
      })
    : [];
  const assetById = new Map(assets.map((a) => [a.id, a]));
  for (const item of payload.items) {
    const kinds = item.mediaIds.map((mid) => {
      const a = assetById.get(mid);
      if (!a || a.ownerId !== me) throw invalid("One of your attachments is no longer available. Remove it and try again.");
      if (a.scope !== "POST") throw invalid("That file can’t be attached to a post.");
      if (a.status !== "READY") throw invalid(a.status === "FAILED" ? "An attachment failed to upload. Remove it and try again." : "An attachment is still processing.");
      if (a.postLinks.length || a.messageLinks.length) throw invalid("That attachment is already in use.");
      return a.kind;
    });
    const nonImage = kinds.filter((k) => k !== "IMAGE").length;
    if (nonImage > 0 && kinds.length > 1) throw invalid("You can add up to 4 photos, or 1 GIF, or 1 video per post.");
    if (kinds.length > 4) throw invalid("You can add up to 4 photos per post.");
  }

  // Resolve mentions to accounts in this workspace.
  const handles = Array.from(new Set(payload.items.flatMap((i) => extractMentions(i.text))));
  const mentioned = handles.length
    ? await tx.user.findMany({ where: { workspaceId: ws, handleLower: { in: handles } }, select: { id: true, handleLower: true } })
    : [];
  const mentionId = new Map(mentioned.map((m) => [m.handleLower, m.id]));

  const created: string[] = [];
  const base = Date.now();
  let prevId: string | null = parent?.id ?? null;
  let conversationId: string | null = parent?.conversationId ?? null;
  for (const [i, item] of payload.items.entries()) {
    const pid = rid();
    const isFirst = i === 0;
    await tx.post.create({
      data: {
        id: pid,
        workspaceId: ws,
        authorId: me,
        text: item.text,
        textLower: item.text.toLowerCase(),
        hashtags: extractHashtags(item.text),
        replyToId: prevId,
        conversationId: prevId ? conversationId : null,
        quotedPostId: isFirst ? payload.quotedPostId : null,
        replyAudience: payload.replyAudience,
        clientKey: opts.clientKey ? (isFirst ? opts.clientKey : `${opts.clientKey}:${i}`) : null,
        publicationKey: opts.publicationKey ? `${opts.publicationKey}:${i}` : null,
        createdAt: new Date(base + i),
      },
    });
    const ids = Array.from(new Set(extractMentions(item.text).map((h) => mentionId.get(h)).filter((x): x is string => !!x && x !== me)));
    if (ids.length) await tx.mention.createMany({ data: ids.map((userId) => ({ workspaceId: ws, postId: pid, userId })), skipDuplicates: true });
    if (item.mediaIds.length) await tx.postMedia.createMany({ data: item.mediaIds.map((mediaId, position) => ({ workspaceId: ws, postId: pid, mediaId, position })) });
    if (item.poll) {
      const pollId = rid();
      await tx.poll.create({ data: { id: pollId, workspaceId: ws, postId: pid, endsAt: new Date(base + item.poll.durationMinutes * 60_000) } });
      await tx.pollOption.createMany({ data: item.poll.choices.map((label, position) => ({ workspaceId: ws, pollId, position, label })) });
    }
    // Link card for the first URL when nothing else is attached (fetched later by the worker).
    const link = !item.mediaIds.length && !item.poll && !(isFirst && payload.quotedPostId) ? firstLink(item.text) : null;
    if (link) await requestPreview(tx, ws, link, me);
    if (!conversationId) conversationId = pid;
    prevId = pid;
    created.push(pid);
  }

  await notifyForNewPosts(tx, ctx, created, { parentId: parent?.id ?? null, quotedId: payload.quotedPostId, authorProtected: actor.isProtected });
  return created;
}

async function conversationMuted(db: Db, ws: string, userId: string, rootId: string | null) {
  if (!rootId) return false;
  const m = await db.conversationMute.findUnique({ where: { userId_rootPostId: { userId, rootPostId: rootId } } });
  return !!m;
}

async function notifyForNewPosts(tx: Tx, ctx: RequestContext, ids: string[], o: { parentId: string | null; quotedId: string | null; authorProtected: boolean }) {
  const ws = ctx.workspace.id;
  const me = ctx.actor.id;
  const followersOfMe = new Set((await tx.follow.findMany({ where: { workspaceId: ws, followeeId: me }, select: { followerId: true } })).map((f) => f.followerId));
  // Protected authors only notify people who can see the post.
  const canSee = (uid: string) => !o.authorProtected || followersOfMe.has(uid);
  for (const [i, pid] of ids.entries()) {
    const post = await tx.post.findUniqueOrThrow({ where: { id: pid }, select: { conversationId: true, replyToId: true, mentions: { select: { userId: true } } } });
    const notified = new Set<string>([me]);
    if (i === 0 && o.parentId) {
      const parent = await tx.post.findUnique({ where: { id: o.parentId }, select: { authorId: true } });
      if (parent && !notified.has(parent.authorId) && canSee(parent.authorId) && !(await conversationMuted(tx, ws, parent.authorId, post.conversationId))) {
        await notify(tx, ws, { recipientId: parent.authorId, actorId: me, type: "REPLY", postId: pid, dedupeKey: dedupeKeys.reply(pid, parent.authorId) });
      }
      if (parent) notified.add(parent.authorId);
    }
    if (i === 0 && o.quotedId) {
      const q = await tx.post.findUnique({ where: { id: o.quotedId }, select: { authorId: true } });
      if (q && !notified.has(q.authorId) && canSee(q.authorId)) {
        await notify(tx, ws, { recipientId: q.authorId, actorId: me, type: "QUOTE", postId: pid, dedupeKey: dedupeKeys.quote(pid) });
        notified.add(q.authorId);
      }
    }
    for (const m of post.mentions) {
      if (notified.has(m.userId) || !canSee(m.userId)) continue;
      if (await conversationMuted(tx, ws, m.userId, post.conversationId)) continue;
      await notify(tx, ws, { recipientId: m.userId, actorId: me, type: "MENTION", postId: pid, dedupeKey: dedupeKeys.mention(pid, m.userId) });
      notified.add(m.userId);
    }
    if (i === 0 && !post.replyToId) {
      const subs = await tx.follow.findMany({ where: { workspaceId: ws, followeeId: me, notify: true }, select: { followerId: true } });
      for (const s of subs) {
        if (notified.has(s.followerId)) continue;
        await notify(tx, ws, { recipientId: s.followerId, actorId: me, type: "SUBSCRIBED_POST", postId: pid, dedupeKey: dedupeKeys.subscribed(pid, s.followerId) });
      }
    }
  }
}

export async function createPost(ctx: RequestContext, payload: ComposePayload & { clientKey: string }): Promise<PostDTO[]> {
  await rateLimit(`post:${ctx.actor.id}`, 60, 600, "You’ve posted a lot in a short time. Take a breather and try again soon.");
  const ids = await prisma.$transaction((tx) => publishThread(tx, ctx, payload, { clientKey: payload.clientKey }), { timeout: 20_000 });
  const g = await loadViewerGraph(prisma, ctx);
  return visiblePosts(prisma, ctx, g, ids);
}

// ------------------------------------------------------------------------------
// Interactions
// ------------------------------------------------------------------------------

export async function setLike(ctx: RequestContext, postId: string, on: boolean): Promise<PostDTO> {
  await rateLimit(`like:${ctx.actor.id}`, 300, 600);
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const post = await loadVisiblePost(prisma, ctx, g, postId);
  if (on) {
    await prisma.$transaction(async (tx) => {
      await tx.like.createMany({ data: [{ workspaceId: ws, userId: ctx.actor.id, postId }], skipDuplicates: true });
      if (!(await conversationMuted(tx, ws, post.authorId, post.conversationId ?? post.id)))
        await notify(tx, ws, { recipientId: post.authorId, actorId: ctx.actor.id, type: "LIKE", postId, dedupeKey: dedupeKeys.like(ctx.actor.id, postId) });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.like.deleteMany({ where: { workspaceId: ws, userId: ctx.actor.id, postId } });
      await retractNotification(tx, ws, dedupeKeys.like(ctx.actor.id, postId));
    });
  }
  return one(prisma, ctx, g, postId);
}

export async function setRepost(ctx: RequestContext, postId: string, on: boolean): Promise<PostDTO> {
  await rateLimit(`repost:${ctx.actor.id}`, 200, 600);
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const post = await loadVisiblePost(prisma, ctx, g, postId);
  if (on) {
    if (!canRepost(g, post.author)) throw forbidden("Posts from protected accounts can’t be reposted.");
    await prisma.$transaction(async (tx) => {
      await tx.repost.createMany({ data: [{ workspaceId: ws, userId: ctx.actor.id, postId }], skipDuplicates: true });
      if (!(await conversationMuted(tx, ws, post.authorId, post.conversationId ?? post.id)))
        await notify(tx, ws, { recipientId: post.authorId, actorId: ctx.actor.id, type: "REPOST", postId, dedupeKey: dedupeKeys.repost(ctx.actor.id, postId) });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.repost.deleteMany({ where: { workspaceId: ws, userId: ctx.actor.id, postId } });
      await retractNotification(tx, ws, dedupeKeys.repost(ctx.actor.id, postId));
    });
  }
  return one(prisma, ctx, g, postId);
}

export async function setBookmark(ctx: RequestContext, postId: string, on: boolean): Promise<PostDTO> {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  if (on) {
    await loadVisiblePost(prisma, ctx, g, postId);
    await prisma.bookmark.createMany({ data: [{ workspaceId: ws, userId: ctx.actor.id, postId }], skipDuplicates: true });
  } else {
    await prisma.bookmark.deleteMany({ where: { workspaceId: ws, userId: ctx.actor.id, postId } });
  }
  const map = await serializePosts(prisma, ctx, g, [postId]);
  const p = map.get(postId);
  if (!isPost(p)) throw new AppError("GONE", "This post is no longer available.");
  return p;
}

export async function clearBookmarks(ctx: RequestContext) {
  const r = await prisma.bookmark.deleteMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id } });
  return { removed: r.count };
}

export async function setPinned(ctx: RequestContext, postId: string, on: boolean) {
  const ws = ctx.workspace.id;
  const post = await prisma.post.findFirst({ where: { workspaceId: ws, id: postId, deletedAt: null } });
  if (!post) throw notFound("That post");
  if (post.authorId !== ctx.actor.id) throw forbidden("You can only pin your own posts.");
  await prisma.user.update({ where: { id: ctx.actor.id }, data: { pinnedPostId: on ? postId : null } });
  return { pinnedPostId: on ? postId : null };
}

export async function deletePost(ctx: RequestContext, postId: string) {
  const ws = ctx.workspace.id;
  const post = await prisma.post.findFirst({ where: { workspaceId: ws, id: postId } });
  if (!post) throw notFound("That post");
  if (post.authorId !== ctx.actor.id) throw forbidden("You can only delete your own posts.");
  if (post.deletedAt) return { deleted: true };
  await prisma.$transaction(async (tx) => {
    await tx.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
    await tx.user.updateMany({ where: { id: ctx.actor.id, pinnedPostId: postId }, data: { pinnedPostId: null } });
    // Notifications whose target was this post stay; the read path renders them as unavailable.
  });
  return { deleted: true };
}

export async function setHiddenReply(ctx: RequestContext, postId: string, hidden: boolean): Promise<PostDTO> {
  const ws = ctx.workspace.id;
  const reply = await prisma.post.findFirst({ where: { workspaceId: ws, id: postId, deletedAt: null } });
  if (!reply || !reply.replyToId || !reply.conversationId) throw notFound("That reply");
  const root = await prisma.post.findFirst({ where: { workspaceId: ws, id: reply.conversationId } });
  if (!root || root.authorId !== ctx.actor.id) throw forbidden("Only the person who started the conversation can hide replies.");
  if (reply.authorId === ctx.actor.id) throw invalid("You can’t hide your own reply.");
  if (hidden) await prisma.hiddenReply.createMany({ data: [{ workspaceId: ws, postId, hiddenById: ctx.actor.id }], skipDuplicates: true });
  else await prisma.hiddenReply.deleteMany({ where: { workspaceId: ws, postId } });
  const g = await loadViewerGraph(prisma, ctx);
  return one(prisma, ctx, g, postId);
}

export async function setConversationMute(ctx: RequestContext, postId: string, muted: boolean): Promise<PostDTO> {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const post = await loadVisiblePost(prisma, ctx, g, postId);
  const rootPostId = post.conversationId ?? post.id;
  if (muted) await prisma.conversationMute.createMany({ data: [{ workspaceId: ws, userId: ctx.actor.id, rootPostId }], skipDuplicates: true });
  else await prisma.conversationMute.deleteMany({ where: { workspaceId: ws, userId: ctx.actor.id, rootPostId } });
  return one(prisma, ctx, g, postId);
}

export async function vote(ctx: RequestContext, postId: string, optionId: string): Promise<PostDTO> {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const post = await loadVisiblePost(prisma, ctx, g, postId);
  const poll = await prisma.poll.findFirst({ where: { workspaceId: ws, postId }, include: { options: true } });
  if (!poll) throw notFound("That poll");
  if (post.authorId === ctx.actor.id) throw forbidden("You can’t vote in your own poll.");
  if (poll.endsAt.getTime() <= Date.now()) throw new AppError("CONFLICT", "This poll has ended.");
  if (!poll.options.some((o) => o.id === optionId)) throw invalid("That choice isn’t part of this poll.");
  try {
    await prisma.$transaction(async (tx) => {
      // Re-check the deadline inside the transaction.
      const fresh = await tx.poll.findUniqueOrThrow({ where: { id: poll.id } });
      if (fresh.endsAt.getTime() <= Date.now()) throw new AppError("CONFLICT", "This poll has ended.");
      await tx.pollVote.create({ data: { workspaceId: ws, pollId: poll.id, userId: ctx.actor.id, optionId } });
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    const code = (e as { code?: string }).code;
    if (code === "P2002") throw new AppError("CONFLICT", "You already voted in this poll.");
    throw e;
  }
  return one(prisma, ctx, g, postId);
}

export async function getPost(ctx: RequestContext, postId: string): Promise<PostDTO | UnavailableDTO> {
  const g = await loadViewerGraph(prisma, ctx);
  const map = await serializePosts(prisma, ctx, g, [postId]);
  return map.get(postId) ?? { id: postId, unavailable: "not_found" };
}

// ------------------------------------------------------------------------------
// Detail, conversation, engagement lists
// ------------------------------------------------------------------------------

export async function postDetail(ctx: RequestContext, postId: string, opts: { cursor?: string | null; hidden?: boolean }): Promise<PostDetailDTO> {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const focalMap = await serializePosts(prisma, ctx, g, [postId]);
  const focal = focalMap.get(postId) ?? { id: postId, unavailable: "not_found" as const };
  if (!isPost(focal)) return { focal, ancestors: [], replies: [], nextCursor: null, hiddenReplyCount: 0, posts: [] };

  // Ancestors (parent chain), including tombstones.
  const chain: string[] = [];
  let cur = await prisma.post.findFirst({ where: { workspaceId: ws, id: postId }, select: { replyToId: true } });
  while (cur?.replyToId && chain.length < 40) {
    chain.unshift(cur.replyToId);
    cur = await prisma.post.findFirst({ where: { workspaceId: ws, id: cur.replyToId }, select: { replyToId: true } });
  }
  const ancMap = await serializePosts(prisma, ctx, g, chain);
  const ancestors = chain.map((id) => ancMap.get(id)!).filter(Boolean);

  // Direct replies.
  const offset = opts.cursor ? Math.max(0, parseInt(opts.cursor, 10) || 0) : 0;
  const PAGE = 20;
  const replyRows = await prisma.post.findMany({
    where: { workspaceId: ws, replyToId: postId, deletedAt: null, hiddenReply: opts.hidden ? { isNot: null } : { is: null } },
    select: { id: true, authorId: true, createdAt: true, _count: { select: { likes: true, replies: true } } },
    take: 500,
  });
  const ordered = replyRows
    .filter((r) => !g.muting.has(r.authorId) || opts.hidden)
    .sort((a, b) => {
      const rank = (r: typeof a) => (r.authorId === focal.author.id ? 0 : r.authorId === g.id ? 1 : g.following.has(r.authorId) ? 2 : 3);
      return rank(a) - rank(b) || b._count.likes - a._count.likes || a.createdAt.getTime() - b.createdAt.getTime();
    });
  const pageIds = ordered.slice(offset, offset + PAGE).map((r) => r.id);
  const replyMap = await serializePosts(prisma, ctx, g, pageIds);
  const replies = pageIds.map((id) => replyMap.get(id)).filter(isPost);
  const hiddenReplyCount = opts.hidden
    ? replies.length
    : await prisma.post.count({ where: { workspaceId: ws, replyToId: postId, deletedAt: null, hiddenReply: { isNot: null } } });

  // Owner insights: record a detail open by someone other than the author (one per day).
  if (focal.author.id !== g.id && !opts.cursor && isMember(ctx)) {
    const day = new Date().toISOString().slice(0, 10);
    await prisma.postEvent.createMany({
      data: [{ workspaceId: ws, postId, actorId: g.id, type: "detail_open", dedupeKey: `open:${postId}:${g.id}:${day}` }],
      skipDuplicates: true,
    });
  }
  return {
    focal,
    ancestors,
    replies,
    nextCursor: offset + PAGE < ordered.length ? String(offset + PAGE) : null,
    hiddenReplyCount,
    posts: [],
  };
}

async function engagementUsers(ctx: RequestContext, postId: string, kind: "likes" | "reposts", cursor?: string | null) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  await loadVisiblePost(prisma, ctx, g, postId);
  const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
  const PAGE = 30;
  const where = { workspaceId: ws, postId };
  const rows =
    kind === "likes"
      ? await prisma.like.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: PAGE + 1, include: { user: { select: { ...userSelect, bio: true } } } })
      : await prisma.repost.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: PAGE + 1, include: { user: { select: { ...userSelect, bio: true } } } });
  const visible = rows.slice(0, PAGE).filter((r) => !r.user.suspended && !g.blockedBy.has(r.user.id) && !g.blocking.has(r.user.id));
  const rel = await relationshipsFor(prisma, ctx, g, visible.map((r) => r.user.id));
  const items: UserListItem[] = visible.map((r) => ({ user: toUserDTO(r.user), bio: r.user.bio, relationship: rel.get(r.user.id)!, isSelf: r.user.id === g.id }));
  return { items, nextCursor: rows.length > PAGE ? String(offset + PAGE) : null };
}

export const likedBy = (ctx: RequestContext, postId: string, cursor?: string | null) => engagementUsers(ctx, postId, "likes", cursor);
export const repostedBy = (ctx: RequestContext, postId: string, cursor?: string | null) => engagementUsers(ctx, postId, "reposts", cursor);

export async function quotesOf(ctx: RequestContext, postId: string, cursor?: string | null) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  await loadVisiblePost(prisma, ctx, g, postId);
  const before = cursor ? new Date(cursor) : undefined;
  const rows = await prisma.post.findMany({
    where: { workspaceId: ws, quotedPostId: postId, deletedAt: null, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 21,
    select: { id: true, createdAt: true },
  });
  const posts = await visiblePosts(prisma, ctx, g, rows.slice(0, 20).map((r) => r.id));
  return {
    entries: posts.map((p) => ({ key: `p:${p.id}`, postId: p.id, sortAt: p.createdAt })),
    posts,
    nextCursor: rows.length > 20 ? rows[19].createdAt.toISOString() : null,
  };
}

/** Owner-only activity, computed from recorded events. No impressions are fabricated. */
export async function postActivity(ctx: RequestContext, postId: string) {
  const ws = ctx.workspace.id;
  const post = await prisma.post.findFirst({ where: { workspaceId: ws, id: postId, deletedAt: null } });
  if (!post) throw notFound("That post");
  if (post.authorId !== ctx.actor.id) throw forbidden("Only the author can see post activity.");
  const [likes, reposts, quotes, replies, bookmarks, opens, likeRows, repostRows] = await Promise.all([
    prisma.like.count({ where: { workspaceId: ws, postId } }),
    prisma.repost.count({ where: { workspaceId: ws, postId } }),
    prisma.post.count({ where: { workspaceId: ws, quotedPostId: postId, deletedAt: null } }),
    prisma.post.count({ where: { workspaceId: ws, replyToId: postId, deletedAt: null } }),
    prisma.bookmark.count({ where: { workspaceId: ws, postId } }),
    prisma.postEvent.count({ where: { workspaceId: ws, postId, type: "detail_open" } }),
    prisma.like.findMany({ where: { workspaceId: ws, postId }, select: { createdAt: true } }),
    prisma.repost.findMany({ where: { workspaceId: ws, postId }, select: { createdAt: true } }),
  ]);
  const days: { day: string; engagements: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    days.push({ day: d, engagements: 0 });
  }
  for (const r of [...likeRows, ...repostRows]) {
    const d = days.find((x) => x.day === r.createdAt.toISOString().slice(0, 10));
    if (d) d.engagements++;
  }
  return { likes, reposts, quotes, replies, bookmarks, detailOpens: opens, last7Days: days, recordedSince: post.createdAt.toISOString() };
}
