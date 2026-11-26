import type { RequestContext } from "./context";

/** Members have full access; guests and onboarding viewers (live mode) are read-only. */
export function isMember(ctx: Pick<RequestContext, "viewer">): boolean {
  return !ctx.viewer || ctx.viewer === "member";
}
