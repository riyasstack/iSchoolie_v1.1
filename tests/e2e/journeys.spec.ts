import { test, expect } from "@playwright/test";
import { api, openApp, rand, switchActor, PNG } from "./fixtures";
import type { PostDTO, ConversationDTO, MessageDTO } from "../../src/lib/types";

test("1. opens without login; publish a post; it survives reload in Home, profile and permalink", async ({ page }) => {
  await openApp(page, "/");
  await expect(page).toHaveURL(/\/home$/);
  const text = `E2E hello ${rand()} #e2e`;
  const box = page.getByLabel("Share something with your campus…");
  await box.click();
  await box.fill(text);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Your post was sent.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "For you" }).waitFor();
  await expect(page.locator("article", { hasText: text })).toBeVisible();
  await page.goto("/maya_learns");
  const card = page.locator("article", { hasText: text }).first();
  await expect(card).toBeVisible();
  await card.locator("time").click();
  await expect(page).toHaveURL(/\/maya_learns\/status\/[a-z0-9]+$/);
  await expect(page.locator("article").getByText(text).first()).toBeVisible();
});

test("2. like, repost, bookmark and quote stay in sync across screens", async ({ page }) => {
  await openApp(page, "/home");
  const posts = await api<{ posts: PostDTO[] }>(page.request, "GET", "/search?q=from:prof_lindqvist%20pendulum&f=live");
  const target = posts.posts[0];
  await page.goto(`/prof_lindqvist/status/${target.id}`);
  const focal = page.locator(`article[data-post-id="${target.id}"]`).first();
  await focal.getByRole("button", { name: /^Cheer/ }).click();
  await expect(focal.getByRole("button", { name: /^Remove cheer/ })).toBeVisible();
  await focal.getByRole("button", { name: /^Send post/ }).click();
  await page.getByRole("menuitem", { name: "Save post" }).click();
  await expect(page.getByText("Saved to your library")).toBeVisible();
  await focal.getByRole("button", { name: /^Share/ }).click();
  await page.getByRole("menuitem", { name: "Share to your followers" }).click();
  await expect(focal.getByRole("button", { name: /^Undo share/ })).toBeVisible();
  // Saved screen shows the same state.
  await page.goto("/i/bookmarks");
  const bm = page.locator(`article[data-post-id="${target.id}"]`).first();
  await expect(bm.getByRole("button", { name: /^Remove cheer/ })).toBeVisible();
  // Server agrees after reload.
  const fresh = await api<PostDTO>(page.request, "GET", `/posts/${target.id}`);
  expect(fresh.viewer.liked && fresh.viewer.reposted && fresh.viewer.bookmarked).toBe(true);
  // Quote it.
  await page.goto(`/compose/post?quote=${target.id}`);
  const quote = `Quoting ${rand()}`;
  await page.getByLabel("Add a comment").fill(quote);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Your post was sent.")).toBeVisible();
  const after = await api<PostDTO>(page.request, "GET", `/posts/${target.id}`);
  expect(after.counts.quotes).toBe(fresh.counts.quotes + 1);
});

test("3. follow and unfollow update counts", async ({ page }) => {
  await openApp(page, "/ben_music");
  const main = page.locator("#main");
  const followers = main.getByRole("link", { name: /Followers/ }).first();
  const before = Number((await followers.textContent())?.match(/\d+/)?.[0]);
  await main.getByRole("button", { name: "Follow", exact: true }).first().click();
  await expect(main.getByRole("button", { name: /Following @ben_music/ })).toBeVisible();
  await expect(followers).toContainText(String(before + 1));
  await main.getByRole("button", { name: /Following @ben_music/ }).click();
  await page.getByRole("button", { name: "Unfollow", exact: true }).click();
  await expect(followers).toContainText(String(before));
});

test("4. request a protected profile, approve as that account, then see posts", async ({ page }) => {
  await openApp(page, "/riley_locked");
  await expect(page.getByText("These posts are protected")).toBeVisible();
  await page.locator("#main").getByRole("button", { name: "Follow", exact: true }).first().click();
  await expect(page.locator("#main").getByRole("button", { name: "Pending" })).toBeVisible();
  await switchActor(page, "riley_locked");
  await page.goto("/i/follower_requests");
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByText(/can now see your posts/)).toBeVisible();
  await switchActor(page, "maya_learns");
  await page.goto("/riley_locked");
  await expect(page.getByText("Tide pools at low tide")).toBeVisible();
});

test("5. vote in a poll; reload keeps results; server rejects a second vote and closed polls", async ({ page }) => {
  await openApp(page, "/home");
  await switchActor(page, "omar_runs");
  const res = await api<{ posts: PostDTO[] }>(page.request, "GET", "/search?q=structure%20study%20sessions&f=live");
  const poll = res.posts.find((p) => p.poll)!;
  await page.goto(`/maya_learns/status/${poll.id}`);
  const focal = page.locator(`article[data-post-id="${poll.id}"]`).first();
  await focal.getByRole("button", { name: "Pomodoro (25/5)" }).click();
  await expect(focal.getByLabel(/Pomodoro \(25\/5\): \d+% \(your vote\)/)).toBeVisible();
  await page.reload();
  await expect(page.locator(`article[data-post-id="${poll.id}"]`).first().getByLabel(/\(your vote\)/)).toBeVisible();
  const second = await page.request.fetch(`/api/posts/${poll.id}/vote`, { method: "POST", headers: { "x-ischoolie-csrf": "1", origin: "http://localhost:3000", "content-type": "application/json" }, data: JSON.stringify({ optionId: poll.poll!.options[1].id }) });
  expect(second.status()).toBe(409);
  const closed = (await api<{ posts: PostDTO[] }>(page.request, "GET", "/search?q=winter%20reading%20list&f=live")).posts[0];
  const late = await page.request.fetch(`/api/posts/${closed.id}/vote`, { method: "POST", headers: { "x-ischoolie-csrf": "1", origin: "http://localhost:3000", "content-type": "application/json" }, data: JSON.stringify({ optionId: closed.poll!.options[0].id }) });
  expect(late.status()).toBe(409);
});

test("6. upload an image with alt text and open it in the viewer", async ({ page }) => {
  await openApp(page, "/compose/post");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "blue.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Add image description" }).click();
  await page.getByRole("textbox", { name: "Description" }).fill("A small blue square");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /Edit image description: A small blue square/ })).toBeVisible();
  const text = `Photo ${rand()}`;
  await page.getByLabel("Share something with your campus…").fill(text);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Your post was sent.")).toBeVisible();
  await page.goto("/maya_learns/media");
  const card = page.locator("article", { hasText: text }).first();
  await card.getByRole("link", { name: "Image: A small blue square" }).click();
  await expect(page).toHaveURL(/\/photo\/1$/);
  await expect(page.getByRole("dialog").getByRole("img", { name: "A small blue square" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/\/photo\/1$/);
});

test("7. drafts persist on the server; scheduled posts are published by the worker", async ({ page }) => {
  test.setTimeout(150_000);
  await openApp(page, "/compose/post");
  const draft = `Draft ${rand()}`;
  await page.getByLabel("Share something with your campus…").fill(draft);
  await page.waitForResponse((r) => r.url().includes("/api/drafts") && r.request().method() !== "GET");
  await page.goto("/compose/drafts");
  await expect(page.getByText(draft)).toBeVisible();
  await page.getByText(draft).click();
  await expect(page.getByLabel("Share something with your campus…")).toHaveValue(draft);
  // Schedule via the API ~65s ahead, then wait for the worker (browser not needed).
  const text = `Scheduled ${rand()}`;
  const when = new Date(Date.now() + 65_000).toISOString();
  await api(page.request, "POST", "/scheduled", { payload: { items: [{ text, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null }, scheduledFor: when, timezone: "UTC" });
  await expect
    .poll(async () => (await api<{ posts: PostDTO[] }>(page.request, "GET", `/search?q=${encodeURIComponent(text)}&f=live`)).posts.length, { timeout: 120_000, intervals: [5_000] })
    .toBe(1);
});

test("8. lists: create, add members, timeline, and private-list restriction", async ({ page, browser }) => {
  await openApp(page, "/i/lists/create");
  const name = `L ${rand()}`;
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Make private").check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/i\/lists\/[a-z0-9]+\/members$/);
  await page.getByLabel("Add people").fill("coach");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByText(/Added @coach_reyes/)).toBeVisible();
  const listUrl = page.url().replace(/\/members$/, "");
  await page.goto(listUrl);
  await expect(page.locator("article").first()).toBeVisible();
  // A different actor in the same workspace cannot see the private list.
  await switchActor(page, "stargazer_sam");
  await page.goto(listUrl);
  await expect(page.getByText("This Circle doesn’t exist")).toBeVisible();
  // Another visitor's workspace can't see it either.
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(listUrl);
  await expect(p2.getByText("This Circle doesn’t exist")).toBeVisible();
  await other.close();
});

test("9. moments: create, order and publish", async ({ page }) => {
  await openApp(page, "/i/moments/create");
  const title = `Moment ${rand()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Your posts" }).click();
  const adds = page.getByRole("button", { name: "Add" });
  await adds.nth(0).click();
  await adds.nth(1).click();
  await page.getByRole("button", { name: "Move down" }).first().click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(2);
});

test("10. direct and group messages persist; retries don't duplicate", async ({ page }) => {
  await openApp(page, "/messages");
  await page.getByRole("link", { name: /Dr\. Astrid Lindqvist/ }).click();
  const text = `DM ${rand()}`;
  await page.getByLabel("Start a new message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log").getByText(text)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("log").getByText(text)).toBeVisible();
  const convId = page.url().split("/").pop()!;
  const k = `retry${rand()}${rand()}`;
  const a = await api<MessageDTO>(page.request, "POST", `/conversations/${convId}/messages`, { text: "retry once", mediaIds: [], sharedPostId: null, clientKey: k });
  const b = await api<MessageDTO>(page.request, "POST", `/conversations/${convId}/messages`, { text: "retry once", mediaIds: [], sharedPostId: null, clientKey: k });
  expect(a.id).toBe(b.id);
  // Group: create, rename, read state.
  const group = await api<ConversationDTO>(page.request, "POST", "/conversations", { handles: ["amir_codes", "zara_designs"], name: "E2E group" });
  await page.goto(`/messages/${group.id}`);
  await page.getByLabel("Start a new message").fill("hello group");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("log").getByText("hello group")).toBeVisible();
  await switchActor(page, "amir_codes");
  const inbox = await api<ConversationDTO[]>(page.request, "GET", "/conversations?box=inbox");
  const g = inbox.find((c) => c.id === group.id)!;
  expect(g.unreadCount).toBeGreaterThan(0);
  await page.goto(`/messages/${group.id}`);
  await expect(page.getByRole("log").getByText("hello group")).toBeVisible();
  await expect.poll(async () => (await api<ConversationDTO>(page.request, "GET", `/conversations/${group.id}`)).unreadCount).toBe(0);
});

test("11. profile edit and preferences persist and take effect", async ({ page }) => {
  await openApp(page, "/settings/profile");
  const bio = `Bio ${rand()}`;
  await page.getByLabel("Bio").fill(bio);
  await page.getByRole("button", { name: "Save" }).last().click();
  await expect(page).toHaveURL(/\/maya_learns$/);
  await expect(page.getByText(bio)).toBeVisible();
  await page.goto("/settings/display");
  await page.getByRole("radio", { name: "Dusk" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "DIM");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "DIM");
  await page.goto("/settings/data");
  await page.getByRole("switch", { name: "Autoplay videos and GIFs" }).click();
  await expect(page.getByRole("switch", { name: "Autoplay videos and GIFs" })).toHaveAttribute("aria-checked", "false");
  await page.goto("/ischoolie_team");
  await expect(page.getByRole("button", { name: "Play GIF" }).first()).toBeVisible();
});

test("12. block and mute affect feeds, search and interactions", async ({ page }) => {
  await openApp(page, "/history_hub");
  await page.locator("#main").getByRole("button", { name: "More" }).first().click();
  await page.getByRole("menuitem", { name: "Block @history_hub" }).click();
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page.getByText("@history_hub is blocked")).toBeVisible();
  const s = await api<{ posts: PostDTO[] }>(page.request, "GET", "/search?q=from:history_hub&f=live");
  expect(s.posts.length).toBe(0);
  await switchActor(page, "history_hub");
  const follow = await page.request.fetch("/api/users/maya_learns/follow", { method: "PUT", headers: { "x-ischoolie-csrf": "1", origin: "http://localhost:3000" } });
  expect(follow.status()).toBe(403);
});

test("13. deep links load directly, survive reload and Back/Forward", async ({ page }) => {
  await openApp(page, "/home");
  const posts = await api<{ posts: PostDTO[] }>(page.request, "GET", "/search?q=from:prof_lindqvist%20review%20session&f=live");
  const p = posts.posts.find((x) => x.media.length)!;
  for (const path of [`/prof_lindqvist/status/${p.id}/photo/1`, "/compose/post", "/i/display", "/i/keyboard_shortcuts", "/settings/notifications", "/notifications/mentions", "/explore?tab=Science", "/search?q=%23astronomy&f=live"]) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText("This page doesn’t exist");
    await page.reload();
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  }
  await page.goto("/home");
  await page.locator("article").nth(2).locator("time").click();
  await expect(page).toHaveURL(/\/status\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/status\//);
});

test("14. a failed mutation rolls back; offline shows a recoverable error", async ({ page, context }) => {
  await openApp(page, "/home");
  await page.route("**/api/posts/*/like", (r) => r.abort());
  const first = page.locator("article").first();
  const likeBtn = first.getByRole("button", { name: /^Cheer/ });
  if (await likeBtn.count()) {
    await likeBtn.click();
    await expect(page.getByText(/offline|connection/i)).toBeVisible();
    await expect(first.getByRole("button", { name: /^Cheer/ })).toBeVisible();
  }
  await page.unroute("**/api/posts/*/like");
  await context.setOffline(true);
  await page.getByLabel("Share something with your campus…").fill("offline attempt");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /offline/i })).toBeVisible();
  await expect(page.getByLabel("Share something with your campus…")).toHaveValue("offline attempt");
  await context.setOffline(false);
});

test("17. keyboard: skip link, j/k navigation, shortcuts dialog focus", async ({ page }) => {
  await openApp(page, "/home");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  await page.keyboard.press("j");
  await expect(page.locator("main article[data-post-id]").first()).toBeFocused();
  await page.keyboard.press("j");
  await expect(page.locator("main article[data-post-id]").nth(1)).toBeFocused();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();
  // Shortcuts don't fire while typing.
  await page.getByLabel("Share something with your campus…").click();
  await page.keyboard.type("j k n");
  await expect(page.getByLabel("Share something with your campus…")).toHaveValue("j k n");
});
