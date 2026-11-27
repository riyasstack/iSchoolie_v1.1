"use client";
/**
 * Campus rail: a swipeable row of classmates who posted recently in your Feed.
 * Tapping one opens the catch-up viewer — their latest posts, one screen at a time,
 * with progress bars, tap/keyboard/swipe navigation and hold-to-pause.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Dialog as R } from "radix-ui";
import clsx from "clsx";
import { ExternalLink, MessageSquare, PartyPopper, Pause, Play, Plus, X } from "lucide-react";
import { Avatar, DisplayName } from "@/components/ui/misc";
import { GuestGate, useIsGuest, useSession } from "@/components/providers";
import { relativeTime } from "@/lib/format";
import { isPost, usePost, useTimeline, useToggle } from "../posts/cache";
import { postPath } from "../posts/post-card";
import { CheerBurst } from "../posts/post-media";
import { RichText } from "../posts/rich-text";
import type { PostDTO, UserDTO } from "@/lib/types";

const SEEN_KEY = "ischoolie.rail.seen";
const STEP_MS = 6000;
const MAX_PEOPLE = 20;
const MAX_POSTS = 5;

interface Group {
  author: UserDTO;
  postIds: string[];
  latest: string;
}

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable: rings just won't remember */
  }
}

export function CampusRail({ timelineKey, path }: { timelineKey: readonly unknown[]; path: string }) {
  const s = useSession();
  const guest = useIsGuest();
  const q = useTimeline(timelineKey, path);
  const [seen, setSeen] = useState<Record<string, string>>(() => (typeof window === "undefined" ? {} : readSeen()));
  const [openAt, setOpenAt] = useState<number | null>(null);

  const groups = useMemo(() => {
    const byAuthor = new Map<string, { author: UserDTO; posts: PostDTO[] }>();
    for (const page of q.data?.pages ?? []) {
      for (const p of page.posts) {
        if (!isPost(p) || p.author.id === s.actor.id || p.viewer.authorMuted) continue;
        const g = byAuthor.get(p.author.id) ?? { author: p.author, posts: [] };
        if (!g.posts.some((x) => x.id === p.id)) g.posts.push(p);
        byAuthor.set(p.author.id, g);
      }
    }
    return [...byAuthor.values()]
      .map((g) => {
        const posts = g.posts.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-MAX_POSTS);
        return { author: g.author, postIds: posts.map((p) => p.id), latest: posts[posts.length - 1].createdAt } satisfies Group;
      })
      .sort((a, b) => b.latest.localeCompare(a.latest))
      .slice(0, MAX_PEOPLE);
  }, [q.data, s.actor.id]);

  const isSeen = useCallback((g: Group) => !!seen[g.author.id] && seen[g.author.id] >= g.latest, [seen]);
  // Unseen first, keeping recency order inside each half; frozen while the viewer is open.
  const ordered = useMemo(() => [...groups.filter((g) => !isSeen(g)), ...groups.filter(isSeen)], [groups, isSeen]);
  const [frozen, setFrozen] = useState<Group[] | null>(null);
  const list = frozen ?? ordered;

  const markSeen = useCallback((authorId: string, createdAt: string) => {
    setSeen((prev) => {
      if (prev[authorId] && prev[authorId] >= createdAt) return prev;
      const next = { ...prev, [authorId]: createdAt };
      writeSeen(next);
      return next;
    });
  }, []);

  if (groups.length < 2) return null;
  return (
    <section aria-label="Classmates who posted recently" className="mx-3 mt-3 overflow-hidden rounded-2xl border border-line bg-bg shadow-card">
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 py-3.5" role="list">
        {!guest && (
          <div role="listitem" className="shrink-0 snap-start">
            <Link href="/compose/post" className="press flex w-[72px] flex-col items-center gap-1.5" aria-label="Share a post">
              <span className="relative rounded-[24px] p-[3px]">
                <span className="block rounded-[21px] bg-bg p-[2px]">
                  <Avatar user={s.actor} size={60} className="!rounded-[19px]" />
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-[2.5px] border-bg bg-accent-text text-white">
                  <Plus size={13} strokeWidth={3} />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs text-fg2">Your post</span>
            </Link>
          </div>
        )}
        {list.map((g, i) => (
          <div key={g.author.id} role="listitem" className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => {
                setFrozen(list);
                setOpenAt(i);
              }}
              className="press flex w-[72px] flex-col items-center gap-1.5"
              aria-label={`Catch up with ${g.author.displayName}${isSeen(g) ? "" : ", new posts"}`}
            >
              <span className="rail-ring rounded-[24px] p-[3px]" data-seen={isSeen(g) ? "" : undefined}>
                <span className="block rounded-[21px] bg-bg p-[2px]">
                  <Avatar user={g.author} size={60} className="!rounded-[19px]" />
                </span>
              </span>
              <span className={clsx("w-full truncate text-center text-xs", isSeen(g) ? "text-fg2" : "font-medium text-fg")}>{g.author.displayName}</span>
            </button>
          </div>
        ))}
      </div>
      {openAt !== null && frozen && (
        <CatchUpViewer
          groups={frozen}
          start={openAt}
          onSeen={markSeen}
          onClose={() => {
            setOpenAt(null);
            setFrozen(null);
          }}
        />
      )}
    </section>
  );
}

function CatchUpViewer({ groups, start, onSeen, onClose }: { groups: Group[]; start: number; onSeen: (authorId: string, createdAt: string) => void; onClose: () => void }) {
  const [gi, setGi] = useState(start);
  const [pi, setPi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [dragY, setDragY] = useState(0);
  const group = groups[gi];
  const postId = group.postIds[pi];

  const next = useCallback(() => {
    setProgress(0);
    if (pi < group.postIds.length - 1) setPi(pi + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setPi(0);
    } else onClose();
  }, [gi, pi, group.postIds.length, groups.length, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    if (pi > 0) setPi(pi - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setPi(0);
    }
  }, [gi, pi]);

  // Advance on a timer; holding a finger down (or the pause button) stops the clock.
  const stopped = paused || held || dragY > 0;
  const elapsed = useRef(0);
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);
  useEffect(() => {
    elapsed.current = 0;
  }, [postId]);
  useEffect(() => {
    if (stopped) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      if (elapsed.current >= STEP_MS) {
        elapsed.current = 0;
        nextRef.current();
        return;
      }
      setProgress(elapsed.current / STEP_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stopped, postId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Tap zones: left third goes back, the rest goes forward; a long press only pauses.
  const press = useRef<{ x: number; y: number; t: number; holdTimer: ReturnType<typeof setTimeout> } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    const holdTimer = setTimeout(() => setHeld(true), 220);
    press.current = { x: e.clientX, y: e.clientY, t: Date.now(), holdTimer };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!press.current) return;
    const dy = e.clientY - press.current.y;
    if (dy > 6) setDragY(dy);
  };
  const onPointerUp = (e: PointerEvent) => {
    const st = press.current;
    press.current = null;
    if (!st) return;
    clearTimeout(st.holdTimer);
    const wasHeld = Date.now() - st.t > 220;
    setHeld(false);
    if (dragY > 90) return onClose();
    setDragY(0);
    if (wasHeld || Math.abs(e.clientY - st.y) > 10) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 3) prev();
    else next();
  };

  return (
    <R.Root open onOpenChange={(o) => !o && onClose()}>
      <R.Portal>
        <R.Overlay className="motion-fade fixed inset-0 z-[95] bg-black/90 backdrop-blur-xl" />
        <R.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[95] flex items-center justify-center outline-none sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <R.Title className="sr-only">{`Catching up with ${group.author.displayName}`}</R.Title>
          <div
            className="motion-pop relative flex h-dvh w-full touch-none select-none flex-col overflow-hidden bg-[#111] text-white sm:h-[min(88dvh,780px)] sm:max-w-[440px] sm:rounded-[28px] sm:shadow-2xl"
            style={{ transform: dragY ? `translateY(${dragY}px) scale(${1 - Math.min(dragY, 300) / 1500})` : undefined, opacity: dragY ? 1 - Math.min(dragY, 300) / 600 : undefined, transition: dragY ? "none" : "transform 200ms, opacity 200ms" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              if (press.current) clearTimeout(press.current.holdTimer);
              press.current = null;
              setHeld(false);
              setDragY(0);
            }}
          >
            <Slide key={postId} postId={postId} onShown={(p) => onSeen(p.author.id, p.createdAt)} />
            {/* Top chrome */}
            <div className={clsx("absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))] transition-opacity", held && "opacity-0")}>
              <div className="flex gap-1" aria-hidden="true">
                {group.postIds.map((id, i) => (
                  <span key={id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                    <span className="block h-full rounded-full bg-white" style={{ width: `${i < pi ? 100 : i === pi ? progress * 100 : 0}%` }} />
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Link href={`/${group.author.handle}`} onClick={onClose} className="press flex min-w-0 items-center gap-2.5">
                  <Avatar user={group.author} size={34} className="ring-2 ring-white/70" />
                  <DisplayName user={group.author} className="text-[0.9375rem] text-white [&_svg]:text-white" />
                </Link>
                <SlideTime postId={postId} />
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setPaused((v) => !v)} aria-label={paused ? "Play" : "Pause"} className="press grid h-9 w-9 place-items-center rounded-full hover:bg-white/15">
                    {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
                  </button>
                  <R.Close aria-label="Close" className="press grid h-9 w-9 place-items-center rounded-full hover:bg-white/15">
                    <X size={22} />
                  </R.Close>
                </div>
              </div>
            </div>
            <span className="sr-only" aria-live="polite">{`Post ${pi + 1} of ${group.postIds.length} from ${group.author.displayName}`}</span>
            <SlideActions postId={postId} hidden={held} onLeave={onClose} />
          </div>
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}

const TEXT_BACKDROPS = [
  "linear-gradient(150deg, #0a84ff, #5856d6)",
  "linear-gradient(150deg, #5856d6, #af52de)",
  "linear-gradient(150deg, #ff9f0a, #e8590c)",
  "linear-gradient(150deg, #30b0c7, #0a84ff)",
  "linear-gradient(150deg, #34c759, #30b0c7)",
  "linear-gradient(150deg, #1d1d1f, #48484a)",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function Slide({ postId, onShown }: { postId: string; onShown: (p: PostDTO) => void }) {
  const { data } = usePost(postId);
  const p = isPost(data) ? data : null;
  useEffect(() => {
    if (p) onShown(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);
  if (!p) return <div className="flex-1" />;
  const image = p.media.find((m) => m.kind !== "VIDEO") ?? null;
  const still = image ? image.url : p.media[0]?.thumbUrl ?? null;
  if (still) {
    return (
      <div className="img-fade relative flex flex-1 items-center justify-center">
        <img src={still} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
        <img src={still} alt={image?.alt ?? ""} className="relative max-h-full w-full object-contain" draggable={false} />
        {p.text && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pb-24 pt-16">
            <RichText text={p.text} lang={p.lang} className="line-clamp-4 text-[1rem] leading-6 text-white [&_a]:text-white [&_a]:underline" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="img-fade flex flex-1 items-center justify-center px-8 pb-16 pt-20" style={{ background: TEXT_BACKDROPS[hash(p.author.id) % TEXT_BACKDROPS.length] }}>
      <RichText text={p.text || (p.poll ? "📊 Poll — open the post to vote" : "")} lang={p.lang} className="line-clamp-[10] text-center text-[1.375rem] font-semibold leading-8 tracking-[-0.01em] text-white [&_a]:text-white [&_a]:underline" />
    </div>
  );
}

function SlideTime({ postId }: { postId: string }) {
  const { data } = usePost(postId);
  if (!isPost(data)) return null;
  return <time dateTime={data.createdAt} className="shrink-0 text-sm text-white/70">{relativeTime(data.createdAt)}</time>;
}

function SlideActions({ postId, hidden, onLeave }: { postId: string; hidden: boolean; onLeave: () => void }) {
  const router = useRouter();
  const { data } = usePost(postId);
  const like = useToggle("like");
  const [bursts, setBursts] = useState<number[]>([]);
  if (!isPost(data)) return null;
  const p = data;
  const pill = "press flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur-md hover:bg-white/25";
  return (
    <div className={clsx("absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 transition-opacity", hidden && "opacity-0")}>
      {bursts.length > 0 && (
        <span className="pointer-events-none fixed inset-0 grid place-items-center" aria-hidden="true">
          {bursts.map((k) => <CheerBurst key={k} size={110} onDone={() => setBursts((b) => b.filter((x) => x !== k))} />)}
        </span>
      )}
      <GuestGate action="cheer and reply to posts">
        <button
          type="button"
          aria-pressed={p.viewer.liked}
          aria-label={p.viewer.liked ? "Remove cheer" : "Cheer"}
          onClick={() => {
            if (!p.viewer.liked) setBursts((b) => [...b, Date.now()]);
            like.mutate({ id: p.id, on: !p.viewer.liked });
          }}
          className={clsx(pill, p.viewer.liked && "!bg-white text-like")}
        >
          <PartyPopper size={18} />
          {p.viewer.liked ? "Cheered" : "Cheer"}
        </button>
        <button
          type="button"
          aria-label="Reply"
          disabled={!p.viewer.canReply}
          onClick={() => {
            onLeave();
            router.push(`/compose/post?reply=${p.id}`);
          }}
          className={clsx(pill, "disabled:opacity-40")}
        >
          <MessageSquare size={18} />
          Reply
        </button>
      </GuestGate>
      <Link href={postPath(p)} onClick={onLeave} className={clsx(pill, "ml-auto")} data-guest-ok="">
        <ExternalLink size={16} />
        Open
      </Link>
    </div>
  );
}
