import { describe, expect, it } from "vitest";
import { buildQueryFromAdvanced, parseSearchQuery } from "@/lib/search-query";
import { utcToZoned, zonedToUtc, relativeTime, compactCount } from "@/lib/format";

describe("search query language", () => {
  it("parses operators", () => {
    const q = parseSearchQuery('robot "exact phrase" -noise #astronomy from:maya_learns to:prof @sam since:2026-01-01 until:2026-02-01 filter:images -filter:replies min_faves:3 lang:es cats OR dogs');
    expect(q.all).toContain("robot");
    expect(q.phrases).toEqual(["exact phrase"]);
    expect(q.none).toEqual(["noise"]);
    expect(q.hashtags).toEqual(["astronomy"]);
    expect(q.from).toEqual(["maya_learns"]);
    expect(q.to).toEqual(["prof"]);
    expect(q.mentions).toEqual(["sam"]);
    expect(q.since).toBe("2026-01-01");
    expect(q.until).toBe("2026-02-01");
    expect(q.filters.has("images")).toBe(true);
    expect(q.excludeReplies).toBe(true);
    expect(q.minFaves).toBe(3);
    expect(q.lang).toBe("es");
    expect(q.any).toEqual(["cats", "dogs"]);
  });
  it("builds a query from advanced fields that parses back", () => {
    const s = buildQueryFromAdvanced({ allWords: "a b", phrase: "c d", anyWords: "x y", noneWords: "z", hashtags: "tag", from: "@u1", to: "", mentioning: "u2", since: "2026-01-01", until: "", minFaves: "2", minReplies: "", minReposts: "", replies: "exclude", links: true, media: "videos", lang: "fr" });
    const q = parseSearchQuery(s);
    expect(q.all).toEqual(["a", "b"]);
    expect(q.phrases).toEqual(["c d"]);
    expect(q.any).toEqual(["x", "y"]);
    expect(q.none).toEqual(["z"]);
    expect(q.from).toEqual(["u1"]);
    expect(q.mentions).toEqual(["u2"]);
    expect(q.filters.has("links") && q.filters.has("videos")).toBe(true);
    expect(q.excludeReplies).toBe(true);
    expect(q.lang).toBe("fr");
  });
});

describe("time zones for scheduling", () => {
  it("converts wall-clock time in a zone to UTC across DST", () => {
    expect(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "Asia/Kolkata").toISOString()).toBe("2026-12-01T03:30:00.000Z");
  });
  it("round-trips UTC to zoned parts", () => {
    expect(utcToZoned("2026-07-01T13:00:00.000Z", "America/New_York")).toEqual({ date: "2026-07-01", time: "09:00" });
  });
  it("formats relative times and counts", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(relativeTime("2026-11-24T11:59:30Z", now)).toBe("30s");
    expect(relativeTime("2026-11-24T10:00:00Z", now)).toBe("2h");
    expect(compactCount(1234)).toBe("1.2K");
    expect(compactCount(999)).toBe("999");
  });
});
