import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/server/db";
import * as P from "@/server/services/posts";
import * as T from "@/server/services/timelines";
import * as U from "@/server/services/users";
import * as M from "@/server/services/messages";
import * as C from "@/server/services/collections";
import * as A from "@/server/services/account";
import * as Media from "@/server/services/media";
import { deleteWorkspace } from "@/server/services/workspace";
import { ctxFor, expectCode, key, newWorkspace, postId } from "./helpers";
import type { PostDTO } from "@/lib/types";

let ws: string;
beforeAll(async () => {
  ws = await newWorkspace();
});
afterAll(async () => {
  await deleteWorkspace(ws);
  await prisma.$disconnect();
});

const body = (text: string, extra: Record<string, unknown> = {}) => ({
  items: [{ text, mediaIds: [], poll: null }],
  replyAudience: "EVERYONE" as const,
  replyToId: null,
  quotedPostId: null,
  clientKey: key(),
  ...extra,
});

describe("engagement lists and owner activity", () => {
  it("lists likers, reposters and quotes from real rows", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const id = await postId(ws, "Friday demo: orbits");
    const likes = await P.likedBy(maya, id);
    expect(likes.items.length).toBe(await prisma.like.count({ where: { postId: id } }));
    const reposts = await P.repostedBy(maya, id);
    expect(reposts.items.length).toBe(await prisma.repost.count({ where: { postId: id } }));
    const quotes = await P.quotesOf(maya, id);
    expect(quotes.posts.every((p) => p.quoted && "id" in p.quoted && p.quoted.id === id)).toBe(true);
    expect(quotes.posts.length).toBeGreaterThan(0);
  });

  it("hides engagement lists of protected posts from non-followers", async () => {
    const omar = await ctxFor(ws, "omar_runs");
    const id = await postId(ws, "Sketchbook page 14");
    await expectCode(P.likedBy(omar, id), "PROTECTED");
  });

  it("post activity is owner-only and matches recorded events", async () => {
    const prof = await ctxFor(ws, "prof_lindqvist");
    const maya = await ctxFor(ws, "maya_learns");
    const id = await postId(ws, "Friday demo: orbits");
    await expectCode(P.postActivity(maya, id), "FORBIDDEN");
    await P.postDetail(maya, id, {});
    await P.postDetail(maya, id, {}); // same viewer, same day → one detail open
    const a = await P.postActivity(prof, id);
    expect(a.likes).toBe(await prisma.like.count({ where: { postId: id } }));
    expect(a.detailOpens).toBe(1);
    expect(a.last7Days).toHaveLength(7);
  });
});

describe("reports", () => {
  it("persists a report with a received status, and validates the target", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const id = await postId(ws, "HOT TAKE: PINEAPPLE");
    const r = await A.createReport(maya, { targetType: "POST", targetId: id, category: "spam", details: "test" });
    expect(r.status).toBe("received");
    expect(await prisma.report.count({ where: { id: r.id, reporterId: maya.actor.id } })).toBe(1);
    await expectCode(A.createReport(maya, { targetType: "POST", targetId: "doesnotexist00", category: "spam", details: "" }), "NOT_FOUND");
    // Messages can only be reported by participants.
    const foreignMsg = await prisma.message.findFirstOrThrow({ where: { workspaceId: ws, conversation: { participants: { none: { userId: maya.actor.id } } } } }).catch(() => null);
    if (foreignMsg) await expectCode(A.createReport(maya, { targetType: "MESSAGE", targetId: foreignMsg.id, category: "spam", details: "" }), "NOT_FOUND");
  });
});

describe("delete, mute conversation and subscriptions", () => {
  it("deleting a post leaves tombstones for replies and quotes and clears the pin", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const amir = await ctxFor(ws, "amir_codes");
    const [root] = await P.createPost(maya, body("Root to delete"));
    const [reply] = await P.createPost(amir, body("@maya_learns reply", { replyToId: root.id }));
    const [quote] = await P.createPost(amir, body("quoting", { quotedPostId: root.id }));
    await P.setPinned(maya, root.id, true);
    await P.deletePost(maya, root.id);
    const detail = await P.postDetail(amir, reply.id, {});
    expect(detail.ancestors[0]).toMatchObject({ unavailable: "deleted" });
    const q = (await P.getPost(amir, quote.id)) as PostDTO;
    expect(q.quoted).toMatchObject({ unavailable: "deleted" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: maya.actor.id } })).pinnedPostId).toBeNull();
  });

  it("muting a conversation stops reply notifications to the muter", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const zara = await ctxFor(ws, "zara_designs");
    const [root] = await P.createPost(maya, body("Mute me test"));
    await P.setConversationMute(maya, root.id, true);
    const [r] = await P.createPost(zara, body("a reply", { replyToId: root.id }));
    expect(await prisma.notification.count({ where: { recipientId: maya.actor.id, postId: r.id } })).toBe(0);
    await P.setConversationMute(maya, root.id, false);
    const [r2] = await P.createPost(zara, body("another reply", { replyToId: root.id }));
    expect(await prisma.notification.count({ where: { recipientId: maya.actor.id, postId: r2.id, type: "REPLY" } })).toBe(1);
  });

  it("the profile bell creates post notifications only for subscribers", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const rob = await ctxFor(ws, "robotics_club");
    const [p] = await P.createPost(rob, body("Bell test post"));
    expect(await prisma.notification.count({ where: { recipientId: maya.actor.id, postId: p.id, type: "SUBSCRIBED_POST" } })).toBe(1);
    await U.setProfileNotify(maya, "robotics_club", false);
    const [p2] = await P.createPost(rob, body("Bell test post 2"));
    expect(await prisma.notification.count({ where: { recipientId: maya.actor.id, postId: p2.id } })).toBe(0);
    await expectCode(U.setProfileNotify(maya, "omar_runs", true), "VALIDATION"); // not following
  });
});

describe("topics, suggestions and new-post counts", () => {
  it("following a topic adds labelled topic posts from non-followed accounts to Home", async () => {
    const nia = await ctxFor(ws, "newbie_nia");
    const before = await T.homeTimeline(nia);
    expect(before.entries.some((e) => e.context?.type === "topic")).toBe(false);
    await C.setTopicFollow(nia, "chess", true);
    const after = await T.homeTimeline(nia);
    const topicEntries = after.entries.filter((e) => e.context?.type === "topic");
    expect(topicEntries.length).toBeGreaterThan(0);
    await C.setTopicFollow(nia, "chess", false);
    const again = await T.homeTimeline(nia);
    expect(again.entries.some((e) => e.context?.type === "topic")).toBe(false);
  });

  it("suggestions exclude self, followed, blocked and muted accounts", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const list = await U.suggestions(maya, 30);
    const handles = list.map((i) => i.user.handle);
    expect(handles).not.toContain("maya_learns");
    expect(handles).not.toContain("prof_lindqvist"); // followed
    expect(handles).not.toContain("spam_bot_99"); // blocked
    expect(handles).not.toContain("loud_larry"); // muted
    expect(handles).not.toContain("suspended_acct");
  });

  it("counts newer posts for the 'Show new posts' pill", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const since = new Date().toISOString();
    const sam = await ctxFor(ws, "stargazer_sam");
    await P.createPost(sam, body("Fresh post for the pill"));
    const n = await T.newPostsSince(maya, since);
    expect(n.count).toBeGreaterThanOrEqual(1);
    expect(n.authors.some((a) => a.handle === "stargazer_sam")).toBe(true);
  });
});

describe("account rules", () => {
  it("unprotecting approves pending follow requests; handles are validated", async () => {
    const jordan = await ctxFor(ws, "jordan_private");
    expect(await prisma.followRequest.count({ where: { targetId: jordan.actor.id } })).toBe(2);
    await U.updateAccount(jordan, { isProtected: false });
    expect(await prisma.followRequest.count({ where: { targetId: jordan.actor.id } })).toBe(0);
    const ben = await prisma.user.findFirstOrThrow({ where: { workspaceId: ws, handle: "ben_music" } });
    expect(await prisma.follow.count({ where: { followerId: ben.id, followeeId: jordan.actor.id } })).toBe(1);
    await expectCode(U.updateAccount(jordan, { handle: "settings" }), "VALIDATION");
    await expectCode(U.updateAccount(jordan, { handle: "maya_learns" }), "CONFLICT");
    await U.updateAccount(jordan, { isProtected: true });
  });
});

describe("conversation management", () => {
  it("rename, add, admin-only remove, admin hand-off on leave", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const amir = await ctxFor(ws, "amir_codes");
    const g = await M.startConversation(maya, ["amir_codes", "zara_designs"], "Test group");
    const renamed = await M.updateConversation(amir, g.id, { name: "Renamed" });
    expect(renamed.name).toBe("Renamed");
    await M.addMembers(amir, g.id, ["theo_math"]);
    expect((await M.conversationDTO(maya, g.id)).participants.some((p) => p.handle === "theo_math" && p.active)).toBe(true);
    await expectCode(M.removeMember(amir, g.id, "theo_math"), "FORBIDDEN");
    await M.removeMember(maya, g.id, "theo_math");
    await M.leaveConversation(maya, g.id);
    await expectCode(M.listMessages(maya, g.id, {}), "NOT_FOUND");
    const parts = await prisma.participant.findMany({ where: { conversationId: g.id, leftAt: null } });
    expect(parts.some((p) => p.role === "ADMIN")).toBe(true);
    const sys = await prisma.message.findMany({ where: { conversationId: g.id, kind: "SYSTEM" }, orderBy: { createdAt: "asc" } });
    expect(sys.map((m) => m.text)).toEqual(expect.arrayContaining(["created the group", "renamed the group to “Renamed”", "added @theo_math", "removed @theo_math", "left the group"]));
  });

  it("deleting a direct conversation hides it until a newer message arrives", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const prof = await ctxFor(ws, "prof_lindqvist");
    const c = await M.startConversation(maya, ["prof_lindqvist"]);
    await M.leaveConversation(maya, c.id);
    expect((await M.listConversations(maya, "inbox")).some((x) => x.id === c.id)).toBe(false);
    await M.sendMessage(prof, c.id, { text: "are you there?", mediaIds: [], sharedPostId: null, clientKey: key() });
    expect((await M.listConversations(maya, "inbox")).some((x) => x.id === c.id)).toBe(true);
    const msgs = await M.listMessages(maya, c.id, {});
    expect(msgs.items.map((m) => m.text)).toEqual(["are you there?"]); // older history stays hidden for maya
  });

  it("reactions are per actor; delete-for-me only affects the viewer", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const prof = await ctxFor(ws, "prof_lindqvist");
    const c = await M.startConversation(maya, ["prof_lindqvist"]);
    const m = await M.sendMessage(prof, c.id, { text: "react to me", mediaIds: [], sharedPostId: null, clientKey: key() });
    const r1 = await M.setReaction(maya, m.id, "🔥");
    expect(r1.reactions).toEqual([expect.objectContaining({ emoji: "🔥", handle: "maya_learns" })]);
    const r2 = await M.setReaction(maya, m.id, "👍");
    expect(r2.reactions).toHaveLength(1);
    expect(r2.reactions[0].emoji).toBe("👍");
    await expectCode(M.setReaction(maya, m.id, "💩"), "VALIDATION");
    const r3 = await M.setReaction(maya, m.id, null);
    expect(r3.reactions).toHaveLength(0);
    await M.hideMessageForMe(maya, m.id);
    expect((await M.listMessages(maya, c.id, {})).items.some((x) => x.id === m.id)).toBe(false);
    expect((await M.listMessages(prof, c.id, {})).items.some((x) => x.id === m.id)).toBe(true);
  });

  it("sharing a post the viewer can't see is refused", async () => {
    const omar = await ctxFor(ws, "omar_runs");
    const c = await M.startConversation(omar, ["coach_reyes"]);
    // Riley is protected and Omar doesn't follow her (Jordan was unprotected by an earlier test).
    const prot = await postId(ws, "Tide pools at low tide");
    await expectCode(M.sendMessage(omar, c.id, { text: "", mediaIds: [], sharedPostId: prot, clientKey: key() }), "VALIDATION");
  });
});

describe("media uploads", () => {
  const file = (buf: Buffer, name: string, type: string) => new File([new Uint8Array(buf)], name, { type });

  it("re-encodes images, honours scope rules, and rejects unknown types by content", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const png = readFileSync("public/brand/icon-512.png");
    const m = await Media.upload(maya, file(png, "x.png", "image/png"), { scope: "POST" });
    expect(m.kind).toBe("IMAGE");
    expect(m.mime).toBe("image/jpeg");
    expect(m.width).toBe(512);
    const fake = Buffer.from("<html><script>alert(1)</script></html>");
    await expectCode(Media.upload(maya, file(fake, "evil.png", "image/png"), { scope: "POST" }), "UNSUPPORTED_MEDIA");
    const gif = readFileSync("assets/seed/gifs/bounce.gif");
    await expectCode(Media.upload(maya, file(gif, "a.gif", "image/gif"), { scope: "PROFILE" }), "VALIDATION");
    const g = await Media.upload(maya, file(gif, "a.gif", "image/gif"), { scope: "POST" });
    expect(g.kind).toBe("GIF");
    expect(g.thumbUrl).toBeTruthy();
    // Unattached uploads are private to their owner.
    const amir = await ctxFor(ws, "amir_codes");
    await expectCode(Media.serveMedia(amir, m.id, null, null), "NOT_FOUND");
    expect((await Media.serveMedia(maya, m.id, null, null)).status).toBe(200);
    // Alt text: owner only.
    await expectCode(Media.setAlt(amir, m.id, "nope"), "FORBIDDEN");
    expect((await Media.setAlt(maya, m.id, "An icon")).alt).toBe("An icon");
  });

  it("stores a browser-captured poster for videos; a bad poster never blocks the upload", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const webm = readFileSync("assets/seed/video/orbit.webm");
    const poster = readFileSync("assets/seed/video/orbit-poster.jpg");
    const withPoster = await Media.upload(maya, file(webm, "v.webm", "video/webm"), { scope: "POST", poster: file(poster, "poster.jpg", "image/jpeg") });
    expect(withPoster.kind).toBe("VIDEO");
    expect(withPoster.thumbUrl).toMatch(/v=thumb$/);
    expect(withPoster.width).toBe(640);
    const thumb = await Media.serveMedia(maya, withPoster.id, "thumb", null);
    expect(thumb.headers.get("content-type")).toBe("image/jpeg");
    const noPoster = await Media.upload(maya, file(webm, "v.webm", "video/webm"), { scope: "POST" });
    expect(noPoster.thumbUrl).toBeNull();
    const badPoster = await Media.upload(maya, file(webm, "v.webm", "video/webm"), { scope: "POST", poster: file(Buffer.from("not an image"), "p.jpg", "image/jpeg") });
    expect(badPoster.kind).toBe("VIDEO");
    expect(badPoster.thumbUrl).toBeNull();
  });

  it("serves byte ranges for video seeking", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const video = await prisma.mediaAsset.findFirstOrThrow({ where: { workspaceId: ws, kind: "VIDEO" } });
    const res = await Media.serveMedia(maya, video.id, null, "bytes=0-99");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it("bundled GIFs become ordinary owned attachments", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const g = await Media.pickBundledGif(maya, "clap.gif", "POST");
    const [p] = await P.createPost(maya, { ...body("gif post"), items: [{ text: "gif post", mediaIds: [g.id], poll: null }] });
    expect(p.media[0].kind).toBe("GIF");
    await expectCode(Media.pickBundledGif(maya, "../../.env", "POST"), "NOT_FOUND");
  });
});
