/** Dedupe keys: one notification per (event, actor, target), so retries never duplicate. */
export const dedupeKeys = {
  like: (actor: string, post: string) => `like:${actor}:${post}`,
  repost: (actor: string, post: string) => `repost:${actor}:${post}`,
  reply: (post: string, recipient: string) => `reply:${post}:${recipient}`,
  mention: (post: string, recipient: string) => `mention:${post}:${recipient}`,
  quote: (post: string) => `quote:${post}`,
  follow: (actor: string, recipient: string) => `follow:${actor}:${recipient}`,
  followRequest: (actor: string, recipient: string) => `freq:${actor}:${recipient}`,
  followAccepted: (actor: string, recipient: string) => `facc:${actor}:${recipient}`,
  subscribed: (post: string, recipient: string) => `sub:${post}:${recipient}`,
};
