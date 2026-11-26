import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import * as P from "@/server/services/posts";
import * as T from "@/server/services/timelines";
import * as U from "@/server/services/users";
import * as M from "@/server/services/messages";
import * as C from "@/server/services/collections";
import * as K from "@/server/services/compose";
import * as N from "@/server/services/notifications";
import * as Q from "@/server/services/search";
import * as A from "@/server/services/account";
import { deleteWorkspace } from "@/server/services/workspace";
import { serveMedia } from "@/server/services/media";
import { ctxFor, expectCode, key, newWorkspace, postId } from "./helpers";
import type { PostDTO } from "@/lib/types";

let ws: string;
let other: string;

beforeAll(async () => {
  ws = await newWorkspace();
  other = await newWorkspace();
});
afterAll(async () => {
  await deleteWorkspace(ws);
  await deleteWorkspace(other);
  await prisma.$disconnect();
});

const payload = (text: string, extra: Partial<Parameters<typeof P.createPost>[1]> = {}) => ({
  items: [{ text, mediaIds: [], poll: null }],
  replyAudience: "EVERYONE" as const,
  replyToId: null,
  quotedPostId: null,
  clientKey: key(),
  ...extra,
});

describe("posting", () => {
  it("publishes, appears in Latest, profile and permalink; retries are idempotent", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const body = payload("Integration test post 🚀 #testing");
    const [p1] = await P.createPost(maya, body);
    const [again] = await P.createPost(maya, body); // same client key
    expect(again.id).toBe(p1.id);
    expect(await prisma.post.count({ where: { workspaceId: ws, text: "Integration test post 🚀 #testing" } })).toBe(1);
    const latest = await T.latestTimeline(maya);
    expect(latest.entries.some((e) => e.postId === p1.id)).toBe(true);
    const profile = await T.profileTimeline(maya, "maya_learns", "posts");
    expect(profile.entries.some((e) => e.postId === p1.id)).toBe(true);
    const got = await P.getPost(maya, p1.id);
    expect("author" in got && got.text).toContain("Integration test post");
  });

  it("rejects over-limit text and invalid media combinations on the server", async () => {
    const { createPostSchema } = await import("@/lib/schemas");
    expect(createPostSchema.safeParse(payload("a".repeat(281))).success).toBe(false);
    const maya = await ctxFor(ws, "maya_learns");
    const sam = await ctxFor(ws, "stargazer_sam");
    const someoneElsesMedia = await prisma.mediaAsset.findFirstOrThrow({ where: { workspaceId: ws, ownerId: sam.actor.id, scope: "POST" } });
    await expectCode(P.createPost(maya, { ...payload("stealing media"), items: [{ text: "x", mediaIds: [someoneElsesMedia.id], poll: null }] }), "VALIDATION");
  });

  it("keeps counts and viewer state consistent for like / repost / bookmark", async () => {
    const amir = await ctxFor(ws, "amir_codes");
    const id = await postId(ws, "Studying for the physics midterm");
    const before = (await P.getPost(amir, id)) as PostDTO;
    const liked = await P.setLike(amir, id, !before.viewer.liked);
    expect(liked.counts.likes).toBe(before.counts.likes + (before.viewer.liked ? -1 : 1));
    // Repeating the same like is a no-op and creates no duplicate notification.
    await P.setLike(amir, id, true);
    await P.setLike(amir, id, true);
    const notes = await prisma.notification.count({ where: { workspaceId: ws, type: "LIKE", postId: id, actorId: amir.actor.id } });
    expect(notes).toBe(1);
    const unliked = await P.setLike(amir, id, false);
    expect(unliked.viewer.liked).toBe(false);
    expect(await prisma.notification.count({ where: { workspaceId: ws, type: "LIKE", postId: id, actorId: amir.actor.id } })).toBe(0);
    const bm = await P.setBookmark(amir, id, true);
    expect(bm.viewer.bookmarked).toBe(true);
    const marks = await T.bookmarksTimeline(amir);
    expect(marks.entries.some((e) => e.postId === id)).toBe(true);
  });

  it("enforces reply audience on the server", async () => {
    const id = await postId(ws, "@maya_learns @priya_reads can you two judge");
    const omar = await ctxFor(ws, "omar_runs");
    await expectCode(P.createPost(omar, payload("can I reply?", { replyToId: id })), "FORBIDDEN");
    const maya = await ctxFor(ws, "maya_learns");
    const [r] = await P.createPost(maya, payload("@noor_debates count me in", { replyToId: id }));
    expect(r.replyToId).toBe(id);
  });

  it("prevents deleting or pinning another person's post (forged edit)", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const id = await postId(ws, "Friday demo: orbits");
    await expectCode(P.deletePost(maya, id), "FORBIDDEN");
    await expectCode(P.setPinned(maya, id, true), "FORBIDDEN");
  });

  it("lets only the conversation author hide replies, and keeps them viewable", async () => {
    const root = await postId(ws, "Looking for study group members");
    const visibleReply = await postId(ws, "@maya_learns I'm in. Bringing flashcards.");
    const amir = await ctxFor(ws, "amir_codes");
    await expectCode(P.setHiddenReply(amir, visibleReply, true), "FORBIDDEN");
    const maya = await ctxFor(ws, "maya_learns");
    await P.setHiddenReply(maya, visibleReply, true);
    const detail = await P.postDetail(amir, root, {});
    expect(detail.replies.some((r) => r.id === visibleReply)).toBe(false);
    const hidden = await P.postDetail(amir, root, { hidden: true });
    expect(hidden.replies.some((r) => r.id === visibleReply)).toBe(true);
  });
});

describe("polls", () => {
  it("allows one vote per actor and rejects votes after closing", async () => {
    const id = await postId(ws, "How do you structure study sessions?");
    // Pick a seeded account that hasn't voted yet (seed votes are deterministic engagement).
    let zara = await ctxFor(ws, "zara_designs");
    let poll = (await P.getPost(zara, id)) as PostDTO;
    for (const h of ["omar_runs", "ben_music", "sofia_chess", "history_hub", "campus_news", "eli_photos"]) {
      if (!poll.poll!.viewerVoteOptionId) break;
      zara = await ctxFor(ws, h);
      poll = (await P.getPost(zara, id)) as PostDTO;
    }
    expect(poll.poll!.viewerVoteOptionId).toBeNull();
    // A seeded voter is rejected too.
    const voter = await prisma.pollVote.findFirstOrThrow({ where: { poll: { postId: id } }, include: { user: true } });
    await expectCode(P.vote(await ctxFor(ws, voter.user.handle), id, poll.poll!.options[0].id), "CONFLICT");
    const opt = poll.poll!.options[0].id;
    const after = await P.vote(zara, id, opt);
    expect(after.poll!.viewerVoteOptionId).toBe(opt);
    expect(after.poll!.totalVotes).toBe(poll.poll!.totalVotes + 1);
    await expectCode(P.vote(zara, id, poll.poll!.options[1].id), "CONFLICT");
    const maya = await ctxFor(ws, "maya_learns");
    await expectCode(P.vote(maya, id, opt), "FORBIDDEN"); // author
    const closed = await postId(ws, "Genre for the winter reading list?");
    const cpost = (await P.getPost(zara, closed)) as PostDTO;
    expect(cpost.poll!.closed).toBe(true);
    await expectCode(P.vote(zara, closed, cpost.poll!.options[0].id), "CONFLICT");
  });
});

describe("following and protected accounts", () => {
  it("follow/unfollow changes counts and Latest", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const before = await U.getProfile(maya, "ben_music");
    const after = await U.follow(maya, "ben_music");
    expect(after.followersCount).toBe(before.followersCount + 1);
    const latest = await T.latestTimeline(maya);
    const ben = await prisma.user.findFirstOrThrow({ where: { workspaceId: ws, handle: "ben_music" } });
    const benPosts = await prisma.post.findMany({ where: { workspaceId: ws, authorId: ben.id }, select: { id: true } });
    expect(latest.posts.some((p) => benPosts.some((b) => b.id === p.id)) || latest.nextCursor).toBeTruthy();
    const un = await U.unfollow(maya, "ben_music");
    expect(un.followersCount).toBe(before.followersCount);
  });

  it("protects content in direct URLs, timelines, search and media until a request is approved", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const riley = await ctxFor(ws, "riley_locked");
    const rileyPost = await postId(ws, "Tide pools at low tide");
    const dto = await P.getPost(maya, rileyPost);
    expect("unavailable" in dto && dto.unavailable).toBe("protected");
    await expectCode(T.profileTimeline(maya, "riley_locked", "posts"), "PROTECTED");
    await expectCode(T.profileTimeline(maya, "riley_locked", "likes"), "PROTECTED");
    await expectCode(U.connections(maya, "riley_locked", "followers", {}), "PROTECTED");
    const search = await Q.searchPosts(maya, "tide pools", "live");
    expect(search.posts.some((p) => p.id === rileyPost)).toBe(false);
    const profile = await U.follow(maya, "riley_locked");
    expect(profile.relationship.requested).toBe(true);
    expect(profile.relationship.following).toBe(false);
    const reqs = await U.listFollowRequests(riley);
    expect(reqs.incoming.some((r) => r.user.handle === "maya_learns")).toBe(true);
    await U.respondToFollowRequest(riley, "maya_learns", true);
    const visible = await P.getPost(maya, rileyPost);
    expect("author" in visible).toBe(true);
    // Protected posts can't be reposted even by approved followers.
    await expectCode(P.setRepost(maya, rileyPost, true), "FORBIDDEN");
  });

  it("protected media is not served to non-followers", async () => {
    const jordanPost = await postId(ws, "Study notes for the art history exam");
    const media = await prisma.postMedia.findFirstOrThrow({ where: { postId: jordanPost } });
    const omar = await ctxFor(ws, "omar_runs");
    await expectCode(serveMedia(omar, media.mediaId, null, null), "NOT_FOUND");
    const maya = await ctxFor(ws, "maya_learns"); // approved follower
    const res = await serveMedia(maya, media.mediaId, null, null);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

describe("blocking and muting", () => {
  it("block removes follows, hides content and prevents interaction", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const larry = await ctxFor(ws, "loud_larry");
    await U.setBlock(maya, "loud_larry", true);
    await expectCode(U.follow(larry, "maya_learns"), "BLOCKED");
    const mayaPost = await postId(ws, "Note to self: commit messages");
    await expectCode(P.setLike(larry, mayaPost, true), "BLOCKED");
    await expectCode(P.createPost(larry, payload("hey", { replyToId: mayaPost })), "FORBIDDEN");
    const s = await Q.searchPosts(maya, "pineapple", "live");
    expect(s.posts.length).toBe(0);
    await expectCode(M.startConversation(larry, ["maya_learns"]), "FORBIDDEN");
    await U.setBlock(maya, "loud_larry", false);
  });

  it("muted words filter Home/Latest and notifications for the muter only", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const spoiler = await postId(ws, "Book club spoiler:");
    const latest = await T.latestTimeline(maya);
    expect(latest.entries.some((e) => e.postId === spoiler)).toBe(false);
    const priya = await ctxFor(ws, "priya_reads");
    const direct = await P.getPost(maya, spoiler);
    expect("author" in direct).toBe(true); // direct URL still works
    const latestPriya = await T.latestTimeline(priya);
    expect(latestPriya.entries.some((e) => e.postId === spoiler)).toBe(true);
  });

  it("notification preferences stop new notifications of that type", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    await A.updatePreferences(maya, { notifyLikes: false });
    const sofia = await ctxFor(ws, "sofia_chess");
    const id = await postId(ws, "Joined iSchoolie to keep up");
    await P.setLike(sofia, id, true);
    expect(await prisma.notification.count({ where: { workspaceId: ws, actorId: sofia.actor.id, postId: id, type: "LIKE" } })).toBe(0);
    await A.updatePreferences(maya, { notifyLikes: true });
    const list = await N.listNotifications(maya, { tab: "all" });
    expect(list.items.length).toBeGreaterThan(0);
  });
});

describe("lists and moments", () => {
  it("private lists are invisible to others; list timeline uses members", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const sam = await ctxFor(ws, "stargazer_sam");
    const list = await C.createList(maya, { name: "Test private", description: "", isPrivate: true, bannerMediaId: null });
    await C.setListMember(maya, list.id, "coach_reyes", true);
    await expectCode(C.getList(sam, list.id), "NOT_FOUND");
    await expectCode(T.listTimeline(sam, list.id), "NOT_FOUND");
    await expectCode(C.setListMember(sam, list.id, "maya_learns", true), "NOT_FOUND");
    const tl = await T.listTimeline(maya, list.id);
    expect(tl.posts.every((p) => p.author.handle === "coach_reyes")).toBe(true);
    expect(tl.posts.length).toBeGreaterThan(0);
  });

  it("moments keep order, reject protected posts, and recheck visibility on read", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const a = await postId(ws, "Clear skies forecast for Saturday");
    const b = await postId(ws, "Friday demo: orbits");
    const prot = await postId(ws, "Sketchbook page 14");
    await expectCode(C.createMoment(maya, { title: "t", description: "", coverMediaId: null, postIds: [prot] }), "VALIDATION");
    const m = await C.createMoment(maya, { title: "Order test", description: "", coverMediaId: null, postIds: [b, a] });
    expect(m.posts.map((p) => p.id)).toEqual([b, a]);
    const pub = await C.publishMoment(maya, m.moment.id, true);
    expect(pub.moment.publishedAt).toBeTruthy();
    // The seeded "Sketchbook inspiration" Moment includes a protected post: non-followers see it as unavailable.
    const omar = await ctxFor(ws, "omar_runs");
    const seeded = await prisma.moment.findFirstOrThrow({ where: { workspaceId: ws, title: "Sketchbook inspiration" } });
    const view = await C.getMoment(omar, seeded.id);
    expect(view.items.some((i) => "unavailable" in i && i.unavailable?.unavailable === "protected")).toBe(true);
    expect(view.posts.some((p) => p.author.handle === "jordan_private")).toBe(false);
  });
});

describe("messages", () => {
  it("sends idempotently, tracks unread and read state", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const prof = await ctxFor(ws, "prof_lindqvist");
    const conv = await M.startConversation(maya, ["prof_lindqvist"]);
    const k = key();
    const m1 = await M.sendMessage(maya, conv.id, { text: "idempotent hello", mediaIds: [], sharedPostId: null, clientKey: k });
    const m2 = await M.sendMessage(maya, conv.id, { text: "idempotent hello", mediaIds: [], sharedPostId: null, clientKey: k });
    expect(m2.id).toBe(m1.id);
    expect(await prisma.message.count({ where: { conversationId: conv.id, text: "idempotent hello" } })).toBe(1);
    const before = await M.conversationDTO(prof, conv.id);
    expect(before.unreadCount).toBeGreaterThan(0);
    await M.markRead(prof, conv.id);
    expect((await M.conversationDTO(prof, conv.id)).unreadCount).toBe(0);
  });

  it("blocks non-members from reading or sending, and routes strangers to requests", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const omar = await ctxFor(ws, "omar_runs");
    const conv = await M.startConversation(maya, ["prof_lindqvist"]);
    await expectCode(M.listMessages(omar, conv.id, {}), "NOT_FOUND");
    await expectCode(M.sendMessage(omar, conv.id, { text: "intrude", mediaIds: [], sharedPostId: null, clientKey: key() }), "NOT_FOUND");
    const requests = await M.listConversations(maya, "requests");
    expect(requests.length).toBeGreaterThan(0);
    await M.respondToRequest(maya, requests[0].id, "accept");
    expect((await M.listConversations(maya, "inbox")).some((c) => c.id === requests[0].id)).toBe(true);
  });

  it("refuses messages to people who only accept messages from people they follow", async () => {
    const coach = await ctxFor(ws, "coach_reyes");
    await U.updateAccount(coach, { dmPolicy: "FOLLOWING" });
    const priya = await ctxFor(ws, "priya_reads");
    await expectCode(M.startConversation(priya, ["coach_reyes"]), "FORBIDDEN");
  });
});

describe("scheduling", () => {
  it("publishes once from the worker path, even when retried", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    await expectCode(K.schedulePost(maya, { payload: payload("too soon"), scheduledFor: new Date(Date.now() + 1000).toISOString(), timezone: "UTC" }), "VALIDATION");
    const s = await K.schedulePost(maya, { payload: { items: [{ text: "Scheduled integration post", mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null }, scheduledFor: future, timezone: "America/New_York" });
    const job = await prisma.job.findFirstOrThrow({ where: { uniqueKey: `publish:${s.id}:${new Date(future).getTime()}` } });
    expect(job.status).toBe("QUEUED");
    const first = await K.publishScheduled(s.id, future);
    const second = await K.publishScheduled(s.id, future);
    expect(first).toBe("published");
    expect(second).toBe("skipped");
    expect(await prisma.post.count({ where: { workspaceId: ws, text: "Scheduled integration post" } })).toBe(1);
    const row = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("PUBLISHED");
  });

  it("skips superseded jobs after a reschedule and honours cancellation", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const t1 = new Date(Date.now() + 10 * 60_000).toISOString();
    const t2 = new Date(Date.now() + 20 * 60_000).toISOString();
    const pl = { items: [{ text: "Rescheduled post", mediaIds: [], poll: null }], replyAudience: "EVERYONE" as const, replyToId: null, quotedPostId: null };
    const s = await K.schedulePost(maya, { payload: pl, scheduledFor: t1, timezone: "UTC" });
    await K.updateScheduled(maya, s.id, { payload: pl, scheduledFor: t2, timezone: "UTC" });
    expect(await K.publishScheduled(s.id, t1)).toBe("skipped");
    await K.cancelScheduled(maya, s.id);
    expect(await K.publishScheduled(s.id, t2)).toBe("skipped");
    expect(await prisma.post.count({ where: { workspaceId: ws, text: "Rescheduled post" } })).toBe(0);
  });
});

describe("workspace isolation", () => {
  it("cannot read or act on another workspace's records with valid ids", async () => {
    const mayaA = await ctxFor(ws, "maya_learns");
    const foreignPost = await postId(other, "Friday demo: orbits");
    const dto = await P.getPost(mayaA, foreignPost);
    expect("unavailable" in dto && dto.unavailable).toBe("not_found");
    await expectCode(P.setLike(mayaA, foreignPost, true), "NOT_FOUND");
    await expectCode(P.createPost(mayaA, payload("cross reply", { replyToId: foreignPost })), "NOT_FOUND");
    const foreignConv = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: other } });
    await expectCode(M.listMessages(mayaA, foreignConv.id, {}), "NOT_FOUND");
    const foreignMedia = await prisma.mediaAsset.findFirstOrThrow({ where: { workspaceId: other, scope: "MESSAGE" } });
    await expectCode(serveMedia(mayaA, foreignMedia.id, null, null), "NOT_FOUND");
    const foreignList = await prisma.list.findFirstOrThrow({ where: { workspaceId: other } });
    await expectCode(C.getList(mayaA, foreignList.id), "NOT_FOUND");
  });

  it("database constraints reject cross-workspace references", async () => {
    const mayaA = await ctxFor(ws, "maya_learns");
    const foreignPost = await postId(other, "Friday demo: orbits");
    await expect(prisma.like.create({ data: { workspaceId: ws, userId: mayaA.actor.id, postId: foreignPost } })).rejects.toThrow();
  });
});
