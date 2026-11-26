/**
 * Batch post serialization. Every surface turns post ids into PostDTOs here so
 * counts, viewer state, visibility and reply eligibility are identical everywhere.
 */
import type { Db } from "../db";
import type { RequestContext } from "../context";
import { postAccess, replyEligibility, canRepost, type ViewerGraph } from "../policy";
import { mediaUrl, toUserDTO, userSelect } from "./graph";
import type { MediaDTO, PollDTO, PostDTO, UnavailableDTO } from "@/lib/types";

type MediaRow = {
  id: string;
  kind: "IMAGE" | "GIF" | "VIDEO";
  mime: string;
  width: number | null;
  height: number | null;
  alt: string;
  status: "PENDING" | "READY" | "FAILED";
  thumbKey: string | null;
};

export function toMediaDTO(m: MediaRow): MediaDTO {
  return {
    id: m.id,
    kind: m.kind,
    url: mediaUrl(m.id)!,
    thumbUrl: m.thumbKey ? mediaUrl(m.id, "thumb") : null,
    width: m.width,
    height: m.height,
    alt: m.alt,
    status: m.status,
    mime: m.mime,
  };
}

export const mediaSelect = { id: true, kind: true, mime: true, width: true, height: true, alt: true, status: true, thumbKey: true } as const;

const postInclude = {
  author: { select: userSelect },
  media: { orderBy: { position: "asc" as const }, include: { media: { select: mediaSelect } } },
  poll: { include: { options: { orderBy: { position: "asc" as const } } } },
  mentions: { select: { userId: true, user: { select: { handle: true } } } },
  replyTo: { select: { id: true, author: { select: { handle: true } } } },
  hiddenReply: { select: { postId: true } },
};

export type SerializeMap = Map<string, PostDTO | UnavailableDTO>;

export async function serializePosts(
  db: Db,
  ctx: RequestContext,
  g: ViewerGraph,
  ids: string[],
  opts: { depth?: number } = {},
): Promise<SerializeMap> {
  const ws = ctx.workspace.id;
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out: SerializeMap = new Map();
  if (!unique.length) return out;
  const depth = opts.depth ?? 0;

  const rows = await db.post.findMany({ where: { workspaceId: ws, id: { in: unique } }, include: postInclude });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visible = rows.filter((r) => postAccess(g, r) === "ok");
  const visIds = visible.map((r) => r.id);

  const rootIds = Array.from(new Set(visible.map((r) => r.conversationId ?? r.id)));
  const quotedIds = depth === 0 ? Array.from(new Set(visible.map((r) => r.quotedPostId).filter((x): x is string => !!x))) : [];
  const pollIds = visible.map((r) => r.poll?.id).filter((x): x is string => !!x);

  const [replyCounts, repostCounts, likeCounts, quoteCounts, myLikes, myReposts, myBookmarks, myMutes, roots, pollCounts, myVotes, quotedMap] =
    await Promise.all([
      db.post.groupBy({ by: ["replyToId"], where: { workspaceId: ws, replyToId: { in: visIds }, deletedAt: null }, _count: { _all: true } }),
      db.repost.groupBy({ by: ["postId"], where: { workspaceId: ws, postId: { in: visIds } }, _count: { _all: true } }),
      db.like.groupBy({ by: ["postId"], where: { workspaceId: ws, postId: { in: visIds } }, _count: { _all: true } }),
      db.post.groupBy({ by: ["quotedPostId"], where: { workspaceId: ws, quotedPostId: { in: visIds }, deletedAt: null }, _count: { _all: true } }),
      db.like.findMany({ where: { workspaceId: ws, userId: g.id, postId: { in: visIds } }, select: { postId: true } }),
      db.repost.findMany({ where: { workspaceId: ws, userId: g.id, postId: { in: visIds } }, select: { postId: true } }),
      db.bookmark.findMany({ where: { workspaceId: ws, userId: g.id, postId: { in: visIds } }, select: { postId: true } }),
      db.conversationMute.findMany({ where: { workspaceId: ws, userId: g.id, rootPostId: { in: rootIds } }, select: { rootPostId: true } }),
      db.post.findMany({
        where: { workspaceId: ws, id: { in: rootIds } },
        select: { id: true, authorId: true, replyAudience: true, author: { select: userSelect }, mentions: { select: { userId: true } } },
      }),
      db.pollVote.groupBy({ by: ["optionId"], where: { workspaceId: ws, pollId: { in: pollIds } }, _count: { _all: true } }),
      db.pollVote.findMany({ where: { workspaceId: ws, userId: g.id, pollId: { in: pollIds } }, select: { pollId: true, optionId: true } }),
      quotedIds.length ? serializePosts(db, ctx, g, quotedIds, { depth: depth + 1 }) : Promise.resolve(new Map() as SerializeMap),
    ]);

  const count = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string | null>)[], key: K) =>
    new Map(rows.map((r) => [r[key] as string, r._count._all]));
  const replyC = count(replyCounts, "replyToId");
  const repostC = count(repostCounts, "postId");
  const likeC = count(likeCounts, "postId");
  const quoteC = count(quoteCounts, "quotedPostId");
  const pollC = count(pollCounts, "optionId");
  const liked = new Set(myLikes.map((x) => x.postId));
  const reposted = new Set(myReposts.map((x) => x.postId));
  const bookmarked = new Set(myBookmarks.map((x) => x.postId));
  const mutedConv = new Set(myMutes.map((x) => x.rootPostId));
  const rootMap = new Map(roots.map((r) => [r.id, r]));
  const voteMap = new Map(myVotes.map((v) => [v.pollId, v.optionId]));

  // Root authors' following sets for FOLLOWING-audience eligibility.
  const followingRootAuthors = Array.from(new Set(roots.filter((r) => r.replyAudience === "FOLLOWING").map((r) => r.authorId)));
  const rootFollows = followingRootAuthors.length
    ? await db.follow.findMany({ where: { workspaceId: ws, followerId: { in: followingRootAuthors }, followeeId: g.id }, select: { followerId: true } })
    : [];
  const rootFollowsViewer = new Set(rootFollows.map((f) => f.followerId));

  const now = Date.now();
  for (const id of unique) {
    const r = byId.get(id);
    if (!r) {
      out.set(id, { id, unavailable: "not_found" });
      continue;
    }
    const access = postAccess(g, r);
    if (access !== "ok") {
      out.set(id, { id, unavailable: access, authorHandle: access === "deleted" ? undefined : r.author.handle });
      continue;
    }
    const rootId = r.conversationId ?? r.id;
    const root = rootMap.get(rootId);
    let eligibility: { ok: boolean; reason: string | null } = { ok: true, reason: null };
    if (root) {
      eligibility = replyEligibility(
        g,
        {
          authorId: root.authorId,
          replyAudience: root.replyAudience,
          mentionIds: root.mentions.map((m) => m.userId),
          authorFollowing: root.replyAudience === "FOLLOWING" ? new Set(rootFollowsViewer.has(root.authorId) ? [g.id] : []) : undefined,
        },
        root.author,
      );
    }
    // Replies also require access to the direct parent author.
    if (eligibility.ok && postAccess(g, r) !== "ok") eligibility = { ok: false, reason: "You can’t reply to this post." };

    let poll: PollDTO | null = null;
    if (r.poll) {
      const options = r.poll.options.map((o) => ({ id: o.id, label: o.label, votes: pollC.get(o.id) ?? 0 }));
      const closed = r.poll.endsAt.getTime() <= now;
      const myVote = voteMap.get(r.poll.id) ?? null;
      poll = {
        id: r.poll.id,
        options,
        totalVotes: options.reduce((a, o) => a + o.votes, 0),
        endsAt: r.poll.endsAt.toISOString(),
        closed,
        viewerVoteOptionId: myVote,
        canVote: !closed && !myVote && r.authorId !== g.id,
      };
    }

    const replyingTo: string[] = [];
    if (r.replyTo) replyingTo.push(r.replyTo.author.handle);
    for (const m of r.mentions) if (!replyingTo.includes(m.user.handle) && r.replyToId && r.text.trimStart().startsWith(`@${m.user.handle}`)) replyingTo.push(m.user.handle);

    const rootAuthorIsViewer = root?.authorId === g.id;
    const dto: PostDTO = {
      id: r.id,
      author: toUserDTO(r.author),
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      lang: r.lang,
      sensitive: r.sensitive,
      replyToId: r.replyToId,
      replyingTo,
      conversationId: rootId,
      media: r.media.map((pm) => toMediaDTO(pm.media)),
      poll,
      quoted: r.quotedPostId ? (depth === 0 ? quotedMap.get(r.quotedPostId) ?? { id: r.quotedPostId, unavailable: "not_found" } : { id: r.quotedPostId, unavailable: "not_found" }) : null,
      counts: {
        replies: replyC.get(r.id) ?? 0,
        reposts: repostC.get(r.id) ?? 0,
        quotes: quoteC.get(r.id) ?? 0,
        likes: likeC.get(r.id) ?? 0,
      },
      viewer: {
        liked: liked.has(r.id),
        reposted: reposted.has(r.id),
        bookmarked: bookmarked.has(r.id),
        isAuthor: r.authorId === g.id,
        canReply: eligibility.ok,
        replyRestriction: eligibility.reason,
        conversationMuted: mutedConv.has(rootId),
        canHide: !!r.replyToId && rootAuthorIsViewer && r.authorId !== g.id,
        authorMuted: g.muting.has(r.authorId),
        authorFollowed: g.following.has(r.authorId),
      },
      replyAudience: r.replyAudience,
      pinned: false,
      hidden: !!r.hiddenReply,
    };
    if (!canRepost(g, r.author)) {
      // Surface the reason on the client via the author's protected flag.
    }
    out.set(id, dto);
  }
  // Pinned flags (author.pinnedPostId) in one query.
  const authorIds = Array.from(new Set(visible.map((r) => r.authorId)));
  if (authorIds.length) {
    const pins = await db.user.findMany({ where: { workspaceId: ws, id: { in: authorIds }, pinnedPostId: { not: null } }, select: { pinnedPostId: true } });
    for (const p of pins) {
      const d = p.pinnedPostId ? out.get(p.pinnedPostId) : undefined;
      if (d && "author" in d) d.pinned = true;
    }
  }
  return out;
}

export function isPost(x: PostDTO | UnavailableDTO | undefined | null): x is PostDTO {
  return !!x && !("unavailable" in x);
}

/** Convenience: serialize and return only visible PostDTOs in input order. */
export async function visiblePosts(db: Db, ctx: RequestContext, g: ViewerGraph, ids: string[]): Promise<PostDTO[]> {
  const map = await serializePosts(db, ctx, g, ids);
  return ids.map((id) => map.get(id)).filter(isPost);
}
