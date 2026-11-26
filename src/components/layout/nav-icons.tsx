/**
 * Navigation icons. Line icons at ~1.75 stroke to match the 2020 optical weight;
 * active destinations use a filled variant (where the shape allows) plus bold labels.
 */
import { Home, Hash, Bell, Mail, Bookmark, ScrollText, User, CircleEllipsis, Search, Settings, Zap, MessageSquareText, Feather, type LucideIcon } from "lucide-react";

export type NavKey = "home" | "explore" | "notifications" | "messages" | "bookmarks" | "lists" | "profile" | "more" | "search" | "settings" | "moments" | "topics";

const ICONS: Record<NavKey, LucideIcon> = {
  home: Home,
  explore: Hash,
  notifications: Bell,
  messages: Mail,
  bookmarks: Bookmark,
  lists: ScrollText,
  profile: User,
  more: CircleEllipsis,
  search: Search,
  settings: Settings,
  moments: Zap,
  topics: MessageSquareText,
};

const FILLABLE = new Set<NavKey>(["home", "notifications", "bookmarks", "profile", "messages"]);

export function NavIcon({ name, active, size = 26 }: { name: NavKey; active?: boolean; size?: number }) {
  const I = ICONS[name];
  return <I size={size} strokeWidth={active ? 2.4 : 1.75} fill={active && FILLABLE.has(name) ? "currentColor" : "none"} className={active && name === "messages" ? "[&>path]:stroke-[var(--bg)]" : undefined} aria-hidden="true" />;
}

export { Feather };
