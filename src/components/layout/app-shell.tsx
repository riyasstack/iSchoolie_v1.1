"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Dialog as R } from "radix-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search, X, MailPlus, Settings, HelpCircle, Paintbrush, Keyboard, UserCheck, Zap, ScrollText, MessageSquareText, Bookmark, User, Users, RotateCcw, FlaskConical, LogOut, LogIn } from "lucide-react";
import { useIsGuest, useRequireAccount, useReturnTo, useSession } from "@/components/providers";
import { Avatar, DisplayName, Menu, MenuItem } from "@/components/ui/misc";
import { NavIcon, Feather, type NavKey } from "./nav-icons";
import { get } from "@/lib/api";
import { compactCount } from "@/lib/format";
import { DialogsProvider } from "@/features/dialogs";
import { DemoControlsProvider, useDemoControls } from "@/features/demo-controls";
import { KeyboardShortcuts } from "@/features/shortcuts";
import { RealtimeBridge } from "@/features/realtime";
import { SearchBox } from "@/features/search/search-box";
import { FollowButton } from "@/features/profiles/people";
import type { ProfileDTO, TrendDTO, UserListItem } from "@/lib/types";

const DrawerCtx = createContext<() => void>(() => {});
export const useOpenDrawer = () => useContext(DrawerCtx);

function navActive(pathname: string, key: NavKey, handle: string): boolean {
  switch (key) {
    case "home":
      return pathname === "/home" || pathname === "/";
    case "explore":
      return pathname.startsWith("/explore") || pathname.startsWith("/search");
    case "notifications":
      return pathname.startsWith("/notifications");
    case "messages":
      return pathname.startsWith("/messages");
    case "bookmarks":
      return pathname.startsWith("/i/bookmarks");
    case "lists":
      return pathname.startsWith("/i/lists");
    case "profile":
      return pathname.toLowerCase() === `/${handle.toLowerCase()}` || pathname.toLowerCase().startsWith(`/${handle.toLowerCase()}/`) && !pathname.includes("/status/");
    default:
      return false;
  }
}

export function AppShell({ children, modal }: { children: ReactNode; modal?: ReactNode }) {
  const pathname = usePathname();
  const guest = useIsGuest();
  const [drawer, setDrawer] = useState(false);
  const wide = pathname.startsWith("/messages") || pathname.startsWith("/settings");
  const hideRail = wide || pathname.startsWith("/compose");
  const fab = /^\/(home|explore|notifications|search|i\/topics|i\/lists$|[^/]+$)/.test(pathname) && !pathname.startsWith("/settings") && pathname !== "/messages";
  const inConversation = /^\/messages\/[^/]+$/.test(pathname) && pathname !== "/messages/compose" && pathname !== "/messages/requests";
  return (
    <DemoControlsProvider>
      <DialogsProvider>
        <DrawerCtx.Provider value={() => setDrawer(true)}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-on">
            Skip to content
          </a>
          <div className="mx-auto flex min-h-dvh w-full justify-center sm:px-0">
            <LeftNav />
            <div className={clsx("flex min-w-0 flex-1 justify-between", wide ? "sm:max-w-[990px]" : hideRail ? "sm:max-w-[600px]" : "sm:max-w-[600px] md:max-w-[920px] lg:max-w-[990px]")}>
              <main id="main" className={clsx("min-h-dvh w-full min-w-0 border-line sm:border-x sm:pb-0", !inConversation && "pb-[calc(var(--h-bottom-nav)+env(safe-area-inset-bottom))]", guest && "!pb-[calc(var(--h-bottom-nav)+140px+env(safe-area-inset-bottom))] sm:!pb-[90px]", !wide && "sm:max-w-[600px] md:w-[600px] md:shrink-0")}>
                {children}
              </main>
              {!hideRail && <RightRail />}
            </div>
          </div>
          {fab && <MobileFab messages={false} />}
          {pathname === "/messages" && <MobileFab messages />}
          <BottomNav />
          <MobileDrawer open={drawer} onOpenChange={setDrawer} />
          <KeyboardShortcuts />
          {!guest && <RealtimeBridge />}
          {guest && <GuestBar />}
          {modal}
        </DrawerCtx.Provider>
      </DialogsProvider>
    </DemoControlsProvider>
  );
}

// -------------------------------------------------------------------- left nav
function LeftNav() {
  const s = useSession();
  const pathname = usePathname();
  const demo = useDemoControls();
  const guest = useIsGuest();
  const requireAccount = useRequireAccount();
  const all: { key: NavKey; label: string; href: string; badge?: number }[] = [
    { key: "home", label: "Home", href: "/home" },
    { key: "explore", label: "Explore", href: "/explore" },
    { key: "notifications", label: "Notifications", href: "/notifications", badge: s.badges.notifications },
    { key: "messages", label: "Messages", href: "/messages", badge: s.badges.messages },
    { key: "bookmarks", label: "Bookmarks", href: "/i/bookmarks" },
    { key: "lists", label: "Lists", href: "/i/lists" },
    { key: "profile", label: "Profile", href: `/${s.actor.handle}` },
  ];
  // Guests browse public content only.
  const items = guest ? all.filter((it) => it.key === "home" || it.key === "explore") : all;
  return (
    <header className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col items-end sm:flex xl:w-[275px]" role="banner">
      <div className="flex h-full w-[88px] flex-col items-center overflow-y-auto px-2 no-scrollbar xl:w-[275px] xl:items-stretch xl:px-3">
        <Link href="/home" aria-label="iSchoolie home" className="my-1 flex h-[52px] w-[52px] items-center justify-center rounded-full hover:bg-accent-soft xl:h-[52px] xl:w-auto xl:justify-start xl:rounded-full xl:px-3">
          <img src="/brand/ischoolie-symbol.png" alt="iSchoolie" width={34} height={34} className="xl:hidden" />
          <img src="/brand/ischoolie-logo.png" alt="iSchoolie" width={136} height={30} className="brand-light hidden h-[30px] w-auto xl:block" />
          <img src="/brand/ischoolie-logo-on-dark.png" alt="iSchoolie" width={136} height={30} className="brand-dark hidden h-[30px] w-auto xl:block" />
        </Link>
        <nav aria-label="Primary" className="flex flex-col items-center xl:items-stretch">
          {items.map((it) => {
            const active = navActive(pathname, it.key, s.actor.handle);
            return (
              <Link key={it.key} href={it.href} aria-current={active ? "page" : undefined} aria-label={it.label} className="group py-[3px] outline-none">
                <span className={clsx("flex items-center gap-5 rounded-full p-3 transition-colors group-hover:bg-accent-soft group-hover:text-accent-text group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-accent-text xl:pr-6", active && "text-accent-text")}>
                  <span className="relative">
                    <NavIcon name={it.key} active={active} />
                    {!!it.badge && <Badge n={it.badge} />}
                  </span>
                  <span className={clsx("hidden text-nav xl:inline", active ? "font-bold" : "font-normal")}>{it.label}</span>
                </span>
              </Link>
            );
          })}
          <Menu
            align="start"
            label="More"
            trigger={
              <button type="button" aria-label="More" className="group py-[3px] text-left outline-none">
                <span className="flex items-center gap-5 rounded-full p-3 transition-colors group-hover:bg-accent-soft group-hover:text-accent-text group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-accent-text xl:pr-6">
                  <NavIcon name="more" />
                  <span className="hidden text-nav xl:inline">More</span>
                </span>
              </button>
            }
          >
            <MenuItem icon={<MessageSquareText />} href="/i/topics">Topics</MenuItem>
            <MenuItem icon={<Zap />} href="/i/moments">Moments</MenuItem>
            {!guest && <MenuItem icon={<UserCheck />} href="/i/follower_requests">Follower requests{s.badges.followRequests ? ` (${s.badges.followRequests})` : ""}</MenuItem>}
            {!guest && <MenuItem icon={<Users />} href="/i/connect">Connect</MenuItem>}
            {!guest && <MenuItem icon={<Settings />} href="/settings">Settings and privacy</MenuItem>}
            <MenuItem icon={<HelpCircle />} href="/help">Help Center</MenuItem>
            <MenuItem icon={<Paintbrush />} href="/i/display">Display</MenuItem>
            <MenuItem icon={<Keyboard />} href="/i/keyboard_shortcuts">Keyboard shortcuts</MenuItem>
            {s.capabilities.switchActor && <MenuItem icon={<FlaskConical />} onSelect={demo.openSwitcher}>Switch demo identity…</MenuItem>}
          </Menu>
        </nav>
        <Link href="/compose/post" scroll={false} aria-label="Post" onClick={(e) => { if (!requireAccount("post")) e.preventDefault(); }} className="mt-4 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-on shadow-sm transition-colors hover:bg-accent-hover xl:h-[49px] xl:w-[90%]">
          <span className="xl:hidden">
            <Feather size={22} />
          </span>
          <span className="hidden text-[0.9375rem] font-bold xl:inline">Post</span>
        </Link>
        <div className="mt-auto py-3">
          {guest ? <GuestNavCard /> : <AccountMenu />}
        </div>
      </div>
    </header>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-bg bg-accent px-1 text-[0.6875rem] font-bold leading-none text-accent-on" aria-label={`${n} unread`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function AccountMenu() {
  const s = useSession();
  const demo = useDemoControls();
  return (
    <Menu
      align="start"
      label="Account menu"
      trigger={
        <button type="button" aria-label="Account menu" className="flex w-full items-center gap-3 rounded-full p-3 transition-colors hover:bg-accent-soft">
          <Avatar user={s.actor} size={40} />
          <span className="hidden min-w-0 flex-1 text-left xl:block">
            <DisplayName user={s.actor} />
            <span className="block truncate text-fg2">@{s.actor.handle}</span>
          </span>
          <MoreHorizontal size={18} className="hidden xl:block" />
        </button>
      }
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar user={s.actor} size={48} />
        <div className="min-w-0">
          <DisplayName user={s.actor} />
          <div className="truncate text-fg2">@{s.actor.handle}</div>
        </div>
      </div>
      <MenuItem icon={<User />} href={`/${s.actor.handle}`}>Profile</MenuItem>
      {s.capabilities.switchActor && <MenuItem icon={<FlaskConical />} onSelect={demo.openSwitcher}>Switch demo identity…</MenuItem>}
      {s.capabilities.resetWorkspace && <MenuItem icon={<RotateCcw />} onSelect={demo.openReset}>Reset demo workspace…</MenuItem>}
      {s.mode === "demo" && <MenuItem icon={<HelpCircle />} href="/help#demo-mode">About demo mode</MenuItem>}
      {s.mode === "live" && <MenuItem icon={<LogOut />} onSelect={signOut}>Log out @{s.actor.handle}</MenuItem>}
    </Menu>
  );
}

// ------------------------------------------------------------------ right rail
function RightRail() {
  const pathname = usePathname();
  const onSearch = pathname.startsWith("/explore") || pathname.startsWith("/search");
  return (
    <aside aria-label="Discover" className="hidden w-[290px] shrink-0 md:block lg:w-[350px]">
      <div className="flex flex-col gap-4 pb-16">
        {!onSearch && (
          <div className="sticky top-0 z-10 bg-bg py-1">
            <SearchBox />
          </div>
        )}
        {!onSearch && <TrendsModule />}
        <WhoToFollow />
        <RailFooter />
      </div>
    </aside>
  );
}

function RailCard({ title, children, more }: { title: string; children: ReactNode; more?: { href: string; label?: string } }) {
  return (
    <section className="overflow-hidden rounded-card bg-subtle" aria-label={title}>
      <h2 className="px-4 py-3 text-heading font-extrabold">{title}</h2>
      {children}
      {more && (
        <Link href={more.href} className="block border-t border-line px-4 py-4 text-accent-text hover:bg-hover-strong">
          {more.label ?? "Show more"}
        </Link>
      )}
    </section>
  );
}

function TrendsModule() {
  const q = useQuery({ queryKey: ["trends", "for-you"], queryFn: () => get<TrendDTO[]>("/explore/trends?category=for-you"), staleTime: 5 * 60_000 });
  return (
    <RailCard title="What’s happening" more={{ href: "/explore" }}>
      {q.isPending && <div className="space-y-3 px-4 pb-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 rounded" />)}</div>}
      {q.isError && <p className="px-4 pb-4 text-fg2">Trends couldn’t load. <button className="text-accent-text" onClick={() => q.refetch()}>Retry</button></p>}
      {q.data?.slice(0, 5).map((t) => <TrendRow key={t.key} t={t} />)}
    </RailCard>
  );
}

export function TrendRow({ t, rank }: { t: TrendDTO; rank?: number }) {
  return (
    <Link href={`/search?q=${encodeURIComponent(t.query)}&src=trend_click`} className="block border-t border-line px-4 py-3 transition-colors hover:bg-hover-strong first:border-t-0">
      <div className="text-xs text-fg2">
        {rank ? `${rank} · ` : ""}
        {t.category} · {t.source === "measured" ? "Measured in this demo" : "Curated for this demo"}
      </div>
      <div className="font-bold break-anywhere">{t.label}</div>
      {t.context && <div className="text-sm text-fg2">{t.context}</div>}
      <div className="text-xs text-fg2">{compactCount(t.postCount)} post{t.postCount === 1 ? "" : "s"}</div>
    </Link>
  );
}

function WhoToFollow() {
  const q = useQuery({ queryKey: ["suggestions", 3], queryFn: () => get<UserListItem[]>("/suggestions?limit=3"), staleTime: 5 * 60_000 });
  if (q.data && q.data.length === 0) return null;
  return (
    <RailCard title="Who to follow" more={{ href: "/i/connect" }}>
      {q.isPending && <div className="space-y-3 px-4 pb-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded" />)}</div>}
      {q.data?.map((it) => (
        <div key={it.user.id} className="flex items-center gap-3 border-t border-line px-4 py-3 hover:bg-hover-strong">
          <Link href={`/${it.user.handle}`}>
            <Avatar user={it.user} size={48} />
          </Link>
          <Link href={`/${it.user.handle}`} className="min-w-0 flex-1">
            <DisplayName user={it.user} className="hover:underline" />
            <div className="truncate text-fg2">@{it.user.handle}</div>
          </Link>
          <FollowButton user={it.user} relationship={it.relationship} size="sm" />
        </div>
      ))}
    </RailCard>
  );
}

function RailFooter() {
  return (
    <footer className="px-4 text-xs leading-5 text-fg2">
      <nav aria-label="Footer" className="flex flex-wrap gap-x-3">
        <Link href="/help" className="hover:underline">Help Center</Link>
        <Link href="/help#demo-mode" className="hover:underline">About demo mode</Link>
        <Link href="/i/keyboard_shortcuts" className="hover:underline">Keyboard shortcuts</Link>
        <Link href="/i/display" className="hover:underline">Display</Link>
        <Link href="/help#privacy" className="hover:underline">Privacy in this demo</Link>
      </nav>
      <p className="mt-1">© 2026 iSchoolie · Demo environment with fictional content</p>
    </footer>
  );
}

// --------------------------------------------------------------- mobile chrome
function BottomNav() {
  const s = useSession();
  const pathname = usePathname();
  const guest = useIsGuest();
  const all: { key: NavKey; label: string; href: string; badge?: number; icon: NavKey }[] = [
    { key: "home", label: "Home", href: "/home", icon: "home" },
    { key: "explore", label: "Search and Explore", href: "/explore", icon: "search" },
    { key: "notifications", label: "Notifications", href: "/notifications", badge: s.badges.notifications, icon: "notifications" },
    { key: "messages", label: "Messages", href: "/messages", badge: s.badges.messages, icon: "messages" },
  ];
  const items = guest ? all.filter((it) => it.key === "home" || it.key === "explore") : all;
  // Keep the conversation input clear of the bottom bar.
  if (/^\/messages\/[^/]+$/.test(pathname) && pathname !== "/messages/compose" && pathname !== "/messages/requests") return null;
  // Full-screen compose flow on phones.
  if (pathname.startsWith("/compose/post")) return null;
  return (
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg sm:hidden">
      <div className="flex h-[var(--h-bottom-nav)]">
        {items.map((it) => {
          const active = navActive(pathname, it.key, s.actor.handle);
          return (
            <Link key={it.key} href={it.href} aria-label={it.label} aria-current={active ? "page" : undefined} className={clsx("flex flex-1 items-center justify-center", active ? "text-accent-text" : "text-fg")}>
              <span className="relative">
                <NavIcon name={it.icon} active={active} size={26} />
                {!!it.badge && <Badge n={it.badge} />}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileFab({ messages }: { messages: boolean }) {
  const requireAccount = useRequireAccount();
  const guest = useIsGuest();
  if (guest) return null;
  return (
    <Link
      href={messages ? "/messages/compose" : "/compose/post"}
      onClick={(e) => { if (!requireAccount(messages ? "send messages" : "post")) e.preventDefault(); }}
      scroll={false}
      aria-label={messages ? "New message" : "Post"}
      className="fixed bottom-[calc(var(--h-bottom-nav)+16px+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-on shadow-lg sm:hidden"
    >
      {messages ? <MailPlus size={24} /> : <span className="relative"><Feather size={24} /><Plus size={12} strokeWidth={3} className="absolute -left-1.5 -top-1" /></span>}
    </Link>
  );
}

function MobileDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useSession();
  const demo = useDemoControls();
  const pathname = usePathname();
  const guest = useIsGuest();
  const ret = useReturnTo();
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) onOpenChange(false);
    first.current = pathname;
  }, [pathname, onOpenChange]);
  const prof = useQuery({ queryKey: ["profile", s.actor.handle.toLowerCase()], queryFn: () => get<ProfileDTO>(`/users/${s.actor.handle}`), enabled: open && !guest });
  const link = (href: string, icon: ReactNode, label: string) => (
    <Link href={href} onClick={() => onOpenChange(false)} className="flex min-h-[52px] items-center gap-4 px-4 text-[0.9375rem] hover:bg-hover-strong [&>svg]:text-fg2">
      {icon}
      {label}
    </Link>
  );
  return (
    <R.Root open={open} onOpenChange={onOpenChange}>
      <R.Portal>
        <R.Overlay className="motion-fade fixed inset-0 z-50 bg-overlay" />
        <R.Content className="safe-top fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-bg outline-none" aria-describedby={undefined}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <R.Title className="font-extrabold">Account info</R.Title>
            <R.Close aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-hover-strong">
              <X size={20} />
            </R.Close>
          </div>
          {guest ? (
            <div className="px-4 py-4">
              <p className="font-extrabold">You’re browsing as a guest</p>
              <p className="mt-1 text-sm text-fg2">Sign up to post, reply, like, follow and send messages.</p>
              <Link href={`/signup${ret}`} className="mt-4 flex min-h-[40px] items-center justify-center rounded-full bg-accent font-bold text-accent-on">Sign up</Link>
              <Link href={`/signin${ret}`} className="mt-2 flex min-h-[40px] items-center justify-center rounded-full border border-accent font-bold text-accent-text">Log in</Link>
            </div>
          ) : (
          <div className="px-4 py-3">
            <Link href={`/${s.actor.handle}`} onClick={() => onOpenChange(false)}>
              <Avatar user={s.actor} size={40} />
              <DisplayName user={s.actor} className="mt-2" />
              <div className="text-fg2">@{s.actor.handle}</div>
            </Link>
            <div className="mt-3 flex gap-4">
              <Link href={`/${s.actor.handle}/following`} onClick={() => onOpenChange(false)}>
                <b>{prof.data?.followingCount ?? "–"}</b> <span className="text-fg2">Following</span>
              </Link>
              <Link href={`/${s.actor.handle}/followers`} onClick={() => onOpenChange(false)}>
                <b>{prof.data?.followersCount ?? "–"}</b> <span className="text-fg2">Followers</span>
              </Link>
            </div>
          </div>
          )}
          <nav aria-label="Account" className="border-t border-line py-1">
            {!guest && link(`/${s.actor.handle}`, <User size={22} />, "Profile")}
            {!guest && link("/i/lists", <ScrollText size={22} />, "Lists")}
            {link("/i/topics", <MessageSquareText size={22} />, "Topics")}
            {!guest && link("/i/bookmarks", <Bookmark size={22} />, "Bookmarks")}
            {link("/i/moments", <Zap size={22} />, "Moments")}
            {!guest && link("/i/follower_requests", <UserCheck size={22} />, `Follower requests${s.badges.followRequests ? ` (${s.badges.followRequests})` : ""}`)}
          </nav>
          <nav aria-label="Settings" className="border-t border-line py-1">
            {!guest && link("/settings", <Settings size={22} />, "Settings and privacy")}
            {link("/help", <HelpCircle size={22} />, "Help Center")}
            {link("/i/display", <Paintbrush size={22} />, "Display")}
            {s.capabilities.switchActor && (<>
            <button type="button" onClick={() => { onOpenChange(false); demo.openSwitcher(); }} className="flex min-h-[52px] w-full items-center gap-4 px-4 text-left hover:bg-hover-strong">
              <FlaskConical size={22} className="text-fg2" /> Switch demo identity
            </button>
            <button type="button" onClick={() => { onOpenChange(false); demo.openReset(); }} className="flex min-h-[52px] w-full items-center gap-4 px-4 text-left hover:bg-hover-strong">
              <RotateCcw size={22} className="text-fg2" /> Reset demo workspace
            </button>
            </>)}
            {s.mode === "live" && !guest && (
              <button type="button" onClick={signOut} className="flex min-h-[52px] w-full items-center gap-4 px-4 text-left hover:bg-hover-strong">
                <LogOut size={22} className="text-fg2" /> Log out
              </button>
            )}
          </nav>
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}

// ------------------------------------------------------------------ page header
export function PageHeader({
  title,
  subtitle,
  back,
  topLevel,
  right,
  children,
  border = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean | string;
  topLevel?: boolean;
  right?: ReactNode;
  children?: ReactNode;
  border?: boolean;
}) {
  const router = useRouter();
  const openDrawer = useOpenDrawer();
  const s = useSession();
  const goBack = () => {
    if (typeof back === "string") router.push(back);
    else if (window.history.length > 1) router.back();
    else router.push("/home");
  };
  return (
    <div className={clsx("header-blur sticky top-0 z-30", border && "border-b border-line")}>
      <div className="flex min-h-[var(--h-header)] items-center gap-2 px-4">
        {topLevel && (
          <button type="button" onClick={openDrawer} aria-label="Open account menu" className="-ml-1 mr-2 sm:hidden">
            <Avatar user={s.actor} size={32} />
          </button>
        )}
        {back && (
          <button type="button" onClick={goBack} aria-label="Back" className="-ml-2 mr-5 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-accent-text hover:bg-accent-soft">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M20 11H7.414l4.293-4.293a1 1 0 0 0-1.414-1.414l-6 6a1 1 0 0 0 0 1.414l6 6a1 1 0 0 0 1.414-1.414L7.414 13H20a1 1 0 1 0 0-2z" /></svg>
          </button>
        )}
        {title !== undefined && (
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-heading font-extrabold">{title}</h1>
            {subtitle && <div className="truncate text-xs text-fg2">{subtitle}</div>}
          </div>
        )}
        {children}
        {right}
      </div>
    </div>
  );
}

export function MobileSearchButton() {
  return (
    <Link href="/explore" aria-label="Search" className="grid h-9 w-9 place-items-center rounded-full text-accent-text hover:bg-accent-soft sm:hidden">
      <Search size={20} />
    </Link>
  );
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

// ------------------------------------------------------------------ live auth chrome
/** Signs out via the server route (clears the Supabase session cookies) and reloads. */
export async function signOut() {
  try {
    await fetch("/auth/signout", { method: "POST", credentials: "same-origin" });
  } finally {
    window.location.assign("/home");
  }
}

function GuestNavCard() {
  const ret = useReturnTo();
  return (
    <div className="hidden flex-col gap-2 xl:flex" data-testid="guest-nav-card">
      <Link href={`/signin${ret}`} className="flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-accent font-bold text-accent-text hover:bg-accent-soft">
        <LogIn size={18} /> Log in
      </Link>
      <Link href={`/signup${ret}`} className="flex min-h-[44px] items-center justify-center rounded-full bg-accent font-bold text-accent-on hover:bg-accent-hover">
        Sign up
      </Link>
    </div>
  );
}

/** Logged-out bottom bar, as on the 2020 layout. */
function GuestBar() {
  const ret = useReturnTo();
  return (
    <div role="region" aria-label="Sign up" data-testid="guest-bar" className="fixed inset-x-0 bottom-[calc(var(--h-bottom-nav)+env(safe-area-inset-bottom))] z-40 bg-accent text-accent-on sm:bottom-0">
      <div className="mx-auto flex max-w-[990px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-3 xl:pl-[275px]">
        <div className="min-w-0">
          <p className="text-[1.1875rem] font-extrabold leading-tight sm:text-[1.4375rem]">Don’t miss what’s happening</p>
          <p className="text-[0.9375rem]">People on iSchoolie are the first to know.</p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Link href={`/signin${ret}`} className="flex min-h-[36px] flex-1 items-center justify-center rounded-full border border-white/70 px-4 font-bold hover:bg-white/10 sm:flex-none">
            Log in
          </Link>
          <Link href={`/signup${ret}`} className="flex min-h-[36px] flex-1 items-center justify-center rounded-full bg-white px-4 font-bold text-accent-text hover:bg-white/90 sm:flex-none">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
