/**
 * Live mode (Supabase Auth): claims → viewer mapping, onboarding, and read-only guest
 * gating through the real API dispatcher. Supabase JWT verification itself is
 * Supabase's job; here verified claims are injected exactly as getClaims() returns them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { seedWorkspace } from "@/server/seed/seeder";
import { contextFromClaims, createMemberProfile, handleAvailable, liveWorkspace, suggestionsFromClaims, type AuthClaims } from "@/server/auth";
import { createDispatcher } from "@/server/http";
import { routes, GUEST_READ_ROUTES } from "@/server/api-routes";
import { expectCode, key } from "./helpers";
import type { RequestContext } from "@/server/context";

let wsId: string;
let claims: AuthClaims | null = null;
const dispatch = createDispatcher(routes, { resolve: () => contextFromClaims(claims) });
const ORIGIN = "http://localhost:3000";

function call(method: string, path: string, body?: unknown) {
  const req = new NextRequest(`${ORIGIN}/api${path}`, {
    method,
    headers: { host: "localhost:3000", ...(method !== "GET" ? { origin: ORIGIN, "x-ischoolie-csrf": "1", "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const [p, q] = path.split("?");
  void q;
  return dispatch(req, p.split("/").filter(Boolean).map(decodeURIComponent));
}

async function json(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON assertions in tests
  return (await res.json()) as { data?: any; error?: { code: string; message: string } };
}

const sub = () => crypto.randomUUID();

beforeAll(async () => {
  const ws = await liveWorkspace();
  wsId = ws.id;
  if ((await prisma.user.count({ where: { workspaceId: wsId, isSeedActor: true } })) === 0) {
    await prisma.$transaction((tx) => seedWorkspace(tx, wsId), { timeout: 60_000 });
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("viewer resolution from Supabase claims", () => {
  it("no claims → read-only guest in the LIVE workspace", async () => {
    const ctx = await contextFromClaims(null);
    expect(ctx.viewer).toBe("guest");
    expect(ctx.mode).toBe("live");
    expect(ctx.workspace.kind).toBe("LIVE");
    expect(ctx.capabilities).toEqual({ switchActor: false, resetWorkspace: false });
  });

  it("verified user without a profile → onboarding, with suggestions from the provider profile", async () => {
    const c: AuthClaims = { sub: sub(), email: "ada@example.test", user_metadata: { full_name: "Ada L.", user_name: "Ada-Lovelace" }, app_metadata: { provider: "github", providers: ["github"] } };
    const ctx = await contextFromClaims(c);
    expect(ctx.viewer).toBe("onboarding");
    expect(ctx.auth?.providers).toEqual(["github"]);
    expect(ctx.auth?.suggestion).toEqual({ displayName: "Ada L.", handle: "ada_lovelace" });
    expect(suggestionsFromClaims({ sub: "x", email: "a@b.c" }).handle).toBe("");
  });

  it("onboarding creates exactly one profile per identity; then the viewer is a member", async () => {
    const c: AuthClaims = { sub: sub(), email: "new@example.test" };
    const handle = `m${key().slice(0, 10)}`;
    const r = await createMemberProfile(c, { handle, displayName: "  New   Member " });
    expect(r.handle).toBe(handle);
    const ctx = await contextFromClaims(c);
    expect(ctx.viewer).toBe("member");
    expect(ctx.actor.handle).toBe(handle);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.actor.id }, include: { authIdentity: true, preferences: true } });
    expect(user.displayName).toBe("New Member");
    expect(user.isSeedActor).toBe(false);
    expect(user.authIdentity?.email).toBe("new@example.test");
    expect(user.preferences).not.toBeNull();
    await expectCode(createMemberProfile(c, { handle: `x${key().slice(0, 10)}`, displayName: "Again" }), "CONFLICT");
  });

  it("rejects taken, reserved and malformed usernames", async () => {
    await expectCode(createMemberProfile({ sub: sub() }, { handle: "maya_learns", displayName: "Copy" }), "CONFLICT");
    await expectCode(createMemberProfile({ sub: sub() }, { handle: "signin", displayName: "R" }), "VALIDATION");
    await expectCode(createMemberProfile({ sub: sub() }, { handle: "a b", displayName: "R" }), "VALIDATION");
    expect((await handleAvailable("MAYA_LEARNS")).available).toBe(false);
    expect((await handleAvailable(`free${key().slice(0, 8)}`)).available).toBe(true);
  });
});

describe("guest (signed out) access through the API", () => {
  it("can read the public timeline, posts, profiles, search and explore", async () => {
    claims = null;
    const session = await json(await call("GET", "/session"));
    expect(session.data.viewer).toBe("guest");
    expect(session.data.badges).toEqual({ notifications: 0, messages: 0, followRequests: 0 });

    const home = await json(await call("GET", "/timeline/home"));
    expect(home.data.posts.length).toBeGreaterThan(0);
    // Public timeline: no protected authors.
    for (const p of home.data.posts) expect(p.author.isProtected).toBe(false);

    const postId = home.data.posts[0].id;
    const before = await prisma.postEvent.count({ where: { postId } });
    expect((await call("GET", `/posts/${postId}/detail`)).status).toBe(200);
    expect(await prisma.postEvent.count({ where: { postId } })).toBe(before);

    expect((await call("GET", "/users/maya_learns")).status).toBe(200);
    expect((await call("GET", "/users/maya_learns/timeline")).status).toBe(200);
    expect((await call("GET", "/explore/trends")).status).toBe(200);
    const searches = await prisma.recentSearch.count();
    const res = await call("GET", "/search?q=orbits");
    expect(res.status).toBe(200);
    expect(await prisma.recentSearch.count()).toBe(searches);
  });

  it("cannot see a protected account's posts", async () => {
    claims = null;
    const protectedUser = await prisma.user.findFirstOrThrow({ where: { workspaceId: wsId, isProtected: true } });
    const res = await json(await call("GET", `/users/${protectedUser.handle}/timeline`));
    expect(res.error?.code).toBe("PROTECTED");
  });

  it.each([
    ["PUT", "/posts/:post/like"],
    ["PUT", "/posts/:post/repost"],
    ["PUT", "/posts/:post/bookmark"],
    ["POST", "/posts"],
    ["PUT", "/users/maya_learns/follow"],
    ["POST", "/conversations"],
    ["GET", "/conversations"],
    ["GET", "/notifications"],
    ["GET", "/bookmarks"],
    ["GET", "/drafts"],
    ["PATCH", "/me/profile"],
    ["POST", "/reports"],
    ["GET", "/stream"],
    ["GET", "/search/history"],
  ])("%s %s → SIGN_UP_REQUIRED (401) and nothing is written", async (method, pattern) => {
    claims = null;
    const post = await prisma.post.findFirstOrThrow({ where: { workspaceId: wsId, deletedAt: null } });
    const counts = async () => Promise.all([prisma.like.count(), prisma.repost.count(), prisma.bookmark.count(), prisma.post.count(), prisma.follow.count(), prisma.conversation.count(), prisma.report.count()]);
    const before = await counts();
    const res = await call(method, pattern.replace(":post", post.id), method === "GET" ? undefined : { items: [{ text: "hi", mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: key(), handles: ["maya_learns"] });
    expect(res.status).toBe(401);
    expect((await json(res)).error?.code).toBe("SIGN_UP_REQUIRED");
    expect(await counts()).toEqual(before);
  });

  it("every guest-allowed route is a GET", () => {
    for (const r of routes) if (r.guest) expect(r.method).toBe("GET");
    expect([...GUEST_READ_ROUTES].every((k) => routes.some((r) => `${r.method} ${r.pattern}` === k))).toBe(true);
  });
});

describe("onboarding viewers and members", () => {
  it("onboarding viewers can only read and finish onboarding", async () => {
    const s = sub();
    claims = { sub: s, email: "onb@example.test", user_metadata: { full_name: "Onboarding Person" } };
    const info = await json(await call("GET", "/onboarding"));
    expect(info.data.suggestion.displayName).toBe("Onboarding Person");
    expect((await json(await call("POST", "/posts", { items: [{ text: "x", mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: key() }))).error?.code).toBe("ONBOARDING_REQUIRED");
    const handle = `o${key().slice(0, 10)}`;
    const created = await call("POST", "/onboarding", { handle, displayName: "Onboarding Person" });
    expect(created.status).toBe(200);
    // Now a member: can post, and the session reflects the profile.
    const session = await json(await call("GET", "/session"));
    expect(session.data.viewer).toBe("member");
    expect(session.data.actor.handle).toBe(handle);
    expect(session.data.account.email).toBe("onb@example.test");
    const posted = await call("POST", "/posts", { items: [{ text: "Hello from a real member", mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: key() });
    expect(posted.status).toBe(200);
    expect((await json(await call("GET", "/onboarding"))).error?.code).toBe("CONFLICT");
  });

  it("members get no demo controls", async () => {
    const c: AuthClaims = { sub: sub() };
    await createMemberProfile(c, { handle: `d${key().slice(0, 10)}`, displayName: "D" });
    claims = c;
    const ctx: RequestContext = await contextFromClaims(c);
    expect(ctx.capabilities.switchActor).toBe(false);
    expect((await json(await call("POST", "/session/reset", { confirm: "RESET" }))).error?.code).toBe("FORBIDDEN");
    expect((await json(await call("POST", "/session/actor", { handle: "maya_learns" }))).error?.code).toBe("FORBIDDEN");
  });
});
