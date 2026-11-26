/**
 * Central visibility and interaction policy. Pure functions over a ViewerGraph so
 * every surface (feeds, search, detail, quotes, media, lists, moments, APIs)
 * applies the same rules, and so they can be unit tested.
 *
 * Blocking (documented policy):
 *  - Neither party sees the other's posts in feeds, search, notifications, lists or moments.
 *  - Direct URLs show an "unavailable" state. The blocked person cannot follow,
 *    reply to, quote, like, repost, message, or add the blocker to lists.
 *  - Blocking removes follow relationships in both directions.
 * Muting (documented policy):
 *  - Only filters the muter's own experience: Home/Latest, notifications, search
 *    results and conversation replies collapse. Direct URLs and the muted person's
 *    profile still work. The muted account is unaffected and is not told.
 * Protected accounts:
 *  - Posts, media, likes tab, follower/following lists and engagement lists are
 *    visible only to the account itself and its approved followers.
 */
export interface ViewerGraph {
  id: string;
  following: Set<string>;
  followers: Set<string>;
  blocking: Set<string>;
  blockedBy: Set<string>;
  muting: Set<string>;
  requested: Set<string>;
  mutedWords: { phraseLower: string; inHome: boolean; inNotifications: boolean }[];
  topicIds: Set<string>;
}

export interface AuthorLike {
  id: string;
  isProtected: boolean;
  suspended: boolean;
}

export type Access = "ok" | "protected" | "blocked" | "blocked_by" | "suspended";

export function authorAccess(v: ViewerGraph, author: AuthorLike): Access {
  if (author.id === v.id) return "ok";
  if (author.suspended) return "suspended";
  if (v.blockedBy.has(author.id)) return "blocked_by";
  if (v.blocking.has(author.id)) return "blocked";
  if (author.isProtected && !v.following.has(author.id)) return "protected";
  return "ok";
}

export interface PostLike {
  id: string;
  authorId: string;
  deletedAt: Date | null;
  author: AuthorLike;
}

export type PostAccess = Access | "deleted";

export function postAccess(v: ViewerGraph, post: PostLike): PostAccess {
  if (post.deletedAt) return "deleted";
  return authorAccess(v, post.author);
}

/** Whether a post should be filtered from the viewer's feeds (Home, Latest, lists, topics). */
export function filteredFromFeeds(v: ViewerGraph, post: { authorId: string; textLower: string }): boolean {
  if (post.authorId === v.id) return false;
  if (v.muting.has(post.authorId)) return true;
  return v.mutedWords.some((w) => w.inHome && matches(post.textLower, w.phraseLower));
}

export function filteredFromNotifications(v: ViewerGraph, actorId: string, textLower: string | null): boolean {
  if (v.muting.has(actorId) || v.blocking.has(actorId) || v.blockedBy.has(actorId)) return true;
  if (!textLower) return false;
  return v.mutedWords.some((w) => w.inNotifications && matches(textLower, w.phraseLower));
}

function matches(textLower: string, phraseLower: string): boolean {
  if (phraseLower.startsWith("#") || phraseLower.startsWith("@")) return textLower.includes(phraseLower);
  const escaped = phraseLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "u").test(textLower);
}

export interface RootLike {
  authorId: string;
  replyAudience: "EVERYONE" | "FOLLOWING" | "MENTIONED";
  mentionIds: string[];
  /** Ids the root author follows. */
  authorFollowing?: Set<string>;
}

/**
 * Reply eligibility, evaluated against the conversation root's audience setting
 * (the August 2020 conversation settings):
 *  EVERYONE  — anyone who can see the post.
 *  FOLLOWING — people the root author follows, plus people mentioned.
 *  MENTIONED — only people mentioned in the root post.
 * The root author can always reply in their own conversation.
 */
export function replyEligibility(v: ViewerGraph, root: RootLike, rootAuthor: AuthorLike): { ok: boolean; reason: string | null } {
  const access = authorAccess(v, rootAuthor);
  if (access !== "ok") return { ok: false, reason: "You can’t reply to this conversation." };
  if (root.authorId === v.id) return { ok: true, reason: null };
  if (root.replyAudience === "EVERYONE") return { ok: true, reason: null };
  const mentioned = root.mentionIds.includes(v.id);
  if (root.replyAudience === "MENTIONED") {
    return mentioned ? { ok: true, reason: null } : { ok: false, reason: "Only people mentioned can reply." };
  }
  // FOLLOWING: does the root author follow the viewer? (v.followers = people who follow the viewer)
  const authorFollowsViewer = root.authorFollowing ? root.authorFollowing.has(v.id) : v.followers.has(root.authorId);
  return authorFollowsViewer || mentioned
    ? { ok: true, reason: null }
    : { ok: false, reason: "Only people the author follows can reply." };
}

/** Whether the viewer may interact (like/repost/quote/bookmark) with an author's post. */
export function canInteract(v: ViewerGraph, author: AuthorLike): boolean {
  return authorAccess(v, author) === "ok";
}

/** Profile-level content gate (posts, media, likes, connections). */
export function canViewProfileContent(v: ViewerGraph, author: AuthorLike): boolean {
  return authorAccess(v, author) === "ok";
}

/** Protected posts cannot be reposted by anyone, including their author (legacy rule). */
export function canRepost(v: ViewerGraph, author: AuthorLike): boolean {
  return canInteract(v, author) && !author.isProtected;
}
