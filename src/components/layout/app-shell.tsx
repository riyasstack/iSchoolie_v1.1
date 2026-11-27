"use client";
/**
 * Campus Cards app shell: a sticky top bar (logo, search, New post, account), a rounded
 * "Spaces" sidebar, the page in a rounded content card, and a "Campus board" of widget
 * cards. On phones: compact top bar, floating labelled dock, and a drawer for the rest.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Dialog as R } from "radix-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search, X, MailPlus, Settings, HelpCircle, Paintbrush, Keyboard, UserCheck, User, Users, RotateCcw, FlaskConical, LogOut, LogIn, Flame, Sparkles, ArrowRight, ArrowLeft } from "lucide-react";
import { useIsGuest, useRequireAccount, useReturnTo, useSession } from "@/components/providers";
import { Avatar, DisplayName, Menu, MenuItem } from "@/components/ui/misc";
import { NavIcon, ComposeIcon, SPACE_LABELS, type NavKey } from "./nav-icons";
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
    case "topics":
      return pathname.startsWith("/i/topics");
    case "moments":
      return pathname.startsWith("/i/moments");
    case "profile":
      return !!handle && (pathname.toLowerCase() === `/${handle.toLowerCase()}` || (pathname.toLowerCase().startsWith(`/${handle.toLowerCase()}/`) && !pathname.includes("/status/")));
    default:
      return false;
  }
}

export function AppShell({ children, modal }: { children: ReactNode; modal?: ReactNode }) {
  const pathname = usePathname();
  const guest = useIsGuest();
  const [drawer, setDrawer] = useState(false);
  const wide = pathname.startsWith("/messages") || pathname.startsWith("/settings");
  const hideBoard = wide || pathname.startsWith("/compose");
  const fab = /^\/(home|explore|notifications|search|i\/topics|i\/lists$|[^/]+$)/.test(pathname) && !pathname.startsWith("/settings") && pathname !== "/messages";
  const inConversation = /^\/messages\/[^/]+$/.test(pathname) && pathname !== "/messages/compose" && pathname !== "/messages/requests";
  return (
    <DemoControlsProvider>
      <DialogsProvider>
        <DrawerCtx.Provider value={() => setDrawer(true)}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-on">
            Skip to content
          </a>
          <TopBar onOpenDrawer={() => setDrawer(true)} />
          <div className="mx-auto flex w-full max-w-[1260px] justify-center gap-5 sm:px-4 sm:pt-4">
            <SpacesSidebar />
            <main
              id="main"
              className={clsx(
                "min-h-[calc(100dvh-var(--h-topbar))] w-full min-w-0 bg-feed sm:min-h-0 sm:self-start sm:overflow-clip sm:rounded-card sm:border sm:border-line sm:shadow-card",
                !inConversation && "pb-[calc(var(--h-bottom-nav)+28px+env(safe-area-inset-bottom))] sm:mb-6 sm:pb-0",
                guest && "!pb-[calc(var(--h-bottom-nav)+170px+env(safe-area-inset-bottom))] sm:!pb-[110px]",
                wide ? "sm:max-w-[960px]" : "sm:max-w-[var(--w-main)]",
              )}
            >
              {children}
            </main>
            {!hideBoard && <CampusBoard />}
          </div>
          {fab && <MobileFab messages={false} />}
          {pathname === "/messages" && <MobileFab messages />}
          <BottomDock />
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

// --------------------------------------------------------------------- top bar
function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const s = useSession();
  const guest = useIsGuest();
  const ret = useReturnTo();
  const requireAccount = useRequireAccount();
  const pathname = usePathname();
  const onSearch = pathname.startsWith("/explore") || pathname.startsWith("/search");
  return (
    <header role="banner" className="topbar-blur sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-[var(--h-topbar)] max-w-[1260px] items-center gap-4 px-4">
        <Link href="/home" aria-label="iSchoolie home" className="flex shrink-0 items-center gap-2 rounded-xl py-1 pr-2">
          <img src="/brand/ischoolie-symbol.png" alt="" width={34} height={34} className="rounded-lg" />
          <span className="text-[1.2rem] font-semibold tracking-[-0.03em] text-fg">iSchoolie</span>
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <div className="w-full max-w-[520px]">{!onSearch && <SearchBox />}</div>
        </div>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link href="/explore" aria-label="Search" className="grid h-10 w-10 place-items-center rounded-xl text-fg2 hover:bg-hover-strong hover:text-fg md:hidden">
            <Search size={20} />
          </Link>
          {guest ? (
            <div className="flex items-center gap-2" data-testid="guest-nav-card">
              <Link href={`/signin${ret}`} className="hidden min-h-[40px] items-center gap-2 rounded-xl px-3.5 font-semibold text-fg hover:bg-hover-strong sm:flex">
                <LogIn size={17} /> Log in
              </Link>
              <Link href={`/signup${ret}`} className="flex min-h-[40px] items-center rounded-xl bg-accent px-4 font-semibold text-accent-on shadow-sm hover:bg-accent-hover">
                Join iSchoolie
              </Link>
            </div>
          ) : (
            <>
              <Link
                href="/compose/post"
                scroll={false}
                aria-label="New post"
                onClick={(e) => { if (!requireAccount("post")) e.preventDefault(); }}
                className="hidden min-h-[40px] items-center gap-2 rounded-xl bg-accent px-4 font-semibold text-accent-on shadow-sm transition-colors hover:bg-accent-hover sm:flex"
              >
                <ComposeIcon size={17} /> New post
              </Link>
              <div className="hidden sm:block"><AccountMenu /></div>
              <button type="button" onClick={onOpenDrawer} aria-label="Open account menu" className="rounded-full sm:hidden">
                <Avatar user={s.actor} size={34} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ------------------------------------------------------------- spaces sidebar
function SpacesSidebar() {
  const s = useSession();
  const pathname = usePathname();
  const demo = useDemoControls();
  const guest = useIsGuest();
  const main: { key: NavKey; href: string; badge?: number }[] = [
    { key: "home", href: "/home" },
    { key: "explore", href: "/explore" },
    { key: "notifications", href: "/notifications", badge: s.badges.notifications },
    { key: "messages", href: "/messages", badge: s.badges.messages },
  ];
  const library: { key: NavKey; href: string; badge?: number }[] = [
    { key: "bookmarks", href: "/i/bookmarks" },
    { key: "lists", href: "/i/lists" },
    { key: "topics", href: "/i/topics" },
    { key: "moments", href: "/i/moments" },
    { key: "profile", href: `/${s.actor.handle}` },
  ];
  // Guests browse public spaces only.
  const mainItems = guest ? main.filter((it) => it.key === "home" || it.key === "explore") : main;
  const libraryItems = guest ? library.filter((it) => it.key === "topics" || it.key === "moments") : library;
  const item = (it: { key: NavKey; href: string; badge?: number }) => {
    const active = navActive(pathname, it.key, s.actor.handle);
    const label = SPACE_LABELS[it.key];
    return (
      <Link
        key={it.key}
        href={it.href}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        title={label}
        className={clsx(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text",
          active ? "bg-hover-strong font-semibold text-fg" : "text-fg2 hover:bg-hover hover:text-fg",
        )}
      >
        <span className="relative shrink-0">
          <NavIcon name={it.key} active={active} />
          {!!it.badge && <Badge n={it.badge} />}
        </span>
        <span className="hidden truncate xl:inline">{label}</span>
      </Link>
    );
  };
  return (
    <aside aria-label="Spaces" className="sticky top-[calc(var(--h-topbar)+16px)] hidden max-h-[calc(100dvh-var(--h-topbar)-32px)] w-[var(--w-nav-rail)] shrink-0 self-start sm:block xl:w-[var(--w-nav)]">
      <nav aria-label="Primary" className="campus-card flex flex-col gap-0.5 overflow-y-auto p-2 no-scrollbar">
        <p className="hidden px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-fg2 xl:block">Spaces</p>
        {mainItems.map(item)}
        <p className="hidden px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-fg2 xl:block">Your library</p>
        <div className="my-1 border-t border-line xl:hidden" />
        {libraryItems.map(item)}
        <div className="my-1 border-t border-line" />
        <Menu
          align="start"
          label="More"
          trigger={
            <button type="button" aria-label="More" title="More" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-fg transition-colors outline-none hover:bg-hover-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text">
              <NavIcon name="more" />
              <span className="hidden xl:inline">More</span>
            </button>
          }
        >
          {!guest && <MenuItem icon={<UserCheck />} href="/i/follower_requests">Follow requests{s.badges.followRequests ? ` (${s.badges.followRequests})` : ""}</MenuItem>}
          {!guest && <MenuItem icon={<Users />} href="/i/connect">People to meet</MenuItem>}
          {!guest && <MenuItem icon={<Settings />} href="/settings">Settings and privacy</MenuItem>}
          <MenuItem icon={<HelpCircle />} href="/help">Help</MenuItem>
          <MenuItem icon={<Paintbrush />} href="/i/display">Appearance</MenuItem>
          <MenuItem icon={<Keyboard />} href="/i/keyboard_shortcuts">Keyboard shortcuts</MenuItem>
          {s.capabilities.switchActor && <MenuItem icon={<FlaskConical />} onSelect={demo.openSwitcher}>Switch demo identity…</MenuItem>}
        </Menu>
      </nav>
    </aside>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-xl border-2 border-bg bg-danger px-1 text-[0.625rem] font-semibold leading-none text-white" aria-label={`${n} unread`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function AccountMenu() {
  const s = useSession();
  const demo = useDemoControls();
  return (
    <Menu
      align="end"
      label="Account menu"
      trigger={
        <button type="button" aria-label="Account menu" className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-hover-strong">
          <Avatar user={s.actor} size={34} />
          <span className="hidden max-w-[140px] min-w-0 text-left lg:block">
            <DisplayName user={s.actor} className="text-sm" />
            <span className="block truncate text-xs text-fg2">@{s.actor.handle}</span>
          </span>
          <ChevronDown size={16} className="text-fg2" />
        </button>
      }
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar user={s.actor} size={44} />
        <div className="min-w-0">
          <DisplayName user={s.actor} />
          <div className="truncate text-fg2">@{s.actor.handle}</div>
        </div>
      </div>
      <MenuItem icon={<User />} href={`/${s.actor.handle}`}>Profile</MenuItem>
      <MenuItem icon={<Settings />} href="/settings">Settings and privacy</MenuItem>
      {s.capabilities.switchActor && <MenuItem icon={<FlaskConical />} onSelect={demo.openSwitcher}>Switch demo identity…</MenuItem>}
      {s.capabilities.resetWorkspace && <MenuItem icon={<RotateCcw />} onSelect={demo.openReset}>Reset demo workspace…</MenuItem>}
      {s.mode === "demo" && <MenuItem icon={<HelpCircle />} href="/help#demo-mode">About demo mode</MenuItem>}
      {s.mode === "live" && <MenuItem icon={<LogOut />} onSelect={signOut}>Log out @{s.actor.handle}</MenuItem>}
    </Menu>
  );
}

// --------------------------------------------------------------- campus board
function CampusBoard() {
  return (
    <aside aria-label="Campus board" className="sticky top-[calc(var(--h-topbar)+16px)] hidden w-[var(--w-side-narrow)] shrink-0 self-start md:block lg:w-[var(--w-side)]">
      <div className="flex flex-col gap-4 pb-10">
        <BuzzingModule />
        <PeopleToMeet />
        <BoardFooter />
      </div>
    </aside>
  );
}

function BoardCard({ title, icon, children, more }: { title: string; icon: ReactNode; children: ReactNode; more?: { href: string; label?: string } }) {
  return (
    <section className="campus-card overflow-hidden" aria-label={title}>
      <h2 className="flex items-center gap-2 px-4 pb-2 pt-4 text-[0.95rem] font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-subtle text-fg [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        {title}
      </h2>
      {children}
      {more && (
        <Link href={more.href} className="flex items-center gap-1 px-4 py-3 text-sm font-semibold text-accent-text hover:bg-hover">
          {more.label ?? "See all"} <ArrowRight size={15} />
        </Link>
      )}
    </section>
  );
}

function BuzzingModule() {
  const q = useQuery({ queryKey: ["trends", "for-you"], queryFn: () => get<TrendDTO[]>("/explore/trends?category=for-you"), staleTime: 5 * 60_000 });
  return (
    <BoardCard title="Buzzing on campus" icon={<Flame />} more={{ href: "/explore" }}>
      {q.isPending && <div className="space-y-3 px-4 pb-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>}
      {q.isError && <p className="px-4 pb-4 text-fg2">Couldn’t load what’s buzzing. <button className="text-accent-text" onClick={() => q.refetch()}>Retry</button></p>}
      {q.data && q.data.length === 0 && <p className="px-4 pb-4 text-sm text-fg2">Nothing buzzing yet. Start a conversation!</p>}
      <div className="px-2">{q.data?.slice(0, 5).map((t) => <TrendRow key={t.key} t={t} />)}</div>
    </BoardCard>
  );
}

export function TrendRow({ t, rank }: { t: TrendDTO; rank?: number }) {
  return (
    <Link href={`/search?q=${encodeURIComponent(t.query)}&src=trend_click`} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-hover-strong">
      {rank ? <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-subtle text-xs font-bold text-fg2">{rank}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-anywhere">{t.label}</span>
        {t.context && <span className="block text-sm text-fg2">{t.context}</span>}
        <span className="block text-xs text-fg2">
          {t.category} · {compactCount(t.postCount)} post{t.postCount === 1 ? "" : "s"}
          {t.source === "measured" ? "" : " · featured"}
        </span>
      </span>
    </Link>
  );
}

function PeopleToMeet() {
  const q = useQuery({ queryKey: ["suggestions", 3], queryFn: () => get<UserListItem[]>("/suggestions?limit=3"), staleTime: 5 * 60_000 });
  if (q.data && q.data.length === 0) return null;
  return (
    <BoardCard title="People to meet" icon={<Sparkles />} more={{ href: "/i/connect" }}>
      {q.isPending && <div className="space-y-3 px-4 pb-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>}
      <div className="px-2">
        {q.data?.map((it) => (
          <div key={it.user.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-hover">
            <Link href={`/${it.user.handle}`}>
              <Avatar user={it.user} size={42} />
            </Link>
            <Link href={`/${it.user.handle}`} className="min-w-0 flex-1">
              <DisplayName user={it.user} className="hover:underline" />
              <div className="truncate text-sm text-fg2">@{it.user.handle}</div>
            </Link>
            <FollowButton user={it.user} relationship={it.relationship} size="sm" />
          </div>
        ))}
      </div>
    </BoardCard>
  );
}

function BoardFooter() {
  const s = useSession();
  return (
    <footer className="px-2 text-xs leading-5 text-fg2">
      <nav aria-label="Footer" className="flex flex-wrap gap-x-3">
        <Link href="/help" className="hover:underline">Help</Link>
        {s.mode === "demo" && <Link href="/help#demo-mode" className="hover:underline">About demo mode</Link>}
        <Link href="/i/keyboard_shortcuts" className="hover:underline">Keyboard shortcuts</Link>
        <Link href="/i/display" className="hover:underline">Appearance</Link>
        <Link href="/help#privacy" className="hover:underline">Privacy</Link>
      </nav>
      <p className="mt-1">© 2026 iSchoolie{s.mode === "demo" ? " · Demo with fictional content" : ""}</p>
    </footer>
  );
}

// --------------------------------------------------------------- mobile chrome
function BottomDock() {
  const s = useSession();
  const pathname = usePathname();
  const guest = useIsGuest();
  const all: { key: NavKey; href: string; badge?: number }[] = [
    { key: "home", href: "/home" },
    { key: "explore", href: "/explore" },
    { key: "notifications", href: "/notifications", badge: s.badges.notifications },
    { key: "messages", href: "/messages", badge: s.badges.messages },
  ];
  const items = guest ? all.filter((it) => it.key === "home" || it.key === "explore") : all;
  // Keep the conversation input clear of the dock.
  if (/^\/messages\/[^/]+$/.test(pathname) && pathname !== "/messages/compose" && pathname !== "/messages/requests") return null;
  // Full-screen compose flow on phones.
  if (pathname.startsWith("/compose/post")) return null;
  return (
    <nav aria-label="Primary" className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-40 sm:hidden">
      <div className="campus-card flex h-[var(--h-bottom-nav)] items-stretch px-1" style={{ boxShadow: "var(--shadow)" }}>
        {items.map((it) => {
          const active = navActive(pathname, it.key, s.actor.handle);
          const label = SPACE_LABELS[it.key];
          return (
            <Link key={it.key} href={it.href} aria-label={label} aria-current={active ? "page" : undefined} className={clsx("my-1.5 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-semibold", active ? "bg-hover-strong text-fg" : "text-fg2")}>
              <span className="relative">
                <NavIcon name={it.key} active={active} size={21} />
                {!!it.badge && <Badge n={it.badge} />}
              </span>
              {label}
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
      aria-label={messages ? "New message" : "New post"}
      className="fixed bottom-[calc(var(--h-bottom-nav)+24px+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-on shadow-lg sm:hidden"
    >
      {messages ? <MailPlus size={24} /> : <ComposeIcon size={24} />}
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
  const link = (href: string, key: NavKey | null, icon: ReactNode, label: string) => (
    <Link href={href} onClick={() => onOpenChange(false)} className="mx-2 flex min-h-[48px] items-center gap-4 rounded-xl px-3 text-[0.9375rem] hover:bg-hover-strong [&>svg]:text-fg2">
      {key ? <NavIcon name={key} /> : icon}
      {label}
    </Link>
  );
  return (
    <R.Root open={open} onOpenChange={onOpenChange}>
      <R.Portal>
        <R.Overlay className="motion-fade fixed inset-0 z-50 bg-overlay" />
        <R.Content className="safe-top fixed inset-y-0 left-0 z-50 flex w-[290px] max-w-[86vw] flex-col overflow-y-auto rounded-r-3xl bg-bg outline-none" aria-describedby={undefined}>
          <div className="flex items-center justify-between px-4 py-3">
            <R.Title className="font-extrabold">Your account</R.Title>
            <R.Close aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl hover:bg-hover-strong">
              <X size={20} />
            </R.Close>
          </div>
          {guest ? (
            <div className="mx-3 rounded-2xl bg-accent-soft p-4">
              <p className="font-extrabold">You’re browsing as a guest</p>
              <p className="mt-1 text-sm text-fg2">Join to post, reply, cheer, follow classmates and send messages.</p>
              <Link href={`/signup${ret}`} className="mt-4 flex min-h-[42px] items-center justify-center rounded-xl bg-accent font-semibold text-accent-on">Join iSchoolie</Link>
              <Link href={`/signin${ret}`} className="mt-2 flex min-h-[42px] items-center justify-center rounded-xl border border-line-strong bg-bg font-semibold text-fg">Log in</Link>
            </div>
          ) : (
            <div className="mx-3 rounded-2xl bg-subtle p-4">
              <Link href={`/${s.actor.handle}`} onClick={() => onOpenChange(false)} className="flex items-center gap-3">
                <Avatar user={s.actor} size={44} />
                <span className="min-w-0">
                  <DisplayName user={s.actor} />
                  <span className="block truncate text-sm text-fg2">@{s.actor.handle}</span>
                </span>
              </Link>
              <div className="mt-3 flex gap-4 text-sm">
                <Link href={`/${s.actor.handle}/following`} onClick={() => onOpenChange(false)}>
                  <b>{prof.data?.followingCount ?? "–"}</b> <span className="text-fg2">Following</span>
                </Link>
                <Link href={`/${s.actor.handle}/followers`} onClick={() => onOpenChange(false)}>
                  <b>{prof.data?.followersCount ?? "–"}</b> <span className="text-fg2">Followers</span>
                </Link>
              </div>
            </div>
          )}
          <nav aria-label="Your library" className="py-2">
            <p className="px-5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-fg2">Your library</p>
            {!guest && link(`/${s.actor.handle}`, "profile", null, SPACE_LABELS.profile)}
            {!guest && link("/i/bookmarks", "bookmarks", null, SPACE_LABELS.bookmarks)}
            {!guest && link("/i/lists", "lists", null, SPACE_LABELS.lists)}
            {link("/i/topics", "topics", null, SPACE_LABELS.topics)}
            {link("/i/moments", "moments", null, SPACE_LABELS.moments)}
            {!guest && link("/i/follower_requests", null, <UserCheck size={22} />, `Follow requests${s.badges.followRequests ? ` (${s.badges.followRequests})` : ""}`)}
          </nav>
          <nav aria-label="Settings" className="border-t border-line py-2">
            {!guest && link("/settings", null, <Settings size={22} />, "Settings and privacy")}
            {link("/help", null, <HelpCircle size={22} />, "Help")}
            {link("/i/display", null, <Paintbrush size={22} />, "Appearance")}
            {s.capabilities.switchActor && (
              <>
                <button type="button" onClick={() => { onOpenChange(false); demo.openSwitcher(); }} className="mx-2 flex min-h-[48px] w-[calc(100%-16px)] items-center gap-4 rounded-xl px-3 text-left hover:bg-hover-strong">
                  <FlaskConical size={22} className="text-fg2" /> Switch demo identity
                </button>
                <button type="button" onClick={() => { onOpenChange(false); demo.openReset(); }} className="mx-2 flex min-h-[48px] w-[calc(100%-16px)] items-center gap-4 rounded-xl px-3 text-left hover:bg-hover-strong">
                  <RotateCcw size={22} className="text-fg2" /> Reset demo workspace
                </button>
              </>
            )}
            {s.mode === "live" && !guest && (
              <button type="button" onClick={signOut} className="mx-2 flex min-h-[48px] w-[calc(100%-16px)] items-center gap-4 rounded-xl px-3 text-left hover:bg-hover-strong">
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
  right,
  children,
  border = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean | string;
  /** Kept for API compatibility; the top bar now holds the account button on phones. */
  topLevel?: boolean;
  right?: ReactNode;
  children?: ReactNode;
  border?: boolean;
}) {
  const router = useRouter();
  const goBack = () => {
    if (typeof back === "string") router.push(back);
    else if (window.history.length > 1) router.back();
    else router.push("/home");
  };
  return (
    <div className={clsx("header-blur sticky top-[var(--h-topbar)] z-30", border && "border-b border-line")}>
      <div className="flex min-h-[var(--h-header)] items-center gap-2 px-4">
        {back && (
          <button type="button" onClick={goBack} aria-label="Back" className="-ml-1 mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-fg hover:bg-hover-strong">
            <ArrowLeft size={20} />
          </button>
        )}
        {title !== undefined && (
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[1.125rem] font-bold tracking-tight">{title}</h1>
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
    <Link href="/explore" aria-label="Search" className="grid h-9 w-9 place-items-center rounded-xl text-fg2 hover:bg-hover-strong sm:hidden">
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

/** Signed-out invitation, floating above the page. */
function GuestBar() {
  const ret = useReturnTo();
  return (
    <div role="region" aria-label="Join iSchoolie" data-testid="guest-bar" className="fixed inset-x-3 bottom-[calc(var(--h-bottom-nav)+20px+env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[min(760px,calc(100%-32px))] sm:-translate-x-1/2">
      <div className="flex flex-col gap-3 rounded-2xl p-4 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-5" style={{ background: "rgba(29, 29, 31, 0.86)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)" }}>
        <div className="min-w-0">
          <p className="text-[1.05rem] font-extrabold leading-tight sm:text-[1.2rem]">Your campus is talking</p>
          <p className="text-sm text-white/70">Join iSchoolie to post, cheer classmates and find your clubs.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/signin${ret}`} className="flex min-h-[38px] flex-1 items-center justify-center rounded-xl border border-white/60 px-4 font-semibold hover:bg-white/10 sm:flex-none">
            Log in
          </Link>
          <Link href={`/signup${ret}`} className="flex min-h-[38px] flex-1 items-center justify-center rounded-xl bg-white px-4 font-semibold text-[#1d1d1f] hover:bg-white/90 sm:flex-none">
            Join now
          </Link>
        </div>
      </div>
    </div>
  );
}
