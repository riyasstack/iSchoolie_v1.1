import { describe, expect, it } from "vitest";
import { extractEntities, matchesMutedPhrase, parsePostText, safeHref, textDirection, validateHandle, graphemeLength } from "@/lib/text";

describe("parsePostText (legacy weighted 280)", () => {
  it("counts plain Latin text by code point", () => {
    const p = parsePostText("a".repeat(280));
    expect(p.weightedLength).toBe(280);
    expect(p.valid).toBe(true);
    expect(parsePostText("a".repeat(281)).valid).toBe(false);
  });
  it("counts every URL as 23 regardless of length", () => {
    const url = "https://example.org/" + "x".repeat(200);
    expect(parsePostText(url).weightedLength).toBe(23);
  });
  it("weights emoji and CJK as 2 (not JS string length)", () => {
    const emoji = "👩‍👩‍👧‍👦"; // one grapheme, many UTF-16 units
    expect(emoji.length).toBeGreaterThan(2);
    expect(parsePostText(emoji).weightedLength).toBe(2);
    expect(parsePostText("日本語").weightedLength).toBe(6);
  });
  it("treats whitespace-only text as empty", () => {
    expect(parsePostText("   \n ").empty).toBe(true);
  });
});

describe("extractEntities", () => {
  it("links mentions, hashtags and safe URLs", () => {
    const e = extractEntities("Hi @maya_learns see #astronomy at https://example.org/a");
    expect(e.map((x) => x.type)).toEqual(["text", "mention", "text", "hashtag", "text", "url"]);
    const url = e.find((x) => x.type === "url");
    expect(url && "href" in url && url.href).toBe("https://example.org/a");
  });
  it("never produces javascript: links", () => {
    const e = extractEntities("javascript:alert(1) click");
    expect(e.some((x) => x.type === "url")).toBe(false);
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
  });
  it("preserves text exactly (round trip)", () => {
    const t = "Line 1\nLine 2 @a_b #tag 👩‍👩‍👧 done";
    expect(extractEntities(t).map((x) => x.text).join("")).toBe(t);
  });
});

describe("handles", () => {
  it("rejects reserved route names and bad shapes", () => {
    expect(validateHandle("settings")).toMatch(/reserved/);
    expect(validateHandle("explore")).toMatch(/reserved/);
    expect(validateHandle("ab")).toBeTruthy();
    expect(validateHandle("has space")).toBeTruthy();
    expect(validateHandle("maya_learns")).toBeNull();
  });
});

describe("muted phrases", () => {
  it("matches whole words case-insensitively", () => {
    expect(matchesMutedPhrase("big spoiler here", "spoiler")).toBe(true);
    expect(matchesMutedPhrase("spoilers galore", "spoiler")).toBe(false);
    expect(matchesMutedPhrase("love #astronomy!", "#astronomy")).toBe(true);
  });
});

describe("direction and graphemes", () => {
  it("detects RTL text", () => {
    expect(textDirection("مرحبا بالعالم")).toBe("rtl");
    expect(textDirection("Hello")).toBe("ltr");
  });
  it("counts graphemes for profile fields", () => {
    expect(graphemeLength("👩‍👩‍👧‍👦a")).toBe(2);
  });
});
