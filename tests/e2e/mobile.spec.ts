import { test, expect } from "@playwright/test";
import { openApp } from "./fixtures";

test("mobile: bottom nav, drawer, FAB composer, inbox → conversation and back", async ({ page }) => {
  await openApp(page, "/home");
  const nav = page.getByRole("navigation", { name: "Primary" }).last();
  await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Search and Explore" })).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Bookmarks" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Post" }).last().click();
  await expect(page).toHaveURL(/\/compose\/post$/);
  await expect(page.getByRole("dialog").getByLabel("What’s happening?")).toBeVisible();
  await page.goBack();
  await nav.getByRole("link", { name: "Messages" }).click();
  await expect(page).toHaveURL(/\/messages$/);
  await page.locator('section[aria-label="Conversations"]').getByRole("link", { name: /Dr\. Astrid Lindqvist/ }).first().click();
  await expect(page.getByLabel("Start a new message")).toBeVisible();
  const input = await page.getByLabel("Start a new message").boundingBox();
  const vh = page.viewportSize()!.height;
  expect(input!.y + input!.height).toBeLessThanOrEqual(vh);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/messages$/);
});
