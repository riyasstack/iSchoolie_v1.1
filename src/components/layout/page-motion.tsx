"use client";
/**
 * Page motion for the app shell:
 * - each page sits in a keyed <ViewTransition>, so going somewhere new slides or fades
 *   between pages (React drives the browser's View Transitions API; no support = instant);
 * - browser back/forward is rendered synchronously by the router so the browser can restore
 *   the scroll position; a view transition there would defer the DOM swap and break that,
 *   so those pages keep their boundary and ease in with a light animation instead;
 * - the direction (forward, back, tab switch) is written to <html data-nav> for the CSS;
 * - on phones the top bar and dock tuck away while scrolling down and return on the way up.
 */
import { useEffect, useLayoutEffect, useRef, useState, ViewTransition, type MouseEvent, type ReactNode } from "react";
import { PHONE_QUERY } from "@/components/ui/use-phone";

/** Routes that open as modals over the current page (intercepted routes). */
const MODAL_ROUTE = /^\/(compose\/post|i\/display|i\/keyboard_shortcuts)$|\/status\/[^/]+\/(photo|video)\/\d+$/;
/** A profile and its tabs count as one page (the tab bar animates instead). */
const PROFILE_TAB = /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|likes))?$/;
/** Top-level spaces: moving between them is a tab switch, not going deeper. */
const SPACES = new Set(["/home", "/explore", "/search", "/notifications", "/messages", "/i/bookmarks", "/i/lists", "/i/topics", "/i/moments", "/i/connect", "/settings"]);

type Traversal = "back" | "forward" | null;
type NavEntry = { key: string; index: number };
const navigationApi = () => (typeof window === "undefined" ? undefined : (window as unknown as { navigation?: { currentEntry: NavEntry | null } }).navigation);

/** The history entry the page on screen belongs to (updated after every commit). */
const committed = { key: null as string | null, index: -1 };
/** Fallback signals for browsers without the Navigation API. */
const legacy = { popAt: 0 };
let uaAnimated = false;
let generation = 0;
/** Last scroll position per address, so going back always lands where you left off. */
const positions = new Map<string, number>();
const here = () => window.location.pathname + window.location.search;

/**
 * Read during render: has the browser already moved to another history entry? Pushes only
 * write their entry while committing, so a changed entry here means back/forward.
 */
function traversalNow(): Traversal {
  const entry = navigationApi()?.currentEntry;
  if (entry && committed.key) return entry.key === committed.key ? null : entry.index < committed.index ? "back" : "forward";
  return Date.now() - legacy.popAt < 1500 ? "back" : null;
}

if (typeof window !== "undefined") {
  const api = (window as unknown as { navigation?: EventTarget }).navigation;
  // Swipe-back gestures already animate in the browser; don't add a second motion on top.
  api?.addEventListener("navigate", (e) => {
    uaAnimated = (e as Event & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
  });
  window.addEventListener("popstate", (e) => {
    legacy.popAt = Date.now();
    if (!api) uaAnimated = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
  });
  // Leaving a page by tapping something: remember exactly where it was scrolled to.
  document.addEventListener("click", () => positions.set(here(), window.scrollY), true);
}

export function pageKeyFor(pathname: string): string | null {
  if (MODAL_ROUTE.test(pathname)) return null;
  if (pathname === "/") return "/home";
  if (pathname.startsWith("/messages")) return "/messages";
  if (pathname.startsWith("/settings")) return "/settings";
  if (pathname.startsWith("/notifications")) return "/notifications";
  const profile = PROFILE_TAB.exec(pathname);
  if (profile) return `/${profile[1].toLowerCase()}`;
  return pathname;
}

/** The current page's key; modal routes keep the key of the page underneath them. */
export function usePageKey(pathname: string): string {
  const [last, setLast] = useState(() => pageKeyFor(pathname) ?? pathname);
  const next = pageKeyFor(pathname);
  if (next !== null && next !== last) setLast(next);
  return next ?? last;
}

/**
 * Tags each page change with a direction for the transition CSS, restores scroll after
 * back/forward, and returns whether this render is a back/forward traversal.
 */
export function useNavDirection(pageKey: string): Traversal {
  const last = useRef(pageKey);
  const traversal = traversalNow();
  useEffect(() => {
    // Keep each address's scroll position current (only once its own page is on screen).
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!traversalNow()) positions.set(here(), window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  // Runs in the commit (inside a view transition's DOM update when there is one).
  useLayoutEffect(() => {
    if (last.current !== pageKey) {
      last.current = pageKey;
      const dir = traversal ? (uaAnimated ? "none" : traversal) : SPACES.has(pageKey) ? "tab" : "forward";
      document.documentElement.dataset.nav = dir;
      if (traversal) {
        // Normally the browser has restored the scroll already; if the page arrived late
        // (e.g. back pressed mid-transition), put it where the reader left it.
        const saved = positions.get(here());
        if (saved !== undefined && Math.abs(window.scrollY - saved) > 4) window.scrollTo(0, saved);
        if (dir !== "none") easeInPage(traversal);
      }
    }
    const entry = navigationApi()?.currentEntry;
    if (entry) {
      committed.key = entry.key;
      committed.index = entry.index;
    }
  });
  return traversal;
}

function easeInPage(direction: "back" | "forward") {
  const frame = document.querySelector<HTMLElement>("[data-page-frame]");
  if (!frame || typeof frame.animate !== "function") return;
  if (document.documentElement.dataset.reducedMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  frame.animate(
    [
      { opacity: 0.25, transform: `translateX(${direction === "back" ? -24 : 24}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

/** Phones: hide the top bar and dock while scrolling down, bring them back on the way up. */
export function useAutoHideChrome(pathname: string) {
  useEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia(PHONE_QUERY);
    let anchor = window.scrollY;
    let frame = 0;
    const set = (hidden: boolean) => {
      const value = hidden ? "hidden" : "shown";
      if (root.dataset.chrome !== value) root.dataset.chrome = value;
    };
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (!phone.matches || y < 64) {
        set(false);
        anchor = y;
        return;
      }
      const dy = y - anchor;
      if (dy > 14) {
        set(true);
        anchor = y;
      } else if (dy < -14) {
        set(false);
        anchor = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Keyboard users tabbing into hidden chrome get it back.
    const onFocus = (e: FocusEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.(".chrome-top,.chrome-bottom,.chrome-float")) set(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocus);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.chrome;
    };
  }, []);
  // Every new page starts with the chrome showing.
  useEffect(() => {
    document.documentElement.dataset.chrome = "shown";
  }, [pathname]);
}

/** Tapping the space you're already on glides back to the top, like a native tab bar. */
export function scrollTopIfCurrent(e: MouseEvent, href: string, pathname: string) {
  if (pathname !== href || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * The page itself. Going somewhere new re-keys the boundary, so the old page exits and the
 * new one enters as a view transition. Back/forward keeps the boundary (no re-key), which
 * keeps the router's synchronous render and the browser's scroll restoration intact.
 */
export function PageTransition({ pageKey, traversal, children }: { pageKey: string; traversal: Traversal; children: ReactNode }) {
  const [state, setState] = useState({ page: pageKey, key: pageKey });
  if (state.page !== pageKey) setState({ page: pageKey, key: traversal ? state.key : `${pageKey}~${++generation}` });
  return (
    <ViewTransition key={state.key} enter="page-in" exit="page-out" default="none">
      <div data-page-frame="" className="min-h-[calc(100dvh-var(--h-topbar))] bg-feed sm:min-h-0 sm:overflow-clip sm:rounded-[calc(var(--radius-card)-1px)]">
        {children}
      </div>
    </ViewTransition>
  );
}
