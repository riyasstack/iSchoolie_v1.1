/**
 * Live mode (APP_MODE=live, Supabase Auth) as a signed-out guest: read-only browsing,
 * sign-up prompts on every action, private pages behind sign-in, and the sign-in/sign-up
 * pages themselves. No real Supabase accounts are created here.
 */
import { expect, test } from "@playwright/test";

test.describe("live mode — guest", () => {
  test("home shows the public feed with sign-up prompts instead of actions", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("article").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("guest-bar")).toBeVisible();
    await expect(page.getByTestId("guest-composer")).toBeVisible();
    // No account-only navigation for guests.
    await expect(page.getByRole("link", { name: "Notifications" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Messages" })).toHaveCount(0);

    const firstPost = page.getByRole("article").first();
    for (const name of [/^Like/, /^Reply/, /^Repost/]) {
      await firstPost.getByRole("button", { name }).first().click();
      const prompt = page.getByTestId("signup-prompt");
      await expect(prompt).toBeVisible();
      await expect(prompt.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", /^\/signup/);
      await page.keyboard.press("Escape");
      await expect(prompt).toHaveCount(0);
    }
    // Nothing navigated away and the like wasn't applied.
    await expect(page).toHaveURL(/\/home$/);
  });

  test("search works for guests", async ({ page }) => {
    await page.goto("/search?q=design");
    await expect(page.getByRole("article").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("signup-prompt")).toHaveCount(0);
  });

  test("profiles and posts are readable; follow asks to sign up", async ({ page }) => {
    await page.goto("/maya_learns");
    await expect(page.getByRole("heading", { name: "Maya Okafor" }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^Follow/ }).first().click();
    await expect(page.getByTestId("signup-prompt")).toContainText("follow @maya_learns");
  });

  test("private pages redirect to sign in and come back after", async ({ page }) => {
    for (const path of ["/messages", "/notifications", "/i/bookmarks", "/settings/account", "/compose/post"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/signin\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
    await expect(page.getByRole("heading", { name: "Log in to iSchoolie" })).toBeVisible();
  });

  test("the API refuses guest writes and private reads", async ({ request }) => {
    const home = await request.get("/api/timeline/home");
    expect(home.ok()).toBe(true);
    const { data } = await home.json();
    const id = data.posts[0].id as string;
    const like = await request.put(`/api/posts/${id}/like`, { headers: { "x-ischoolie-csrf": "1", origin: "http://localhost:3001" } });
    expect(like.status()).toBe(401);
    expect((await like.json()).error.code).toBe("SIGN_UP_REQUIRED");
    expect((await request.get("/api/conversations")).status()).toBe(401);
    expect((await request.get("/api/notifications")).status()).toBe(401);
  });

  test("sign-in and sign-up pages offer email, Google and GitHub", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "Log in to iSchoolie" })).toBeVisible();
    await expect(page.locator('[data-provider="google"]')).toContainText("Google");
    await expect(page.locator('[data-provider="github"]')).toContainText("GitHub");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter your email and password");

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("What’s your name?");
    await page.getByLabel("Name").fill("Test");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("valid email");

    await page.goto("/auth/forgot");
    await expect(page.getByRole("heading", { name: "Find your iSchoolie account" })).toBeVisible();
  });

  test("onboarding requires a signed-in account", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/signin\?next=%2Fonboarding/);
  });

  test("auth callback without a code fails safely", async ({ page }) => {
    await page.goto("/auth/callback?next=https://evil.example");
    await expect(page).toHaveURL(/\/signin\?error=missing_code/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("incomplete");
  });
});
