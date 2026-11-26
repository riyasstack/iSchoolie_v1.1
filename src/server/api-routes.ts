/** The JSON API route table. Every handler derives actor/workspace from ctx, never from input. */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { RouteDef } from "./http";
import { AppError } from "./errors";
import { prisma } from "./db";
import { env } from "./env";
import { SESSION_COOKIE } from "@/lib/session-token";
import { sseResponse } from "./realtime";
import * as S from "./services/workspace";
import * as P from "./services/posts";
import * as T from "./services/timelines";
import * as U from "./services/users";
import * as N from "./services/notifications";
import * as M from "./services/messages";
import * as C from "./services/collections";
import * as K from "./services/compose";
import * as Media from "./services/media";
import * as Q from "./services/search";
import * as A from "./services/account";
import { createMemberProfile, handleAvailable } from "./auth";
import { isMember } from "./viewer";
import {
  createPostSchema, draftSchema, scheduleSchema, profileSchema, listSchema, momentSchema, messageSchema, altSchema,
  mutedWordSchema, reportSchema, preferencesSchema, accountSchema, idSchema, composeSchema,
} from "@/lib/schemas";

const cursorQ = z.object({ cursor: z.string().max(500).optional() });
const handleList = z.object({ handles: z.array(z.string().min(1).max(30)).min(1).max(50), name: z.string().max(50).nullable().optional() });

function clientKey(req: Request) {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api/")) return "/home";
  return next.slice(0, 1000);
}

async function setSessionCookie(res: NextResponse, req: Request, value: string, expiresAt: Date) {
  const secure = env.forceSecureCookies || new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  res.cookies.set(SESSION_COOKIE, value, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt });
}

const on = (method: string) => method === "PUT";

export const routes: RouteDef[] = [
  // ------------------------------------------------------------------ health
  {
    method: "GET",
    pattern: "/health",
    auth: false,
    handler: async () => {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, mode: env.mode, time: new Date().toISOString() };
    },
  },
  // ------------------------------------------------------------------ session
  {
    method: "GET",
    pattern: "/session/start",
    auth: false,
    csrf: false,
    handler: async ({ req, url }) => {
      const next = safeNext(url.searchParams.get("next"));
      // Only top-level navigations may provision via GET.
      const dest = req.headers.get("sec-fetch-dest");
      if (dest && dest !== "document") throw new AppError("FORBIDDEN", "Invalid request.");
      try {
        const { cookieValue, expiresAt } = await S.provisionDemoSession(clientKey(req));
        const res = NextResponse.redirect(new URL(next, url.origin), 303);
        await setSessionCookie(res, req, cookieValue, expiresAt);
        return res;
      } catch (e) {
        if (e instanceof AppError && e.code === "RATE_LIMITED") {
          return NextResponse.redirect(new URL(`/offline?reason=rate_limited`, url.origin), 303);
        }
        throw e;
      }
    },
  },
  {
    method: "POST",
    pattern: "/session/start",
    auth: false,
    handler: async ({ req }) => {
      const { cookieValue, expiresAt } = await S.provisionDemoSession(clientKey(req));
      const res = NextResponse.json({ data: { ok: true } });
      await setSessionCookie(res, req, cookieValue, expiresAt);
      return res;
    },
  },
  { method: "GET", pattern: "/session", handler: ({ ctx }) => A.getSession(ctx) },
  { method: "GET", pattern: "/session/badges", handler: ({ ctx }) => A.badges(ctx) },
  { method: "GET", pattern: "/stream", handler: async ({ ctx, req }) => sseResponse(ctx.actor.id, ctx.workspace.id, req.signal) },
  { method: "GET", pattern: "/session/identities", handler: ({ ctx }) => U.demoIdentities(ctx) },
  {
    method: "POST",
    pattern: "/session/actor",
    handler: async ({ ctx, json }) => {
      if (!ctx.capabilities.switchActor || !ctx.sessionHash) throw new AppError("FORBIDDEN", "Actor switching is a demo-only control.");
      const { handle } = await json(z.object({ handle: z.string().min(1).max(30) }));
      return S.switchActor(ctx.sessionHash, ctx.workspace.id, handle);
    },
  },
  {
    method: "POST",
    pattern: "/session/reset",
    handler: async ({ ctx, json }) => {
      if (!ctx.capabilities.resetWorkspace || !ctx.sessionHash) throw new AppError("FORBIDDEN", "Reset is a demo-only control.");
      await json(z.object({ confirm: z.literal("RESET") }));
      await S.resetWorkspace(ctx.sessionHash, ctx.workspace.id);
      return { ok: true };
    },
  },
  // ------------------------------------------------------------------ live onboarding
  {
    method: "GET",
    pattern: "/onboarding",
    onboarding: true,
    handler: async ({ ctx }) => {
      if (ctx.viewer !== "onboarding" || !ctx.auth) throw new AppError("CONFLICT", "Your profile is already set up.");
      return { email: ctx.auth.email, providers: ctx.auth.providers, suggestion: ctx.auth.suggestion ?? { displayName: "", handle: "" } };
    },
  },
  {
    method: "GET",
    pattern: "/onboarding/handle",
    onboarding: true,
    handler: ({ query }) => handleAvailable(query(z.object({ handle: z.string().max(30).default("") })).handle),
  },
  {
    method: "POST",
    pattern: "/onboarding",
    onboarding: true,
    handler: async ({ ctx, json }) => {
      if (ctx.viewer !== "onboarding" || !ctx.auth) throw new AppError("CONFLICT", "Your profile is already set up.");
      const body = await json(z.object({ handle: z.string().min(1).max(30), displayName: z.string().max(100) }));
      return createMemberProfile({ sub: ctx.auth.subject, email: ctx.auth.email ?? undefined }, body);
    },
  },
  // ------------------------------------------------------------------ timelines
  { method: "GET", pattern: "/timeline/home", handler: ({ ctx, query }) => T.homeTimeline(ctx, query(cursorQ).cursor) },
  { method: "GET", pattern: "/timeline/latest", handler: ({ ctx, query }) => T.latestTimeline(ctx, query(cursorQ).cursor) },
  { method: "GET", pattern: "/timeline/new", handler: ({ ctx, query }) => T.newPostsSince(ctx, query(z.object({ since: z.string().max(40) })).since) },
  // ------------------------------------------------------------------ posts
  {
    method: "POST",
    pattern: "/posts",
    handler: async ({ ctx, json }) => P.createPost(ctx, await json(createPostSchema)),
  },
  { method: "GET", pattern: "/posts/:id", handler: ({ ctx, params }) => P.getPost(ctx, idSchema.parse(params.id)) },
  {
    method: "GET",
    pattern: "/posts/:id/detail",
    handler: ({ ctx, params, query }) => {
      const q = query(cursorQ.extend({ hidden: z.enum(["1", "0"]).optional() }));
      return P.postDetail(ctx, idSchema.parse(params.id), { cursor: q.cursor, hidden: q.hidden === "1" });
    },
  },
  { method: "DELETE", pattern: "/posts/:id", handler: ({ ctx, params }) => P.deletePost(ctx, idSchema.parse(params.id)) },
  ...(["PUT", "DELETE"] as const).flatMap((m): RouteDef[] => [
    { method: m, pattern: "/posts/:id/like", handler: ({ ctx, params }) => P.setLike(ctx, idSchema.parse(params.id), on(m)) },
    { method: m, pattern: "/posts/:id/repost", handler: ({ ctx, params }) => P.setRepost(ctx, idSchema.parse(params.id), on(m)) },
    { method: m, pattern: "/posts/:id/bookmark", handler: ({ ctx, params }) => P.setBookmark(ctx, idSchema.parse(params.id), on(m)) },
    { method: m, pattern: "/posts/:id/pin", handler: ({ ctx, params }) => P.setPinned(ctx, idSchema.parse(params.id), on(m)) },
    { method: m, pattern: "/posts/:id/hide", handler: ({ ctx, params }) => P.setHiddenReply(ctx, idSchema.parse(params.id), on(m)) },
    { method: m, pattern: "/posts/:id/mute-conversation", handler: ({ ctx, params }) => P.setConversationMute(ctx, idSchema.parse(params.id), on(m)) },
  ]),
  {
    method: "POST",
    pattern: "/posts/:id/vote",
    handler: async ({ ctx, params, json }) => P.vote(ctx, idSchema.parse(params.id), (await json(z.object({ optionId: idSchema }))).optionId),
  },
  { method: "GET", pattern: "/posts/:id/likes", handler: ({ ctx, params, query }) => P.likedBy(ctx, idSchema.parse(params.id), query(cursorQ).cursor) },
  { method: "GET", pattern: "/posts/:id/reposts", handler: ({ ctx, params, query }) => P.repostedBy(ctx, idSchema.parse(params.id), query(cursorQ).cursor) },
  { method: "GET", pattern: "/posts/:id/quotes", handler: ({ ctx, params, query }) => P.quotesOf(ctx, idSchema.parse(params.id), query(cursorQ).cursor) },
  { method: "GET", pattern: "/posts/:id/activity", handler: ({ ctx, params }) => P.postActivity(ctx, idSchema.parse(params.id)) },
  // ------------------------------------------------------------------ bookmarks
  { method: "GET", pattern: "/bookmarks", handler: ({ ctx, query }) => T.bookmarksTimeline(ctx, query(cursorQ).cursor) },
  { method: "DELETE", pattern: "/bookmarks", handler: ({ ctx }) => P.clearBookmarks(ctx) },
  // ------------------------------------------------------------------ users
  { method: "GET", pattern: "/users/:handle", handler: ({ ctx, params }) => U.getProfile(ctx, params.handle) },
  {
    method: "GET",
    pattern: "/users/:handle/timeline",
    handler: ({ ctx, params, query }) => {
      const q = query(cursorQ.extend({ tab: z.enum(["posts", "with_replies", "media", "likes"]).default("posts") }));
      return T.profileTimeline(ctx, params.handle, q.tab, q.cursor);
    },
  },
  { method: "GET", pattern: "/users/:handle/followers", handler: ({ ctx, params, query }) => U.connections(ctx, params.handle, "followers", query(cursorQ.extend({ q: z.string().max(50).optional() }))) },
  { method: "GET", pattern: "/users/:handle/following", handler: ({ ctx, params, query }) => U.connections(ctx, params.handle, "following", query(cursorQ.extend({ q: z.string().max(50).optional() }))) },
  { method: "PUT", pattern: "/users/:handle/follow", handler: ({ ctx, params }) => U.follow(ctx, params.handle) },
  { method: "DELETE", pattern: "/users/:handle/follow", handler: ({ ctx, params }) => U.unfollow(ctx, params.handle) },
  ...(["PUT", "DELETE"] as const).flatMap((m): RouteDef[] => [
    { method: m, pattern: "/users/:handle/notify", handler: ({ ctx, params }) => U.setProfileNotify(ctx, params.handle, on(m)) },
    { method: m, pattern: "/users/:handle/block", handler: ({ ctx, params }) => U.setBlock(ctx, params.handle, on(m)) },
    { method: m, pattern: "/users/:handle/mute", handler: ({ ctx, params }) => U.setMute(ctx, params.handle, on(m)) },
  ]),
  { method: "GET", pattern: "/users/:handle/lists", handler: ({ ctx, params }) => C.listsOwnedBy(ctx, params.handle) },
  { method: "GET", pattern: "/users/:handle/memberships", handler: ({ ctx, params }) => C.listsContaining(ctx, params.handle) },
  { method: "GET", pattern: "/users/:handle/list-membership", handler: ({ ctx, params }) => C.membershipFor(ctx, params.handle) },
  { method: "GET", pattern: "/follow-requests", handler: ({ ctx }) => U.listFollowRequests(ctx) },
  { method: "POST", pattern: "/follow-requests/:handle/accept", handler: ({ ctx, params }) => U.respondToFollowRequest(ctx, params.handle, true) },
  { method: "POST", pattern: "/follow-requests/:handle/reject", handler: ({ ctx, params }) => U.respondToFollowRequest(ctx, params.handle, false) },
  { method: "GET", pattern: "/suggestions", handler: ({ ctx, query }) => U.suggestions(ctx, query(z.object({ limit: z.coerce.number().int().min(1).max(30).default(3) })).limit) },
  { method: "GET", pattern: "/mentions", handler: ({ ctx, query }) => U.mentionSuggestions(ctx, query(z.object({ q: z.string().max(30).default("") })).q) },
  // ------------------------------------------------------------------ me
  { method: "PATCH", pattern: "/me/profile", handler: async ({ ctx, json }) => U.updateProfile(ctx, await json(profileSchema)) },
  { method: "PATCH", pattern: "/me/account", handler: async ({ ctx, json }) => U.updateAccount(ctx, await json(accountSchema)) },
  { method: "GET", pattern: "/me/preferences", handler: ({ ctx }) => A.getPreferences(ctx) },
  { method: "PATCH", pattern: "/me/preferences", handler: async ({ ctx, json }) => A.updatePreferences(ctx, await json(preferencesSchema)) },
  { method: "GET", pattern: "/me/muted-words", handler: ({ ctx }) => A.listMutedWords(ctx) },
  { method: "POST", pattern: "/me/muted-words", handler: async ({ ctx, json }) => A.addMutedWord(ctx, await json(mutedWordSchema)) },
  { method: "DELETE", pattern: "/me/muted-words/:id", handler: ({ ctx, params }) => A.removeMutedWord(ctx, idSchema.parse(params.id)) },
  { method: "GET", pattern: "/me/blocked", handler: ({ ctx }) => U.blockedAccounts(ctx) },
  { method: "GET", pattern: "/me/muted", handler: ({ ctx }) => U.mutedAccounts(ctx) },
  { method: "GET", pattern: "/me/reports", handler: ({ ctx }) => A.myReports(ctx) },
  // ------------------------------------------------------------------ notifications
  {
    method: "GET",
    pattern: "/notifications",
    handler: ({ ctx, query }) => {
      const q = query(cursorQ.extend({ tab: z.enum(["all", "mentions"]).default("all") }));
      return N.listNotifications(ctx, { tab: q.tab, cursor: q.cursor });
    },
  },
  {
    method: "POST",
    pattern: "/notifications/read",
    handler: async ({ ctx, json }) => {
      const { upTo } = await json(z.object({ upTo: z.string().datetime().optional() }));
      await N.markNotificationsRead(ctx, upTo);
      return A.badges(ctx);
    },
  },
  // ------------------------------------------------------------------ search & explore
  {
    method: "GET",
    pattern: "/search",
    handler: async ({ ctx, query }) => {
      const q = query(cursorQ.extend({ q: z.string().max(500).default(""), f: z.enum(["top", "live", "user", "image", "video"]).default("top") }));
      if (!q.cursor && q.q.trim() && isMember(ctx)) await Q.recordRecentSearch(ctx, q.q);
      if (q.f === "user") return Q.searchPeople(ctx, q.q, q.cursor);
      return Q.searchPosts(ctx, q.q, q.f, q.cursor);
    },
  },
  { method: "GET", pattern: "/search/typeahead", handler: ({ ctx, query }) => Q.typeahead(ctx, query(z.object({ q: z.string().max(100).default("") })).q) },
  { method: "GET", pattern: "/search/history", handler: ({ ctx }) => Q.searchHistory(ctx) },
  { method: "DELETE", pattern: "/search/history", handler: ({ ctx }) => Q.clearRecentSearches(ctx) },
  { method: "DELETE", pattern: "/search/history/:id", handler: ({ ctx, params }) => Q.clearRecentSearches(ctx, idSchema.parse(params.id)) },
  { method: "PUT", pattern: "/search/saved", handler: async ({ ctx, json }) => Q.saveSearch(ctx, (await json(z.object({ query: z.string().max(200) }))).query, true) },
  { method: "DELETE", pattern: "/search/saved", handler: async ({ ctx, json }) => Q.saveSearch(ctx, (await json(z.object({ query: z.string().max(200) }))).query, false) },
  { method: "GET", pattern: "/explore/trends", handler: ({ ctx, query }) => Q.trends(ctx, query(z.object({ category: z.string().max(40).optional() })).category) },
  // ------------------------------------------------------------------ messages
  { method: "GET", pattern: "/conversations", handler: ({ ctx, query }) => M.listConversations(ctx, query(z.object({ box: z.enum(["inbox", "requests"]).default("inbox") })).box) },
  { method: "POST", pattern: "/conversations", handler: async ({ ctx, json }) => { const b = await json(handleList); return M.startConversation(ctx, b.handles, b.name); } },
  { method: "GET", pattern: "/conversations/:id", handler: ({ ctx, params }) => M.conversationDTO(ctx, idSchema.parse(params.id)) },
  {
    method: "PATCH",
    pattern: "/conversations/:id",
    handler: async ({ ctx, params, json }) => M.updateConversation(ctx, idSchema.parse(params.id), await json(z.object({ name: z.string().max(200).nullable().optional(), muted: z.boolean().optional(), draft: z.string().max(20000).optional() }))),
  },
  { method: "DELETE", pattern: "/conversations/:id", handler: ({ ctx, params }) => M.leaveConversation(ctx, idSchema.parse(params.id)) },
  {
    method: "GET",
    pattern: "/conversations/:id/messages",
    handler: ({ ctx, params, query }) => {
      const q = query(z.object({ before: z.string().datetime().optional(), after: z.string().datetime().optional() }));
      return M.listMessages(ctx, idSchema.parse(params.id), q);
    },
  },
  { method: "POST", pattern: "/conversations/:id/messages", handler: async ({ ctx, params, json }) => M.sendMessage(ctx, idSchema.parse(params.id), await json(messageSchema)) },
  { method: "POST", pattern: "/conversations/:id/read", handler: ({ ctx, params }) => M.markRead(ctx, idSchema.parse(params.id)) },
  { method: "POST", pattern: "/conversations/:id/request", handler: async ({ ctx, params, json }) => M.respondToRequest(ctx, idSchema.parse(params.id), (await json(z.object({ action: z.enum(["accept", "delete"]) }))).action) },
  { method: "POST", pattern: "/conversations/:id/members", handler: async ({ ctx, params, json }) => M.addMembers(ctx, idSchema.parse(params.id), (await json(handleList)).handles) },
  { method: "DELETE", pattern: "/conversations/:id/members/:handle", handler: ({ ctx, params }) => M.removeMember(ctx, idSchema.parse(params.id), params.handle) },
  { method: "GET", pattern: "/conversations/:id/media", handler: ({ ctx, params }) => M.sharedMedia(ctx, idSchema.parse(params.id)) },
  { method: "DELETE", pattern: "/messages/:id", handler: ({ ctx, params }) => M.hideMessageForMe(ctx, idSchema.parse(params.id)) },
  { method: "PUT", pattern: "/messages/:id/reaction", handler: async ({ ctx, params, json }) => M.setReaction(ctx, idSchema.parse(params.id), (await json(z.object({ emoji: z.string().max(16).nullable() }))).emoji) },
  { method: "GET", pattern: "/dm/recipients", handler: ({ ctx, query }) => M.searchRecipients(ctx, query(z.object({ q: z.string().max(50).default("") })).q) },
  // ------------------------------------------------------------------ lists
  { method: "GET", pattern: "/lists", handler: ({ ctx }) => C.myLists(ctx) },
  { method: "POST", pattern: "/lists", handler: async ({ ctx, json }) => C.createList(ctx, await json(listSchema)) },
  { method: "GET", pattern: "/lists/:id", handler: ({ ctx, params }) => C.getList(ctx, idSchema.parse(params.id)) },
  { method: "PATCH", pattern: "/lists/:id", handler: async ({ ctx, params, json }) => C.updateList(ctx, idSchema.parse(params.id), await json(listSchema)) },
  { method: "DELETE", pattern: "/lists/:id", handler: ({ ctx, params }) => C.deleteList(ctx, idSchema.parse(params.id)) },
  { method: "GET", pattern: "/lists/:id/timeline", handler: ({ ctx, params, query }) => T.listTimeline(ctx, idSchema.parse(params.id), query(cursorQ).cursor) },
  { method: "GET", pattern: "/lists/:id/members", handler: ({ ctx, params }) => C.listPeople(ctx, idSchema.parse(params.id), "members") },
  { method: "GET", pattern: "/lists/:id/followers", handler: ({ ctx, params }) => C.listPeople(ctx, idSchema.parse(params.id), "followers") },
  ...(["PUT", "DELETE"] as const).flatMap((m): RouteDef[] => [
    { method: m, pattern: "/lists/:id/members/:handle", handler: ({ ctx, params }) => C.setListMember(ctx, idSchema.parse(params.id), params.handle, on(m)) },
    { method: m, pattern: "/lists/:id/subscription", handler: ({ ctx, params }) => C.setListSubscription(ctx, idSchema.parse(params.id), on(m)) },
    { method: m, pattern: "/lists/:id/pin", handler: ({ ctx, params }) => C.setListPin(ctx, idSchema.parse(params.id), on(m)) },
    { method: m, pattern: "/topics/:slug/follow", handler: ({ ctx, params }) => C.setTopicFollow(ctx, params.slug, on(m)) },
  ]),
  // ------------------------------------------------------------------ topics
  { method: "GET", pattern: "/topics", handler: ({ ctx }) => C.topics(ctx) },
  { method: "GET", pattern: "/topics/:slug", handler: ({ ctx, params }) => C.getTopic(ctx, params.slug) },
  { method: "GET", pattern: "/topics/:slug/timeline", handler: ({ ctx, params, query }) => T.topicTimeline(ctx, params.slug, query(cursorQ).cursor) },
  // ------------------------------------------------------------------ moments
  { method: "GET", pattern: "/moments", handler: ({ ctx }) => C.moments(ctx) },
  { method: "POST", pattern: "/moments", handler: async ({ ctx, json }) => C.createMoment(ctx, await json(momentSchema)) },
  { method: "GET", pattern: "/moments/:id", handler: ({ ctx, params }) => C.getMoment(ctx, idSchema.parse(params.id)) },
  { method: "PATCH", pattern: "/moments/:id", handler: async ({ ctx, params, json }) => C.updateMoment(ctx, idSchema.parse(params.id), await json(momentSchema)) },
  { method: "DELETE", pattern: "/moments/:id", handler: ({ ctx, params }) => C.deleteMoment(ctx, idSchema.parse(params.id)) },
  { method: "POST", pattern: "/moments/:id/publish", handler: async ({ ctx, params, json }) => C.publishMoment(ctx, idSchema.parse(params.id), (await json(z.object({ publish: z.boolean() }))).publish) },
  // ------------------------------------------------------------------ drafts & scheduled
  { method: "GET", pattern: "/drafts", handler: ({ ctx }) => K.listDrafts(ctx) },
  { method: "POST", pattern: "/drafts", handler: async ({ ctx, json }) => K.saveDraft(ctx, null, (await json(draftSchema)).payload) },
  { method: "PUT", pattern: "/drafts/:id", handler: async ({ ctx, params, json }) => K.saveDraft(ctx, idSchema.parse(params.id), (await json(draftSchema)).payload) },
  { method: "DELETE", pattern: "/drafts/:id", handler: ({ ctx, params }) => K.deleteDraft(ctx, idSchema.parse(params.id)) },
  { method: "GET", pattern: "/scheduled", handler: ({ ctx }) => K.listScheduled(ctx) },
  { method: "POST", pattern: "/scheduled", handler: async ({ ctx, json }) => K.schedulePost(ctx, await json(scheduleSchema)) },
  { method: "PUT", pattern: "/scheduled/:id", handler: async ({ ctx, params, json }) => K.updateScheduled(ctx, idSchema.parse(params.id), await json(scheduleSchema)) },
  { method: "DELETE", pattern: "/scheduled/:id", handler: ({ ctx, params }) => K.cancelScheduled(ctx, idSchema.parse(params.id)) },
  { method: "POST", pattern: "/compose/validate", handler: async ({ json }) => { await json(composeSchema); return { ok: true }; } },
  // ------------------------------------------------------------------ media
  {
    method: "POST",
    pattern: "/media",
    handler: async ({ ctx, req }) => {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > Media.LIMITS.VIDEO + 1024 * 64) throw new AppError("PAYLOAD_TOO_LARGE", "Files must be 40 MB or smaller.");
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose a file to upload.");
      const num = (k: string) => (form.get(k) ? Number(form.get(k)) : undefined);
      const poster = form.get("poster");
      return Media.upload(ctx, file, { scope: String(form.get("scope") ?? "POST"), alt: String(form.get("alt") ?? ""), width: num("width"), height: num("height"), durationMs: num("durationMs"), poster: poster instanceof File ? poster : undefined });
    },
  },
  { method: "GET", pattern: "/media/:id", handler: ({ ctx, params, url, req }) => Media.serveMedia(ctx, idSchema.parse(params.id), url.searchParams.get("v"), req.headers.get("range")) },
  { method: "PATCH", pattern: "/media/:id", handler: async ({ ctx, params, json }) => Media.setAlt(ctx, idSchema.parse(params.id), (await json(altSchema)).alt) },
  { method: "DELETE", pattern: "/media/:id", handler: ({ ctx, params }) => Media.deleteUnattached(ctx, idSchema.parse(params.id)) },
  { method: "GET", pattern: "/gifs", handler: async () => Media.BUNDLED_GIFS.map((g) => ({ ...g, previewUrl: `/api/gifs/${encodeURIComponent(g.file)}` })) },
  {
    method: "GET",
    pattern: "/gifs/:file",
    handler: async ({ params }) => {
      const g = Media.BUNDLED_GIFS.find((x) => x.file === params.file);
      if (!g) throw new AppError("NOT_FOUND", "Unknown GIF.");
      const { storage } = await import("./storage");
      const obj = await storage().get(`seed/gifs/${g.file}`);
      if (!obj) throw new AppError("GONE", "Missing GIF.");
      return new Response(obj.stream(), { headers: { "content-type": "image/gif", "cache-control": "public, max-age=86400", "content-length": String(obj.size) } });
    },
  },
  { method: "POST", pattern: "/gifs", handler: async ({ ctx, json }) => { const b = await json(z.object({ file: z.string().max(60), scope: z.enum(["POST", "MESSAGE"]) })); return Media.pickBundledGif(ctx, b.file, b.scope); } },
  // ------------------------------------------------------------------ reports
  { method: "POST", pattern: "/reports", handler: async ({ ctx, json }) => A.createReport(ctx, await json(reportSchema)) },
];

/**
 * Live-mode read-only guest access: browse and search public content only. Everything
 * else (all writes, DMs, notifications, bookmarks, settings, drafts, uploads) answers
 * SIGN_UP_REQUIRED. Private accounts and their posts stay hidden by the same visibility
 * rules that apply to any non-follower.
 */
export const GUEST_READ_ROUTES = new Set([
  "GET /session", "GET /session/badges",
  "GET /timeline/home", "GET /timeline/latest", "GET /timeline/new",
  "GET /posts/:id", "GET /posts/:id/detail", "GET /posts/:id/likes", "GET /posts/:id/reposts", "GET /posts/:id/quotes",
  "GET /users/:handle", "GET /users/:handle/timeline", "GET /users/:handle/followers", "GET /users/:handle/following",
  "GET /users/:handle/lists", "GET /users/:handle/memberships", "GET /suggestions",
  "GET /search", "GET /search/typeahead", "GET /explore/trends",
  "GET /lists/:id", "GET /lists/:id/timeline", "GET /lists/:id/members", "GET /lists/:id/followers",
  "GET /topics", "GET /topics/:slug", "GET /topics/:slug/timeline",
  "GET /moments", "GET /moments/:id", "GET /media/:id", "GET /gifs/:file", "GET /me/preferences",
]);
for (const r of routes) if (GUEST_READ_ROUTES.has(r.method + " " + r.pattern)) r.guest = true;
