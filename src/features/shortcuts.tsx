"use client";
/** Global keyboard shortcuts. Never fire while typing or with modifier keys. */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/providers";

export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  { group: "Actions", items: [["n", "New post"], ["l", "Like"], ["r", "Reply"], ["t", "Repost"], ["m", "Direct message"], ["/", "Search"], ["?", "This menu"]] },
  { group: "Navigation", items: [["j", "Next post"], ["k", "Previous post"], ["Enter", "Open post details"], ["Space", "Page down"], ["."," Load new posts"]] },
  {
    group: "Go to",
    items: [["g h", "Home"], ["g e", "Explore"], ["g n", "Notifications"], ["g r", "Mentions"], ["g p", "Profile"], ["g l", "Likes"], ["g i", "Lists"], ["g m", "Messages"], ["g s", "Settings"], ["g b", "Bookmarks"]],
  },
];

function typing(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || !!t.closest("[role=dialog] input, [role=dialog] textarea");
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const s = useSession();
  const pendingG = useRef(0);
  useEffect(() => {
    const posts = () => Array.from(document.querySelectorAll<HTMLElement>("main article[data-post-id]"));
    const current = () => {
      const a = document.activeElement as HTMLElement | null;
      return a?.closest<HTMLElement>("article[data-post-id]") ?? null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (document.querySelector("[role=dialog][data-state=open], [role=menu]")) return;
      const k = e.key;
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const map: Record<string, string> = {
          h: "/home",
          e: "/explore",
          n: "/notifications",
          r: "/notifications/mentions",
          p: `/${s.actor.handle}`,
          l: `/${s.actor.handle}/likes`,
          i: "/i/lists",
          m: "/messages",
          s: "/settings",
          b: "/i/bookmarks",
        };
        if (map[k]) {
          e.preventDefault();
          router.push(map[k]);
        }
        return;
      }
      if (k === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (k === "?") {
        e.preventDefault();
        router.push("/i/keyboard_shortcuts");
      } else if (k === "n") {
        e.preventDefault();
        router.push("/compose/post");
      } else if (k === "m") {
        e.preventDefault();
        router.push("/messages/compose");
      } else if (k === "/") {
        const input = document.querySelector<HTMLInputElement>("input[data-search-input]");
        if (input) {
          e.preventDefault();
          input.focus();
        } else {
          e.preventDefault();
          router.push("/explore");
        }
      } else if (k === "j" || k === "k") {
        const list = posts();
        if (!list.length) return;
        e.preventDefault();
        const cur = current();
        const idx = cur ? list.indexOf(cur) : -1;
        const next = list[Math.max(0, Math.min(list.length - 1, idx + (k === "j" ? 1 : -1)))] ?? list[0];
        next.focus();
        next.scrollIntoView({ block: "center" });
      } else if (k === "l" || k === "r" || k === "t") {
        const cur = current();
        if (!cur) return;
        const label = k === "l" ? /^(Like|Unlike)/ : k === "r" ? /^Reply/ : /^(Repost|Undo repost)/;
        const btn = Array.from(cur.querySelectorAll<HTMLButtonElement>("[role=group] button")).find((b) => label.test(b.getAttribute("aria-label") ?? ""));
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      } else if (k === ".") {
        const pill = document.querySelector<HTMLButtonElement>("button[data-new-posts]");
        if (pill) {
          e.preventDefault();
          pill.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, s.actor.handle]);
  return null;
}
