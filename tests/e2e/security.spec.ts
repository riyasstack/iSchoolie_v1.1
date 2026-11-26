import { test, expect } from "@playwright/test";
import { api, openApp, rand } from "./fixtures";
import type { ConversationDTO, MessageDTO, PostDTO, SessionDTO } from "../../src/lib/types";

const H = { "x-ischoolie-csrf": "1", origin: "http://localhost:3000", "content-type": "application/json" };

test("15/16. independent demo sessions are isolated; forged requests are rejected", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await openApp(pa, "/home");
  await openApp(pb, "/home");
  const sa = await api<SessionDTO>(pa.request, "GET", "/session");
  const sb = await api<SessionDTO>(pb.request, "GET", "/session");
  expect(sa.workspace.id).not.toBe(sb.workspace.id);

  // A posts privately-workspaced content; B can't read it by id.
  const [post] = await api<PostDTO[]>(pa.request, "POST", "/posts", { items: [{ text: `A only ${rand()}`, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: `k${rand()}${rand()}` });
  const fromB = await api<{ unavailable?: string }>(pb.request, "GET", `/posts/${post.id}`);
  expect(fromB.unavailable).toBe("not_found");
  expect((await pb.request.fetch(`/api/posts/${post.id}/like`, { method: "PUT", headers: H })).status()).toBe(404);

  // B can't read A's conversation or its private attachment.
  const inboxA = await api<ConversationDTO[]>(pa.request, "GET", "/conversations?box=inbox");
  const conv = inboxA.find((c) => c.kind === "GROUP")!;
  expect((await pb.request.get(`/api/conversations/${conv.id}/messages`)).status()).toBe(404);
  const msgs = await api<{ items: MessageDTO[] }>(pa.request, "GET", `/conversations/${conv.id}/messages`);
  const media = msgs.items.flatMap((m) => m.media)[0];
  expect(media).toBeTruthy();
  expect((await pa.request.get(media.url)).status()).toBe(200);
  expect((await pb.request.get(media.url)).status()).toBe(404);

  // Client-supplied actor/workspace ids are ignored: the body field has no effect.
  const forged = await pb.request.fetch("/api/posts", { method: "POST", headers: H, data: JSON.stringify({ items: [{ text: "forged", mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: `f${rand()}${rand()}`, authorId: sa.actor.id, workspaceId: sa.workspace.id }) });
  expect(forged.status()).toBe(200);
  const created = (await forged.json()).data[0] as PostDTO;
  expect(created.author.id).toBe(sb.actor.id);

  // Editing someone else's post is refused.
  const theirs = (await api<{ posts: PostDTO[] }>(pb.request, "GET", "/search?q=from:prof_lindqvist&f=live")).posts[0];
  expect((await pb.request.fetch(`/api/posts/${theirs.id}`, { method: "DELETE", headers: H })).status()).toBe(403);

  // CSRF: missing header or foreign Origin is rejected.
  expect((await pb.request.fetch(`/api/posts/${theirs.id}/like`, { method: "PUT", headers: { origin: "http://localhost:3000" } })).status()).toBe(403);
  expect((await pb.request.fetch(`/api/posts/${theirs.id}/like`, { method: "PUT", headers: { ...H, origin: "https://evil.example" } })).status()).toBe(403);

  // No session cookie → 401, never a shared account.
  const anon = await browser.newContext();
  const r = await anon.request.get("http://localhost:3000/api/session");
  expect(r.status()).toBe(401);
  // A forged/garbled cookie is rejected the same way.
  await anon.addCookies([{ name: "isc_session", value: "forged.value", url: "http://localhost:3000" }]);
  expect((await anon.request.get("http://localhost:3000/api/session")).status()).toBe(401);
  // Actor switching is restricted to seeded identities in the caller's workspace.
  expect((await pb.request.fetch("/api/session/actor", { method: "POST", headers: H, data: JSON.stringify({ handle: "does_not_exist" }) })).status()).toBe(404);
  await a.close();
  await b.close();
  await anon.close();
});

test("session cookie is HttpOnly and SameSite", async ({ page, context }) => {
  await openApp(page, "/home");
  const c = (await context.cookies()).find((x) => x.name === "isc_session")!;
  expect(c.httpOnly).toBe(true);
  expect(c.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie.includes("isc_session"))).toBe(false);
});
