/**
 * Campus Cards navigation icons: rounded line icons; the active space gets a heavier stroke
 * (its pill background and label carry the rest of the emphasis).
 */
import {
  LayoutDashboard, Compass, Bell, Inbox, BookMarked, Users, UserRound, CircleEllipsis, Search, Settings, BookOpen, Shapes, PenLine,
  type LucideIcon,
} from "lucide-react";

export type NavKey = "home" | "explore" | "notifications" | "messages" | "bookmarks" | "lists" | "profile" | "more" | "search" | "settings" | "moments" | "topics";

const ICONS: Record<NavKey, LucideIcon> = {
  home: LayoutDashboard,
  explore: Compass,
  notifications: Bell,
  messages: Inbox,
  bookmarks: BookMarked,
  lists: Users,
  profile: UserRound,
  more: CircleEllipsis,
  search: Search,
  settings: Settings,
  moments: BookOpen,
  topics: Shapes,
};

/** Display names for each space (iSchoolie's own vocabulary). */
export const SPACE_LABELS: Record<NavKey, string> = {
  home: "Feed",
  explore: "Discover",
  notifications: "Alerts",
  messages: "Inbox",
  bookmarks: "Saved",
  lists: "Circles",
  profile: "Profile",
  more: "More",
  search: "Search",
  settings: "Settings",
  moments: "Stories",
  topics: "Interests",
};

export function NavIcon({ name, active, size = 22 }: { name: NavKey; active?: boolean; size?: number }) {
  const I = ICONS[name];
  return <I size={size} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />;
}

/** Compose icon. */
export { PenLine as ComposeIcon };
