/**
 * Seeds one demo workspace from the deterministic fixtures. Content is identical on
 * every run; timestamps are relative to the workspace's creation time so the demo
 * feels current. Engagement is generated as real Like/Repost/Vote rows from seeded
 * accounts using a deterministic rule (no free-floating counters).
 */
import { randomUUID } from "node:crypto";
import type { Tx } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import {
  SEED_USERS, FOLLOWS, NOTIFY_ON, PENDING_REQUESTS, BLOCKS, MUTES, MUTED_WORDS, SEED_POSTS, PHOTO_DIMS, GIF_DIMS,
  VIDEO_DIMS, SEED_CONVERSATIONS, SEED_LISTS, SEED_TOPICS, SEED_MOMENTS, SEED_BOOKMARKS, SEED_PINS,
  SEED_HIDDEN_REPLIES, SEED_DRAFTS, SEED_SCHEDULED, SEED_SAVED_SEARCHES, SEED_RECENT_SEARCHES, DEFAULT_ACTOR,
  type SeedMediaRef,
} from "./fixtures";
import { extractHashtags, extractMentions } from "@/lib/text";
import { dedupeKeys } from "../services/notify-keys";

const id = () => randomUUID().replace(/-/g, "");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export async function seedWorkspace(tx: Tx, workspaceId: string, now = new Date()): Promise<{ defaultActorId: string }> {
  const ws = workspaceId;
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

  // ---- users + profile media -------------------------------------------------
  const userId = new Map<string, string>();
  const users: Prisma.UserCreateManyInput[] = [];
  const media: Prisma.MediaAssetCreateManyInput[] = [];
  for (const u of SEED_USERS) {
    const uid = id();
    userId.set(u.handle, uid);
    let avatarMediaId: string | null = null;
    let bannerMediaId: string | null = null;
    if (!u.noAvatar) {
      avatarMediaId = id();
      bannerMediaId = id();
      media.push(
        { id: avatarMediaId, workspaceId: ws, ownerId: uid, kind: "IMAGE", scope: "PROFILE", mime: "image/jpeg", storageKey: `seed/avatars/${u.handle}.jpg`, width: 400, height: 400, bytes: 0, alt: "" },
        { id: bannerMediaId, workspaceId: ws, ownerId: uid, kind: "IMAGE", scope: "PROFILE", mime: "image/jpeg", storageKey: `seed/banners/${u.handle}.jpg`, width: 1500, height: 500, bytes: 0, alt: "" },
      );
    }
    users.push({
      id: uid,
      workspaceId: ws,
      handle: u.handle,
      handleLower: u.handle.toLowerCase(),
      displayName: u.name,
      bio: u.bio,
      location: u.location ?? "",
      website: u.website ?? "",
      avatarMediaId,
      bannerMediaId,
      isProtected: !!u.protected,
      demoTeamBadge: !!u.team,
      suspended: !!u.suspended,
      dmPolicy: u.dmFollowingOnly ? "FOLLOWING" : "EVERYONE",
      createdAt: at(u.joinedDaysAgo * 1440),
    });
  }
  const U = (h: string) => {
    const v = userId.get(h);
    if (!v) throw new Error(`unknown seed handle ${h}`);
    return v;
  };
  await tx.user.createMany({ data: users });
  await tx.preferences.createMany({ data: SEED_USERS.map((u) => ({ userId: U(u.handle), workspaceId: ws })) });

  // ---- graph -------------------------------------------------------------------
  const follows: { workspaceId: string; followerId: string; followeeId: string; notify: boolean; createdAt: Date }[] = [];
  for (const [follower, list] of Object.entries(FOLLOWS))
    for (const followee of list)
      follows.push({
        workspaceId: ws,
        followerId: U(follower),
        followeeId: U(followee),
        notify: NOTIFY_ON.some(([a, b]) => a === follower && b === followee),
        createdAt: at(30 * 1440 * hash(follower + followee) + 60),
      });
  await tx.follow.createMany({ data: follows });
  const followsSet = new Set(follows.map((f) => `${f.followerId}>${f.followeeId}`));
  await tx.followRequest.createMany({ data: PENDING_REQUESTS.map(([a, b]) => ({ workspaceId: ws, requesterId: U(a), targetId: U(b), createdAt: at(300) })) });
  await tx.block.createMany({ data: BLOCKS.map(([a, b]) => ({ workspaceId: ws, blockerId: U(a), blockedId: U(b) })) });
  await tx.mute.createMany({ data: MUTES.map(([a, b]) => ({ workspaceId: ws, muterId: U(a), mutedId: U(b) })) });
  await tx.mutedWord.createMany({ data: MUTED_WORDS.map(([a, w]) => ({ workspaceId: ws, userId: U(a), phrase: w, phraseLower: w.toLowerCase() })) });

  // ---- posts ---------------------------------------------------------------------
  const postId = new Map<string, string>();
  for (const p of SEED_POSTS) postId.set(p.k, id());
  const P = (k: string) => {
    const v = postId.get(k);
    if (!v) throw new Error(`unknown seed post ${k}`);
    return v;
  };
  const byKey = new Map(SEED_POSTS.map((p) => [p.k, p]));
  const rootOf = (k: string): string => {
    let cur = byKey.get(k)!;
    while (cur.reply) cur = byKey.get(cur.reply)!;
    return cur.k;
  };
  const handleSet = new Map(SEED_USERS.map((u) => [u.handle.toLowerCase(), u.handle]));
  const mediaRef = (ref: SeedMediaRef, ownerId: string, scope: "POST" | "MESSAGE") => {
    const mid = id();
    if ("photo" in ref) {
      const [w, h] = PHOTO_DIMS[ref.photo];
      media.push({ id: mid, workspaceId: ws, ownerId, kind: "IMAGE", scope, mime: "image/jpeg", storageKey: `seed/photos/${ref.photo}`, width: w, height: h, bytes: 0, alt: ref.alt });
    } else if ("gif" in ref) {
      media.push({ id: mid, workspaceId: ws, ownerId, kind: "GIF", scope, mime: "image/gif", storageKey: `seed/gifs/${ref.gif}`, width: GIF_DIMS[0], height: GIF_DIMS[1], bytes: 0, alt: ref.alt });
    } else {
      media.push({ id: mid, workspaceId: ws, ownerId, kind: "VIDEO", scope, mime: "video/webm", storageKey: `seed/video/${ref.video}`, thumbKey: `seed/video/${ref.video.replace(/\.webm$/, "-poster.jpg")}`, width: VIDEO_DIMS[0], height: VIDEO_DIMS[1], bytes: 0, durationMs: 4000, alt: ref.alt });
    }
    return mid;
  };

  const posts: Prisma.PostCreateManyInput[] = [];
  const mentions: { workspaceId: string; postId: string; userId: string }[] = [];
  const postMedia: { workspaceId: string; postId: string; mediaId: string; position: number }[] = [];
  const polls: { id: string; workspaceId: string; postId: string; endsAt: Date }[] = [];
  const pollOptions: { id: string; workspaceId: string; pollId: string; position: number; label: string }[] = [];
  const pollFor = new Map<string, { pollId: string; optionIds: string[]; endsAt: Date }>();
  // Insert parents before children (replies/quotes reference earlier rows).
  const ordered = [...SEED_POSTS].sort((a, b) => b.ago - a.ago);
  for (const p of ordered) {
    const pid = P(p.k);
    const author = U(p.by);
    const createdAt = at(p.ago);
    posts.push({
      id: pid,
      workspaceId: ws,
      authorId: author,
      text: p.text,
      textLower: p.text.toLowerCase(),
      hashtags: extractHashtags(p.text),
      lang: p.lang ?? "en",
      replyToId: p.reply ? P(p.reply) : null,
      conversationId: p.reply ? P(rootOf(p.k)) : null,
      quotedPostId: p.quote ? P(p.quote) : null,
      replyAudience: p.audience ?? "EVERYONE",
      createdAt,
      deletedAt: p.deleted ? at(p.ago - 10) : null,
      sensitive: !!p.sensitive,
    });
    for (const m of extractMentions(p.text)) {
      const h = handleSet.get(m);
      if (h && h !== p.by) mentions.push({ workspaceId: ws, postId: pid, userId: U(h) });
    }
    (p.media ?? []).forEach((ref, i) => postMedia.push({ workspaceId: ws, postId: pid, mediaId: mediaRef(ref, author, "POST"), position: i }));
    if (p.poll) {
      const pollId = id();
      const endsAt = new Date(createdAt.getTime() + p.poll.endsInMinutes * 60_000);
      polls.push({ id: pollId, workspaceId: ws, postId: pid, endsAt });
      const optionIds = p.poll.choices.map((label, i) => {
        const oid = id();
        pollOptions.push({ id: oid, workspaceId: ws, pollId, position: i, label });
        return oid;
      });
      pollFor.set(p.k, { pollId, optionIds, endsAt });
    }
  }

  // ---- messages' media is created alongside, so collect before inserting media.
  const conversations: Prisma.ConversationCreateManyInput[] = [];
  const participants: Prisma.ParticipantCreateManyInput[] = [];
  const messages: Prisma.MessageCreateManyInput[] = [];
  const messageMedia: { workspaceId: string; messageId: string; mediaId: string }[] = [];
  const reactions: { workspaceId: string; messageId: string; userId: string; emoji: string; createdAt: Date }[] = [];
  for (const c of SEED_CONVERSATIONS) {
    const cid = id();
    const last = Math.min(...c.messages.map((m) => m.ago));
    conversations.push({
      id: cid,
      workspaceId: ws,
      kind: c.kind,
      name: c.name ?? null,
      directKey: c.kind === "DIRECT" ? c.members.map(U).sort().join(":") : null,
      createdById: U(c.creator),
      createdAt: at(Math.max(...c.messages.map((m) => m.ago)) + 1),
      lastMessageAt: at(last),
    });
    for (const m of c.members) {
      participants.push({
        workspaceId: ws,
        conversationId: cid,
        userId: U(m),
        role: m === c.creator ? "ADMIN" : "MEMBER",
        status: c.requests?.includes(m) ? "REQUEST" : "ACCEPTED",
        joinedAt: at(Math.max(...c.messages.map((x) => x.ago)) + 2),
        lastReadAt: at(c.readAgo?.[m] ?? Math.max(...c.messages.map((x) => x.ago)) + 2),
      });
    }
    for (const m of c.messages) {
      const mid = id();
      messages.push({ id: mid, workspaceId: ws, conversationId: cid, senderId: U(m.from), text: m.text, clientKey: `seed-${mid}`, createdAt: at(m.ago), sharedPostId: m.sharePost ? P(m.sharePost) : null });
      if (m.media) messageMedia.push({ workspaceId: ws, messageId: mid, mediaId: mediaRef(m.media, U(m.from), "MESSAGE") });
      for (const [who, emoji] of m.react ?? []) reactions.push({ workspaceId: ws, messageId: mid, userId: U(who), emoji, createdAt: at(m.ago - 1) });
    }
  }

  // Lists / moments covers
  const listBanner = new Map<string, string>();
  for (const l of SEED_LISTS) if (l.banner) listBanner.set(l.key, mediaRef({ photo: l.banner, alt: "" }, U(l.owner), "POST"));
  const momentCover = new Map<string, string>();
  for (const m of SEED_MOMENTS) if (m.cover) momentCover.set(m.key, mediaRef({ photo: m.cover, alt: "" }, U(m.owner), "POST"));
  // List/moment covers are not post attachments; mark their scope accordingly.
  for (const row of media) {
    if ([...listBanner.values()].includes(row.id as string)) row.scope = "LIST";
    if ([...momentCover.values()].includes(row.id as string)) row.scope = "MOMENT";
  }

  await tx.mediaAsset.createMany({ data: media });
  await tx.post.createMany({ data: posts });
  await tx.mention.createMany({ data: mentions, skipDuplicates: true });
  await tx.postMedia.createMany({ data: postMedia });
  await tx.poll.createMany({ data: polls });
  await tx.pollOption.createMany({ data: pollOptions });
  await tx.conversation.createMany({ data: conversations });
  await tx.participant.createMany({ data: participants });
  await tx.message.createMany({ data: messages });
  await tx.messageAttachment.createMany({ data: messageMedia });
  await tx.messageReaction.createMany({ data: reactions });

  // ---- deterministic engagement --------------------------------------------------
  // A seeded account likes/reposts a post when it follows the author (or the post
  // mentions it) and a stable hash of (account, post) falls under the post's heat.
  const likes: { workspaceId: string; userId: string; postId: string; createdAt: Date }[] = [];
  const reposts: { workspaceId: string; userId: string; postId: string; createdAt: Date }[] = [];
  const votes: { workspaceId: string; pollId: string; userId: string; optionId: string; createdAt: Date }[] = [];
  const blocked = new Set(BLOCKS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  for (const p of SEED_POSTS) {
    if (p.deleted) continue;
    const author = SEED_USERS.find((u) => u.handle === p.by)!;
    if (author.suspended) continue;
    const heat = p.heat ?? 0.2;
    for (const u of SEED_USERS) {
      if (u.handle === p.by || u.suspended || u.handle === "spam_bot_99" || u.handle === "newbie_nia") continue;
      if (blocked.has(`${u.handle}|${p.by}`)) continue;
      const follows = followsSet.has(`${U(u.handle)}>${U(p.by)}`);
      if (author.protected && !follows) continue;
      const mentioned = p.text.toLowerCase().includes(`@${u.handle.toLowerCase()}`);
      if (!follows && !mentioned) continue;
      const createdAt = at(Math.max(1, p.ago - 5 - Math.floor(hash(u.handle + p.k + "t") * Math.min(p.ago, 600))));
      if (hash(u.handle + p.k + "like") < heat) likes.push({ workspaceId: ws, userId: U(u.handle), postId: P(p.k), createdAt });
      if (!author.protected && hash(u.handle + p.k + "rp") < heat * 0.35) reposts.push({ workspaceId: ws, userId: U(u.handle), postId: P(p.k), createdAt });
      const poll = pollFor.get(p.k);
      if (poll && u.handle !== DEFAULT_ACTOR) {
        const voteAt = Math.min(createdAt.getTime(), poll.endsAt.getTime() - 60_000);
        if (voteAt < now.getTime() && hash(u.handle + p.k + "vote") < 0.85) {
          const idx = Math.floor(hash(u.handle + p.k + "opt") * poll.optionIds.length);
          votes.push({ workspaceId: ws, pollId: poll.pollId, userId: U(u.handle), optionId: poll.optionIds[idx], createdAt: new Date(voteAt) });
        }
      }
    }
  }
  await tx.like.createMany({ data: likes });
  await tx.repost.createMany({ data: reposts });
  await tx.pollVote.createMany({ data: votes });

  // ---- lists, topics, moments, bookmarks, pins, hidden replies ------------------
  const listId = new Map<string, string>();
  await tx.list.createMany({
    data: SEED_LISTS.map((l, i) => {
      const lid = id();
      listId.set(l.key, lid);
      return { id: lid, workspaceId: ws, ownerId: U(l.owner), name: l.name, description: l.description, isPrivate: !!l.isPrivate, bannerMediaId: listBanner.get(l.key) ?? null, createdAt: at(20 * 1440 - i * 300) };
    }),
  });
  await tx.listMember.createMany({ data: SEED_LISTS.flatMap((l) => l.members.map((m) => ({ workspaceId: ws, listId: listId.get(l.key)!, userId: U(m) }))) });
  await tx.listSubscription.createMany({ data: SEED_LISTS.flatMap((l) => (l.subscribers ?? []).map((m) => ({ workspaceId: ws, listId: listId.get(l.key)!, userId: U(m) }))) });
  await tx.listPin.createMany({ data: SEED_LISTS.flatMap((l) => (l.pinnedBy ?? []).map((m) => ({ workspaceId: ws, listId: listId.get(l.key)!, userId: U(m) }))) });

  const topicRows = SEED_TOPICS.map((t) => ({ id: id(), workspaceId: ws, slug: t.slug, name: t.name, category: t.category, description: t.description, keywords: t.keywords }));
  await tx.topic.createMany({ data: topicRows });
  await tx.topicFollow.createMany({ data: SEED_TOPICS.flatMap((t, i) => t.followers.map((f) => ({ workspaceId: ws, topicId: topicRows[i].id, userId: U(f) }))) });

  for (const m of SEED_MOMENTS) {
    const mid = id();
    await tx.moment.create({
      data: { id: mid, workspaceId: ws, ownerId: U(m.owner), title: m.title, description: m.description, coverMediaId: momentCover.get(m.key) ?? null, publishedAt: m.published ? at(2 * 1440) : null, createdAt: at(3 * 1440) },
    });
    await tx.momentItem.createMany({ data: m.posts.map((k, i) => ({ workspaceId: ws, momentId: mid, postId: P(k), position: i })) });
  }
  await tx.bookmark.createMany({ data: SEED_BOOKMARKS.map(([u, k], i) => ({ workspaceId: ws, userId: U(u), postId: P(k), createdAt: at(60 + i * 90) })) });
  for (const [u, k] of SEED_PINS) await tx.user.update({ where: { id: U(u) }, data: { pinnedPostId: P(k) } });
  await tx.hiddenReply.createMany({
    data: SEED_HIDDEN_REPLIES.map((k) => ({ workspaceId: ws, postId: P(k), hiddenById: U(SEED_POSTS.find((p) => p.k === rootOf(k))!.by) })),
  });

  // ---- drafts, scheduled posts (with durable publication jobs) -------------------
  await tx.draft.createMany({
    data: SEED_DRAFTS.map((d) => ({ workspaceId: ws, userId: U(d.by), payload: { items: [{ text: d.text, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null } })),
  });
  for (const s of SEED_SCHEDULED) {
    const sid = id();
    const scheduledFor = new Date(now.getTime() + s.inMinutes * 60_000);
    await tx.scheduledPost.create({
      data: { id: sid, workspaceId: ws, userId: U(s.by), timezone: s.timezone, scheduledFor, payload: { items: [{ text: s.text, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null } },
    });
    await tx.job.create({ data: { type: "publish_scheduled", uniqueKey: `publish:${sid}:${scheduledFor.getTime()}`, runAt: scheduledFor, payload: { scheduledPostId: sid, scheduledFor: scheduledFor.toISOString() } } });
  }
  await tx.savedSearch.createMany({ data: SEED_SAVED_SEARCHES.map(([u, q]) => ({ workspaceId: ws, userId: U(u), query: q })) });
  await tx.recentSearch.createMany({ data: SEED_RECENT_SEARCHES.map(([u, q], i) => ({ workspaceId: ws, userId: U(u), query: q, createdAt: at(30 + i) })) });

  // ---- notifications derived from the seeded events ------------------------------
  const notes: Prisma.NotificationCreateManyInput[] = [];
  const postAuthor = new Map(SEED_POSTS.map((p) => [P(p.k), U(p.by)]));
  const postCreated = new Map(SEED_POSTS.map((p) => [P(p.k), at(p.ago)]));
  const muted = new Set(MUTES.map(([a, b]) => `${U(a)}|${U(b)}`));
  const blockedIds = new Set(BLOCKS.flatMap(([a, b]) => [`${U(a)}|${U(b)}`, `${U(b)}|${U(a)}`]));
  const allowed = (recipient: string, actor: string) => recipient !== actor && !blockedIds.has(`${recipient}|${actor}`);
  for (const l of likes) {
    const r = postAuthor.get(l.postId)!;
    if (allowed(r, l.userId)) notes.push({ workspaceId: ws, recipientId: r, actorId: l.userId, type: "LIKE", postId: l.postId, dedupeKey: dedupeKeys.like(l.userId, l.postId), createdAt: l.createdAt, readAt: l.createdAt.getTime() < now.getTime() - 20 * 3600_000 ? now : null });
  }
  for (const rp of reposts) {
    const r = postAuthor.get(rp.postId)!;
    if (allowed(r, rp.userId)) notes.push({ workspaceId: ws, recipientId: r, actorId: rp.userId, type: "REPOST", postId: rp.postId, dedupeKey: dedupeKeys.repost(rp.userId, rp.postId), createdAt: rp.createdAt, readAt: rp.createdAt.getTime() < now.getTime() - 20 * 3600_000 ? now : null });
  }
  for (const p of SEED_POSTS) {
    if (p.deleted) continue;
    const pid = P(p.k);
    const actor = U(p.by);
    const created = postCreated.get(pid)!;
    const read = created.getTime() < now.getTime() - 20 * 3600_000 ? now : null;
    const notified = new Set<string>();
    if (p.reply) {
      const r = postAuthor.get(P(p.reply))!;
      if (allowed(r, actor) && !byKey.get(p.reply)!.deleted) {
        notes.push({ workspaceId: ws, recipientId: r, actorId: actor, type: "REPLY", postId: pid, dedupeKey: dedupeKeys.reply(pid, r), createdAt: created, readAt: read });
        notified.add(r);
      }
    }
    if (p.quote && !byKey.get(p.quote)!.deleted) {
      const r = postAuthor.get(P(p.quote))!;
      if (allowed(r, actor)) {
        notes.push({ workspaceId: ws, recipientId: r, actorId: actor, type: "QUOTE", postId: pid, dedupeKey: dedupeKeys.quote(pid), createdAt: created, readAt: read });
        notified.add(r);
      }
    }
    for (const m of mentions.filter((x) => x.postId === pid)) {
      if (notified.has(m.userId) || !allowed(m.userId, actor)) continue;
      notes.push({ workspaceId: ws, recipientId: m.userId, actorId: actor, type: "MENTION", postId: pid, dedupeKey: dedupeKeys.mention(pid, m.userId), createdAt: created, readAt: read });
    }
    if (!p.reply) {
      for (const f of follows.filter((f) => f.followeeId === actor && f.notify)) {
        notes.push({ workspaceId: ws, recipientId: f.followerId, actorId: actor, type: "SUBSCRIBED_POST", postId: pid, dedupeKey: dedupeKeys.subscribed(pid, f.followerId), createdAt: created, readAt: read });
      }
    }
  }
  for (const f of follows) {
    if (!allowed(f.followeeId, f.followerId)) continue;
    const recent = f.createdAt.getTime() > now.getTime() - 7 * 86400_000;
    if (!recent) continue;
    notes.push({ workspaceId: ws, recipientId: f.followeeId, actorId: f.followerId, type: "FOLLOW", postId: null, dedupeKey: dedupeKeys.follow(f.followerId, f.followeeId), createdAt: f.createdAt, readAt: f.createdAt.getTime() < now.getTime() - 2 * 86400_000 ? now : null });
  }
  for (const [a, b] of PENDING_REQUESTS) notes.push({ workspaceId: ws, recipientId: U(b), actorId: U(a), type: "FOLLOW_REQUEST", postId: null, dedupeKey: dedupeKeys.followRequest(U(a), U(b)), createdAt: at(300), readAt: null });
  // Muted accounts' events stay recorded; the read path filters them for the muter.
  void muted;
  await tx.notification.createMany({ data: notes, skipDuplicates: true });

  return { defaultActorId: U(DEFAULT_ACTOR) };
}
