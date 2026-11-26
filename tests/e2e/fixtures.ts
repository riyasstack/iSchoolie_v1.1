import { readFileSync } from "node:fs";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Opens the app with no login (a demo workspace is provisioned on first visit) and waits for the shell. */
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  if (path === "/" || path.startsWith("/home")) await expect(page.getByRole("article").first()).toBeVisible({ timeout: 30_000 });
}

export async function api<T>(req: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await req.fetch(`/api${path}`, {
    method,
    headers: method === "GET" ? {} : { "x-ischoolie-csrf": "1", origin: "http://localhost:3000", "content-type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${JSON.stringify(json)}`);
  return json.data as T;
}

export async function switchActor(page: Page, handle: string) {
  await api(page.request, "POST", "/session/actor", { handle });
  await page.goto("/home");
  await expect(page.getByRole("article").first()).toBeVisible({ timeout: 30_000 });
}

export function rand() {
  return Math.random().toString(36).slice(2, 8);
}

/** A real PNG from the repo (192x192 app icon) for upload tests. */
export const PNG = readFileSync("public/brand/icon-192.png");
