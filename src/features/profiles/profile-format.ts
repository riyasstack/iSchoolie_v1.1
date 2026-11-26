export { compactCount, joinedDate } from "@/lib/format";
import { displayUrl, safeHref } from "@/lib/text";

export function displayUrlSafe(url: string): string {
  const href = safeHref(url);
  return href ? displayUrl(href) : url;
}
