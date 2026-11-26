import { test, expect } from "@playwright/test";
import { api, openApp, rand, switchActor } from "./fixtures";
import type { PostDTO } from "../../src/lib/types";

async function findPost(page: import("@playwright/test").Page, q: string) {
  const r = await api<{ posts: PostDTO[] }>(page.request, "GET", `/search?q=${encodeURIComponent(q)}&f=live`);
  return r.posts[0];
}

test("engagement pages, hidden replies link and post activity dialog", async ({ page }) => {
  await openApp(page, "/home");
  const p = await findPost(page, "from:prof_lindqvist orbits");
  await page.goto(`/prof_lindqvist/status/${p.id}`);
  await page.getByRole("link", { name: /Likes?$/ }).first().click();
  await expect(page).toHaveURL(/\/likes$/);
  await expect(page.getByRole("heading", { name: "Liked by" })).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: /profile$/ }).first()).toBeVisible();
  await page.getByRole("link", { name: "Quote Posts" }).click();
  await expect(page.locator("article").first()).toBeVisible();
  // Hidden replies view from the seeded hidden reply on Maya's post.
  const own = await findPost(page, "from:maya_learns study group members");
  await page.goto(`/maya_learns/status/${own.id}`);
  await page.getByRole("link", { name: /View hidden replies/ }).click();
  // Larry is muted by Maya, so his hidden reply is collapsed until she chooses to view it.
  await expect(page.getByText("This post is from an account you muted.")).toBeVisible();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(page.getByText("CALC IS USELESS")).toBeVisible();
  // Owner-only activity dialog.
  await page.goto(`/maya_learns/status/${own.id}`);
  await page.locator(`article[data-post-id="${own.id}"]`).getByRole("button", { name: "View post activity" }).click();
  await expect(page.getByRole("dialog", { name: "Post activity" })).toContainText("Impressions are not tracked");
});

test("delete own post with confirmation; report another post and get a truthful receipt", async ({ page }) => {
  await openApp(page, "/home");
  const text = `Delete me ${rand()}`;
  const [created] = await api<PostDTO[]>(page.request, "POST", "/posts", { items: [{ text, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: `k${rand()}${rand()}` });
  await page.goto(`/maya_learns/status/${created.id}`);
  await page.locator(`article[data-post-id="${created.id}"]`).getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Your post was deleted")).toBeVisible();
  const gone = await api<{ unavailable?: string }>(page.request, "GET", `/posts/${created.id}`);
  expect(gone.unavailable).toBe("deleted");

  // (Muted accounts are excluded from search, so report a post from an account Maya doesn't mute.)
  const other = await findPost(page, "from:theo_math intimidation");
  await page.goto(`/theo_math/status/${other.id}`);
  await page.locator(`article[data-post-id="${other.id}"]`).getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Report Post" }).click();
  await page.getByText("It’s suspicious or spam").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/Anything else we should know/).fill("Testing the report flow");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("dialog")).toContainText("received but not reviewed, and no action has been taken");
  const reports = await api<{ id: string }[]>(page.request, "GET", "/me/reports");
  expect(reports.length).toBeGreaterThan(0);
});

test("mute a conversation and add an author to a list from the post menu", async ({ page }) => {
  await openApp(page, "/home");
  const p = await findPost(page, "from:zara_designs accessibility reminder");
  await page.goto(`/zara_designs/status/${p.id}`);
  const card = page.locator(`article[data-post-id="${p.id}"]`).first();
  await card.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Mute this conversation" }).click();
  await expect(page.getByText(/won’t get notifications from this conversation/)).toBeVisible();
  expect((await api<PostDTO>(page.request, "GET", `/posts/${p.id}`)).viewer.conversationMuted).toBe(true);
  await card.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Add\/remove @zara_designs from Lists/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pick a List" });
  await dialog.getByRole("button", { name: /Science teachers/ }).click();
  await expect(dialog.getByRole("button", { name: /Science teachers/ })).toHaveAttribute("aria-pressed", "true");
});

test("share a post by direct message", async ({ page }) => {
  await openApp(page, "/home");
  const p = await findPost(page, "from:campus_news library hours");
  await page.goto(`/campus_news/status/${p.id}`);
  await page.locator(`article[data-post-id="${p.id}"]`).first().getByRole("button", { name: "Share post" }).click();
  await page.getByRole("menuitem", { name: "Send via Direct Message" }).click();
  const dialog = page.getByRole("dialog", { name: "Send Post" });
  await dialog.getByRole("button", { name: /Dr\. Astrid Lindqvist/ }).click();
  await dialog.getByLabel("Add a comment").fill("Look at this");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Your post was sent")).toBeVisible();
  await page.getByRole("link", { name: "View" }).click();
  await expect(page.getByRole("log").getByText("Look at this")).toBeVisible();
  await expect(page.getByRole("log").getByText(/Library hours extended/)).toBeVisible();
});

test("composer: GIF picker, poll editor rules, and schedule picker", async ({ page }) => {
  await openApp(page, "/compose/post");
  await page.getByRole("button", { name: "GIF" }).click();
  await page.getByRole("button", { name: "Choose GIF: Great job!" }).click();
  await expect(page.locator("img[alt*='Great job']")).toBeVisible();
  // Poll can't be added while media is attached.
  await expect(page.getByRole("button", { name: /^Poll/ })).toBeDisabled();
  await page.getByRole("button", { name: "Remove media", exact: true }).click();
  await page.getByRole("button", { name: "Poll" }).click();
  await page.getByLabel("What’s happening?").fill(`Poll ${rand()}?`);
  await page.getByLabel(/Choice 1/).fill("Yes");
  await page.getByLabel(/Choice 2/).fill("Yes");
  await expect(page.getByText("Poll choices must be different.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
  await page.getByLabel(/Choice 2/).fill("No");
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeEnabled();
  // Schedule picker validates future times and shows the zone.
  await page.getByRole("button", { name: "Schedule" }).click();
  const dlg = page.getByRole("dialog", { name: "Schedule" });
  await dlg.getByLabel("Date").fill("2020-01-01");
  await expect(dlg.getByText("Choose a time at least 1 minute in the future.")).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Confirm" })).toBeDisabled();
  const d = new Date(Date.now() + 2 * 86400_000);
  await dlg.getByLabel("Date").fill(d.toISOString().slice(0, 10));
  await dlg.getByLabel("Time zone").selectOption("Asia/Tokyo");
  await expect(dlg.getByText(/Will send on .*GMT\+9|JST/)).toBeVisible();
  await dlg.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).last().click();
  await expect(page.getByText(/Your post will be sent/)).toBeVisible();
  await page.goto("/compose/scheduled");
  await expect(page.getByText(/Will send on/).first()).toBeVisible();
});

test("message reactions, delete-for-me, conversation info rename and snooze", async ({ page }) => {
  await openApp(page, "/messages");
  await page.locator('section[aria-label="Conversations"]').getByRole("link", { name: /Bolt build team/ }).click();
  const log = page.getByRole("log");
  const bubble = log.getByText("He looks so proud");
  await bubble.hover();
  await log.getByRole("button", { name: "React to message" }).last().click();
  await page.getByRole("button", { name: "React with 🔥" }).click();
  await expect(log.getByRole("button", { name: /🔥 reaction/ })).toBeVisible();
  await page.goto(page.url() + "/info");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Group name").fill("Bolt crew");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Bolt crew")).toBeVisible();
  await page.getByRole("switch", { name: /Snooze notifications/ }).click();
  await expect(page.getByRole("switch", { name: /Snooze notifications/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(log.getByText(/renamed the group to “Bolt crew”/)).toBeVisible();
  // Delete-for-me.
  const target = log.getByText("Blue and white! Matches Bolt.");
  await target.hover();
  const row = log.locator("div.group", { hasText: "Blue and white! Matches Bolt." });
  await row.getByRole("button", { name: "More message actions" }).click();
  await page.getByRole("menuitem", { name: "Delete for you" }).click();
  await page.getByRole("button", { name: "Delete for me" }).click();
  await expect(log.getByText("Blue and white! Matches Bolt.")).toBeHidden();
});

test("topics follow/unfollow, connect page, and the new-posts pill", async ({ page }) => {
  await openApp(page, "/i/topics");
  const chess = page.getByRole("button", { name: "Follow topic Chess" });
  await chess.click();
  await expect.poll(async () => (await api<{ followed: { slug: string }[] }>(page.request, "GET", "/topics")).followed.some((t) => t.slug === "chess")).toBe(true);
  await page.goto("/i/connect");
  await expect(page.locator("#main").getByRole("button", { name: "Follow" }).first()).toBeVisible();
  // Pill: another seeded account posts while Home is open.
  await page.goto("/home");
  await expect(page.locator("main article").first()).toBeVisible();
  await switchActorInBackground(page);
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: /Show \d+ new post/ })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /Show \d+ new post/ }).click();
  await expect(page.locator("main article", { hasText: "Pill check" }).first()).toBeVisible();
});

/** Posts as a followed account through a second session-less path: switch, post, switch back via API. */
async function switchActorInBackground(page: import("@playwright/test").Page) {
  await api(page.request, "POST", "/session/actor", { handle: "stargazer_sam" });
  await api(page.request, "POST", "/posts", { items: [{ text: `Pill check ${rand()}`, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: `k${rand()}${rand()}` });
  await api(page.request, "POST", "/session/actor", { handle: "maya_learns" });
}

test("sensitive media warning respects the setting", async ({ page }) => {
  await openApp(page, "/chem_with_ana/media");
  await expect(page.getByText("The following media includes potentially sensitive content.").first()).toBeVisible();
  await page.goto("/settings/privacy_and_safety");
  await page.getByRole("switch", { name: /Display media that may contain sensitive content/ }).click();
  await page.goto("/chem_with_ana/media");
  await expect(page.locator("main article").first()).toBeVisible();
  await expect(page.getByText("The following media includes potentially sensitive content.")).toHaveCount(0);
  void switchActor;
});

test("copy link writes the canonical post URL; native share passes it to the OS share sheet", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" });
  // Headless desktop Chromium has no navigator.share; install a recording stub before load.
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: unknown) => {
        (window as unknown as { __shared: unknown[] }).__shared.push(data);
        return Promise.resolve();
      },
    });
  });
  await openApp(page, "/home");
  const p = await findPost(page, "from:prof_lindqvist orbits");
  await page.goto(`/prof_lindqvist/status/${p.id}`);
  const card = page.locator(`article[data-post-id="${p.id}"]`).first();
  await card.getByRole("button", { name: "Share post" }).click();
  await page.getByRole("menuitem", { name: "Copy link to Post" }).click();
  await expect(page.getByText("Copied to clipboard")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3000/prof_lindqvist/status/${p.id}`);
  await card.getByRole("button", { name: "Share post" }).click();
  await page.getByRole("menuitem", { name: "Share Post via…" }).click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { url: string }[] }).__shared);
  expect(shared[0].url).toBe(`http://localhost:3000/prof_lindqvist/status/${p.id}`);
});

test("realtime: a message sent elsewhere appears without waiting for the fallback poll", async ({ page }) => {
  const { execFileSync } = await import("node:child_process");
  await openApp(page, "/messages");
  const session = await api<{ workspace: { id: string } }>(page.request, "GET", "/session");
  const inbox = await api<{ id: string; name: string | null; participants: { handle: string }[] }[]>(page.request, "GET", "/conversations?box=inbox");
  const conv = inbox.find((c) => c.participants.some((p) => p.handle === "prof_lindqvist") && !c.name)!;
  await page.goto(`/messages/${conv.id}`);
  await expect(page.getByLabel("Start a new message")).toBeVisible();
  // Wait until the stream is connected (fallback polling is then 30 s).
  await expect(page.locator("html")).toHaveAttribute("data-realtime", "connected");
  const text = `Realtime ${rand()}`;
  const started = Date.now();
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/e2e/helpers/send-as.ts", session.workspace.id, conv.id, "prof_lindqvist", text], { stdio: "inherit" });
  await expect(page.getByRole("log").getByText(text)).toBeVisible({ timeout: 8_000 });
  const ms = Date.now() - started;
  test.info().annotations.push({ type: "realtime-latency-ms", description: String(ms) });
  expect(ms).toBeLessThan(10_000);
});

test("video upload captures a poster frame in the browser", async ({ page }) => {
  const { readFileSync } = await import("node:fs");
  await openApp(page, "/compose/post");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "orbit.webm", mimeType: "video/webm", buffer: readFileSync("assets/seed/video/orbit.webm") });
  const text = `Video ${rand()}`;
  await page.getByLabel("What’s happening?").fill(text);
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText("Your post was sent.")).toBeVisible();
  await page.goto("/maya_learns/media");
  const video = page.locator("article", { hasText: text }).first().locator("video");
  await expect(video).toHaveAttribute("poster", /\/api\/media\/[a-z0-9]+\?v=thumb$/);
  const poster = await video.getAttribute("poster");
  const res = await page.request.get(poster!);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
});

test("emoji picker: full set with search, categories and recents", async ({ page }) => {
  await openApp(page, "/compose/post");
  await page.getByRole("button", { name: "Emoji" }).click();
  const picker = page.getByRole("dialog", { name: "Emoji picker" });
  await expect(picker.getByRole("tab", { name: "Flags" })).toBeVisible();
  await picker.getByRole("tab", { name: "Food" }).click();
  await expect(picker.getByRole("button", { name: /Insert .*pizza/i })).toBeVisible();
  await picker.getByLabel("Search emoji").fill("rocket");
  await picker.getByRole("button", { name: "Insert rocket" }).click();
  await expect(page.getByLabel("What’s happening?")).toHaveValue("🚀");
  // Emoji count as 2 toward the legacy 280 limit.
  await page.getByLabel("What’s happening?").fill("🚀".repeat(140));
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeEnabled();
  await page.getByLabel("What’s happening?").fill("🚀".repeat(141));
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
  // Recently used shows up first next time.
  await page.getByRole("button", { name: "Emoji" }).click();
  await expect(page.getByRole("dialog", { name: "Emoji picker" }).getByRole("tab", { name: "Recent" })).toHaveAttribute("aria-selected", "true");
});

test("profile photo and header: pick, crop, upload, save, shown on the profile", async ({ page }) => {
  // Regression: the crop dialog's image URL was revoked by React Strict Mode's effect
  // re-run, so the image never loaded and Apply stayed disabled.
  const { PNG } = await import("./fixtures");
  await openApp(page, "/settings/profile");
  await expect(page.getByRole("heading", { name: "Edit profile" })).toBeVisible();
  const session = await api<{ actor: { handle: string } }>(page.request, "GET", "/session");

  for (const [index, kind] of [[0, "header"], [1, "avatar"]] as const) {
    await page.locator('input[type="file"]').nth(index).setInputFiles({ name: `${kind}.png`, mimeType: "image/png", buffer: PNG });
    const dialog = page.getByRole("dialog", { name: "Edit media" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(192);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(page.getByAltText("Header preview")).toHaveAttribute("src", /\/api\/media\//);
  await expect(page.getByAltText("Profile photo preview")).toHaveAttribute("src", /\/api\/media\//);
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Your profile was saved")).toBeVisible();

  const profile = await api<{ avatarUrl: string | null; bannerUrl: string | null }>(page.request, "GET", `/users/${session.actor.handle}`);
  expect(profile.avatarUrl).toMatch(/\/api\/media\//);
  expect(profile.bannerUrl).toMatch(/\/api\/media\//);
  const img = await page.request.get(profile.avatarUrl!);
  expect(img.ok()).toBe(true);
  expect(img.headers()["content-type"]).toMatch(/^image\//);
});
