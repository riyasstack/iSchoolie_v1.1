import { describe, expect, it } from "vitest";
import { authorAccess, canRepost, filteredFromFeeds, filteredFromNotifications, postAccess, replyEligibility, type ViewerGraph } from "@/server/policy";

function graph(over: Partial<ViewerGraph> = {}): ViewerGraph {
  return {
    id: "me",
    following: new Set(),
    followers: new Set(),
    blocking: new Set(),
    blockedBy: new Set(),
    muting: new Set(),
    requested: new Set(),
    mutedWords: [],
    topicIds: new Set(),
    ...over,
  };
}
const author = (id: string, o: Partial<{ isProtected: boolean; suspended: boolean }> = {}) => ({ id, isProtected: false, suspended: false, ...o });

describe("authorAccess", () => {
  it("hides protected authors from non-followers only", () => {
    expect(authorAccess(graph(), author("p", { isProtected: true }))).toBe("protected");
    expect(authorAccess(graph({ following: new Set(["p"]) }), author("p", { isProtected: true }))).toBe("ok");
    expect(authorAccess(graph(), author("me", { isProtected: true }))).toBe("ok");
  });
  it("applies blocks in both directions and suspension", () => {
    expect(authorAccess(graph({ blocking: new Set(["x"]) }), author("x"))).toBe("blocked");
    expect(authorAccess(graph({ blockedBy: new Set(["x"]) }), author("x"))).toBe("blocked_by");
    expect(authorAccess(graph(), author("s", { suspended: true }))).toBe("suspended");
  });
  it("marks deleted posts", () => {
    expect(postAccess(graph(), { id: "1", authorId: "a", deletedAt: new Date(), author: author("a") })).toBe("deleted");
  });
});

describe("reply eligibility (Aug 2020 conversation settings)", () => {
  it("EVERYONE allows visible viewers", () => {
    expect(replyEligibility(graph(), { authorId: "a", replyAudience: "EVERYONE", mentionIds: [] }, author("a")).ok).toBe(true);
  });
  it("FOLLOWING allows people the author follows and mentioned people", () => {
    const root = { authorId: "a", replyAudience: "FOLLOWING" as const, mentionIds: [] };
    expect(replyEligibility(graph(), { ...root, authorFollowing: new Set() }, author("a")).ok).toBe(false);
    expect(replyEligibility(graph(), { ...root, authorFollowing: new Set(["me"]) }, author("a")).ok).toBe(true);
    expect(replyEligibility(graph(), { ...root, mentionIds: ["me"], authorFollowing: new Set() }, author("a")).ok).toBe(true);
  });
  it("MENTIONED allows only mentioned people (and the author)", () => {
    const root = { authorId: "a", replyAudience: "MENTIONED" as const, mentionIds: ["z"] };
    expect(replyEligibility(graph(), root, author("a")).ok).toBe(false);
    expect(replyEligibility(graph({ id: "z" }), root, author("a")).ok).toBe(true);
    expect(replyEligibility(graph({ id: "a" }), root, author("a")).ok).toBe(true);
  });
  it("blocked viewers can never reply", () => {
    expect(replyEligibility(graph({ blockedBy: new Set(["a"]) }), { authorId: "a", replyAudience: "EVERYONE", mentionIds: [] }, author("a")).ok).toBe(false);
  });
});

describe("feeds and notifications filters", () => {
  it("mutes accounts and muted words in feeds, never the viewer's own posts", () => {
    const g = graph({ muting: new Set(["m"]), mutedWords: [{ phraseLower: "spoiler", inHome: true, inNotifications: false }] });
    expect(filteredFromFeeds(g, { authorId: "m", textLower: "hello" })).toBe(true);
    expect(filteredFromFeeds(g, { authorId: "x", textLower: "a spoiler!" })).toBe(true);
    expect(filteredFromFeeds(g, { authorId: "me", textLower: "a spoiler!" })).toBe(false);
    expect(filteredFromNotifications(g, "x", "a spoiler!")).toBe(false);
  });
  it("protected posts can't be reposted", () => {
    expect(canRepost(graph({ following: new Set(["p"]) }), author("p", { isProtected: true }))).toBe(false);
    expect(canRepost(graph(), author("q"))).toBe(true);
  });
});
