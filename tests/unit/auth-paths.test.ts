import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/supabase/config";
import { isPrivatePath } from "@/proxy";

describe("post-auth redirects", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/messages")).toBe("/messages");
    expect(safeNext("/maya_learns/status/1?x=1")).toBe("/maya_learns/status/1?x=1");
    for (const bad of ["https://evil.example", "//evil.example", String.raw`/\evil.example`, "/api/session", "", null, undefined, "javascript:alert(1)"]) {
      expect(safeNext(bad as string)).toBe("/home");
    }
  });
});

describe("live-mode private pages", () => {
  it("sends guests to sign in only for account pages", () => {
    for (const p of ["/messages", "/messages/abc", "/notifications", "/i/bookmarks", "/settings/account", "/compose/post", "/i/lists/create", "/i/lists/abc/edit", "/onboarding"]) {
      expect(isPrivatePath(p)).toBe(true);
    }
    for (const p of ["/home", "/explore", "/search", "/maya_learns", "/maya_learns/status/1", "/i/topics", "/i/lists/abc", "/i/moments/abc", "/signin", "/help"]) {
      expect(isPrivatePath(p)).toBe(false);
    }
  });
});
