import { test, expect } from "@playwright/test";
import { api, openApp } from "./fixtures";
import type { ConversationDTO, PostDTO } from "../../src/lib/types";

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];

test("18. principal screens have no horizontal overflow at all target widths; capture screenshots", async ({ page }) => {
  test.setTimeout(300_000);
  await openApp(page, "/home");
  const post = (await api<{ posts: PostDTO[] }>(page.request, "GET", "/search?q=from:prof_lindqvist%20orbits&f=live")).posts[0];
  const conv = (await api<ConversationDTO[]>(page.request, "GET", "/conversations?box=inbox"))[0];
  const screens: [string, string][] = [
    ["home", "/home"],
    ["explore", "/explore"],
    ["post-detail", `/prof_lindqvist/status/${post.id}`],
    ["profile", "/maya_learns"],
    ["composer", "/compose/post"],
    ["notifications", "/notifications"],
    ["messages", `/messages/${conv.id}`],
    ["lists", "/i/lists"],
    ["bookmarks", "/i/bookmarks"],
    ["settings", "/settings/display"],
  ];
  const problems: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
    for (const [name, path] of screens) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${name}@${w}: overflow ${overflow}px`);
      if (w === 390 || w === 1280) await page.screenshot({ path: `docs/screenshots/${name}-${w}.png` });
    }
  }
  expect(problems).toEqual([]);
});
