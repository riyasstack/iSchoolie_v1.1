"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { MailPlus, Settings, Info, Image as ImageIcon, Smile, SendHorizontal, MoreHorizontal, Trash2, Flag, Copy, RotateCcw, Ban, X, Check, Users, BellOff, Bell, LogOut, UserPlus, Pencil, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Avatar, DisplayName, EmptyState, ErrorState, Menu, MenuItem } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner, UserSkeleton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/providers";
import { get, post, patch, put, del, uploadFile, newClientKey, errorMessage, ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { RichText } from "../posts/rich-text";
import { QuotedPost } from "../posts/post-card";
import { GifPlayer, VideoPlayer } from "../posts/post-media";
import { EmojiPicker, GifPicker } from "../compose/pickers";
import { useDialogs } from "../dialogs";
import { REALTIME_EVENT, useRealtimeConnected } from "../realtime";
import { inspectVideo } from "@/lib/video";
import type { ConversationDTO, MediaDTO, MessageDTO, UserDTO } from "@/lib/types";

const INBOX_POLL_MS = 15_000;
const INBOX_POLL_FALLBACK_MS = 60_000;
const THREAD_POLL_MS = 4_000;
const THREAD_POLL_FALLBACK_MS = 30_000;

function useVisible() {
  const [v, setV] = useState(true);
  useEffect(() => {
    const f = () => setV(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return v;
}

function convTitle(c: ConversationDTO, meId: string) {
  if (c.name) return c.name;
  const others = c.participants.filter((p) => p.id !== meId && p.active);
  if (!others.length) return "Just you";
  return others.map((o) => o.displayName).join(", ");
}

function ConvAvatar({ c, meId, size = 48 }: { c: ConversationDTO; meId: string; size?: number }) {
  const others = c.participants.filter((p) => p.id !== meId && p.active);
  if (c.kind === "GROUP" && others.length > 1) {
    return (
      <span className="relative inline-block shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
        <span className="absolute left-0 top-0 h-full w-1/2 overflow-hidden"><Avatar user={others[0]} size={size} className="-ml-[25%]" /></span>
        <span className="absolute right-0 top-0 h-full w-1/2 overflow-hidden border-l-2 border-bg"><Avatar user={others[1]} size={size} className="-ml-[25%]" /></span>
      </span>
    );
  }
  return <Avatar user={others[0] ?? null} size={size} />;
}

// =============================================================== layout
export function MessagesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const listRoute = pathname === "/messages" || pathname === "/messages/requests";
  return (
    <div className="flex min-h-dvh">
      <section aria-label="Conversations" className={clsx("w-full min-w-0 border-line md:w-[390px] md:shrink-0 md:border-r", !listRoute && "max-md:hidden")}>
        {pathname === "/messages/requests" ? <RequestsList /> : <Inbox />}
      </section>
      <section aria-label="Conversation" className={clsx("min-w-0 flex-1", listRoute && "max-md:hidden")}>
        {children}
      </section>
    </div>
  );
}

export function SelectConversation() {
  return (
    <div className="hidden h-full items-center justify-center md:flex">
      <EmptyState title="You don’t have a message selected" body="Choose one from your existing messages, or start a new one." action={<Link href="/messages/compose"><Button size="lg">New message</Button></Link>} />
    </div>
  );
}

function Inbox() {
  const realtime = useRealtimeConnected();
  const s = useSession();
  const pathname = usePathname();
  const visible = useVisible();
  const q = useQuery({ queryKey: ["conversations", "inbox"], queryFn: () => get<ConversationDTO[]>("/conversations?box=inbox"), refetchInterval: visible ? (realtime ? INBOX_POLL_FALLBACK_MS : INBOX_POLL_MS) : false });
  const requests = useQuery({ queryKey: ["conversations", "requests"], queryFn: () => get<ConversationDTO[]>("/conversations?box=requests"), refetchInterval: visible ? (realtime ? INBOX_POLL_FALLBACK_MS : INBOX_POLL_MS) : false });
  return (
    <div>
      <PageHeader
        title="Messages"
        topLevel
        right={
          <div className="flex">
            <Link href="/settings/privacy_and_safety#messages" aria-label="Message settings" className="grid h-[34px] w-[34px] place-items-center rounded-full text-accent-text hover:bg-accent-soft"><Settings size={20} /></Link>
            <Link href="/messages/compose" aria-label="New message" className="grid h-[34px] w-[34px] place-items-center rounded-full text-accent-text hover:bg-accent-soft"><MailPlus size={20} /></Link>
          </div>
        }
      />
      {!!requests.data?.length && (
        <Link href="/messages/requests" className="flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-hover">
          <span className="grid h-12 w-12 place-items-center rounded-full border border-line-strong text-accent-text"><MailPlus size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Message requests</span>
            <span className="block text-sm text-fg2">{requests.data.length} pending request{requests.data.length === 1 ? "" : "s"}</span>
          </span>
        </Link>
      )}
      {q.isPending && <UserSkeleton count={5} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="Send a message, get a message" body="Direct Messages are private conversations between you and other people on iSchoolie." action={<Link href="/messages/compose"><Button size="lg">Start a conversation</Button></Link>} />}
      <ul>
        {q.data?.map((c) => <ConversationRow key={c.id} c={c} meId={s.actor.id} active={pathname.startsWith(`/messages/${c.id}`)} />)}
      </ul>
    </div>
  );
}

function ConversationRow({ c, meId, active }: { c: ConversationDTO; meId: string; active: boolean }) {
  const others = c.participants.filter((p) => p.id !== meId && p.active);
  const lm = c.lastMessage;
  const unread = c.unreadCount > 0;
  const preview = lm ? (lm.kind === "SYSTEM" ? `${lm.senderId === meId ? "You" : c.participants.find((p) => p.id === lm.senderId)?.displayName ?? "Someone"} ${lm.text}` : `${lm.senderId === meId ? "You: " : ""}${lm.text || (lm.hasMedia ? "Sent an attachment" : "")}`) : "No messages yet";
  return (
    <li>
      <Link href={`/messages/${c.id}`} aria-current={active ? "page" : undefined} className={clsx("flex gap-3 border-r-2 px-4 py-3 hover:bg-hover", active ? "border-accent bg-subtle" : "border-transparent")}>
        <ConvAvatar c={c} meId={meId} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span className={clsx("truncate", unread ? "font-extrabold" : "font-bold")}>{convTitle(c, meId)}</span>
            {c.kind === "DIRECT" && others[0] && <span className="truncate text-fg2">@{others[0].handle}</span>}
            {lm && <span className="ml-auto shrink-0 pl-1 text-sm text-fg2">{relativeTime(lm.createdAt)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx("truncate", unread ? "font-bold text-fg" : "text-fg2")}>{preview}</span>
            {c.muted && <BellOff size={14} className="shrink-0 text-fg2" aria-label="Muted" />}
            {unread && <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label={`${c.unreadCount} unread`} />}
          </div>
        </div>
      </Link>
    </li>
  );
}

function RequestsList() {
  const s = useSession();
  const q = useQuery({ queryKey: ["conversations", "requests"], queryFn: () => get<ConversationDTO[]>("/conversations?box=requests") });
  return (
    <div>
      <PageHeader title="Message requests" back="/messages" />
      <p className="border-b border-line px-4 py-3 text-sm text-fg2">Messages from people you don’t follow land here. They won’t know you’ve seen their request until you accept it.</p>
      {q.isPending && <UserSkeleton count={3} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="Message requests" body="You don’t have any message requests." />}
      <ul>{q.data?.map((c) => <ConversationRow key={c.id} c={c} meId={s.actor.id} active={false} />)}</ul>
    </div>
  );
}

// =========================================================== conversation
interface LocalMsg {
  clientKey: string;
  text: string;
  media: MediaDTO[];
  sharedPostId: string | null;
  status: "pending" | "failed";
  error?: string;
  createdAt: string;
}

export function ConversationView({ id }: { id: string }) {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const dialogs = useDialogs();
  const visible = useVisible();
  const conv = useQuery({ queryKey: ["conversation", id], queryFn: () => get<ConversationDTO>(`/conversations/${id}`), refetchInterval: visible ? THREAD_POLL_MS * 3 : false });
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalMsg[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastSeen = useRef<string | null>(null);

  // Initial history.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setLocal([]);
    get<{ items: MessageDTO[]; hasMore: boolean }>(`/conversations/${id}/messages`)
      .then((r) => {
        if (cancelled) return;
        setMessages(r.items);
        setHasMore(r.hasMore);
        lastSeen.current = r.items.at(-1)?.createdAt ?? null;
        setLoadError(null);
      })
      .catch((e) => !cancelled && setLoadError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // New messages arrive through the realtime stream (Postgres LISTEN/NOTIFY → SSE).
  // Polling remains as a fallback: 4 s while the stream is down, 30 s while it's up.
  const realtime = useRealtimeConnected();
  useEffect(() => {
    if (!visible || loading || loadError) return;
    const tick = async () => {
      try {
        const after = lastSeen.current ?? new Date(0).toISOString();
        const r = await get<{ items: MessageDTO[] }>(`/conversations/${id}/messages?after=${encodeURIComponent(after)}`);
        if (r.items.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...r.items.filter((m) => !seen.has(m.id))];
          });
          setLocal((prev) => prev.filter((l) => !r.items.some((m) => m.clientKey === l.clientKey)));
          lastSeen.current = r.items.at(-1)!.createdAt;
        }
      } catch {
        /* transient: next tick retries */
      }
    };
    // Reactions/edits to already-loaded messages: refresh the latest page in place.
    const refreshLatest = async () => {
      try {
        const r = await get<{ items: MessageDTO[] }>(`/conversations/${id}/messages`);
        const byId = new Map(r.items.map((m) => [m.id, m]));
        setMessages((prev) => prev.map((m) => byId.get(m.id) ?? m));
      } catch {
        /* ignore */
      }
    };
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ type: string; conversationId?: string }>).detail;
      if (d.conversationId !== id) return;
      if (d.type === "message") void tick();
      if (d.type === "conversation") void refreshLatest();
    };
    window.addEventListener(REALTIME_EVENT, onEvent);
    void tick(); // catch up on anything sent while the stream (re)connected
    const t = setInterval(tick, realtime ? THREAD_POLL_FALLBACK_MS : THREAD_POLL_MS);
    return () => {
      clearInterval(t);
      window.removeEventListener(REALTIME_EVENT, onEvent);
    };
  }, [id, visible, loading, loadError, realtime]);

  // Mark read when visible and there are messages.
  const newestIncoming = [...messages].reverse().find((m) => m.sender.id !== s.actor.id)?.id;
  useEffect(() => {
    if (!visible || !newestIncoming || conv.data?.status !== "ACCEPTED") return;
    post(`/conversations/${id}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ["conversations", "inbox"] });
      qc.invalidateQueries({ queryKey: ["badges"] });
    }).catch(() => {});
  }, [newestIncoming, visible, id, qc, conv.data?.status]);

  // Keep scrolled to the bottom when new messages arrive (unless reading history).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, local.length, loading]);
  // Images and videos finish loading after the first scroll; stay pinned to the newest
  // message while content grows, unless the reader has scrolled up into history.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      ro.disconnect();
      for (const child of Array.from(el.children)) ro.observe(child);
    });
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [loading]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const el = scroller.current;
    const prevH = el?.scrollHeight ?? 0;
    const r = await get<{ items: MessageDTO[]; hasMore: boolean }>(`/conversations/${id}/messages?before=${encodeURIComponent(first.createdAt)}`);
    stick.current = false;
    setMessages((prev) => [...r.items, ...prev]);
    setHasMore(r.hasMore);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH;
    });
  };

  const send = async (m: LocalMsg) => {
    setLocal((prev) => [...prev.filter((x) => x.clientKey !== m.clientKey), { ...m, status: "pending", error: undefined }]);
    stick.current = true;
    try {
      const saved = await post<MessageDTO>(`/conversations/${id}/messages`, { text: m.text, mediaIds: m.media.map((x) => x.id), sharedPostId: m.sharedPostId, clientKey: m.clientKey });
      setMessages((prev) => (prev.some((x) => x.id === saved.id) ? prev : [...prev, saved]));
      setLocal((prev) => prev.filter((x) => x.clientKey !== m.clientKey));
      if (!lastSeen.current || saved.createdAt > lastSeen.current) lastSeen.current = saved.createdAt;
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", id] });
    } catch (e) {
      // Failed: keep it with the same client key so a retry can't create a duplicate.
      setLocal((prev) => prev.map((x) => (x.clientKey === m.clientKey ? { ...x, status: "failed", error: errorMessage(e) } : x)));
    }
  };

  const respond = useMutation({
    mutationFn: (action: "accept" | "delete") => post(`/conversations/${id}/request`, { action }),
    onSuccess: (_r, action) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      if (action === "delete") router.push("/messages/requests");
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });

  if (conv.isError) {
    return (
      <div>
        <PageHeader title="Conversation" back="/messages" />
        {conv.error instanceof ApiError && conv.error.status === 404 ? <EmptyState title="This conversation isn’t available" body="It may have been deleted, or you’re no longer a member." /> : <ErrorState message={errorMessage(conv.error)} onRetry={() => conv.refetch()} />}
      </div>
    );
  }
  const c = conv.data;
  const others = c?.participants.filter((p) => p.id !== s.actor.id && p.active) ?? [];
  const lastOwn = [...messages].reverse().find((m) => m.sender.id === s.actor.id && m.kind === "TEXT");
  // "Seen" belongs under the viewer's message only when it is the latest message.
  const lastIsOwn = !!lastOwn && messages.at(-1)?.id === lastOwn.id;
  const seenBy = c && lastOwn && lastIsOwn ? c.readBy.filter((r) => r.lastReadAt >= lastOwn.createdAt) : [];
  return (
    <div className="flex h-dvh flex-col max-sm:h-[100dvh]">
      <PageHeader
        back="/messages"
        title={c ? (
          <span className="flex items-center gap-2">
            <span className="sm:hidden"><ConvAvatar c={c} meId={s.actor.id} size={28} /></span>
            <span className="truncate">{convTitle(c, s.actor.id)}</span>
          </span>
        ) : "…"}
        subtitle={c?.kind === "DIRECT" && others[0] ? `@${others[0].handle}` : c ? `${others.length + 1} people` : undefined}
        right={c && <Link href={`/messages/${id}/info`} aria-label="Conversation info" className="grid h-[34px] w-[34px] place-items-center rounded-full text-accent-text hover:bg-accent-soft"><Info size={20} /></Link>}
      />
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
        role="log"
        aria-label="Messages"
        aria-live="polite"
      >
        {loading && <Spinner className="py-8" />}
        {loadError && <ErrorState message={loadError} onRetry={() => router.refresh()} />}
        {hasMore && !loading && (
          <div className="flex justify-center py-2">
            <Button size="sm" variant="ghost" onClick={loadOlder}>Load older messages</Button>
          </div>
        )}
        {c?.kind === "DIRECT" && others[0] && !hasMore && !loading && (
          <Link href={`/${others[0].handle}`} className="mb-4 flex flex-col items-center gap-1 border-b border-line py-6 text-center hover:bg-hover">
            <Avatar user={others[0]} size={64} />
            <DisplayName user={others[0]} />
            <span className="text-fg2">@{others[0].handle}</span>
          </Link>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={m.id} m={m} mine={m.sender.id === s.actor.id} group={c?.kind === "GROUP"} showDate={!messages[i - 1] || new Date(m.createdAt).toDateString() !== new Date(messages[i - 1].createdAt).toDateString()} onHidden={() => setMessages((prev) => prev.filter((x) => x.id !== m.id))} onReplace={(nm) => setMessages((prev) => prev.map((x) => (x.id === nm.id ? nm : x)))} onReport={() => dialogs.report({ type: "MESSAGE", id: m.id, label: "message" })} />
        ))}
        {seenBy.length > 0 && local.length === 0 && <p className="text-right text-xs text-fg2">Seen</p>}
        {local.map((l) => (
          <div key={l.clientKey} className="my-1 flex flex-col items-end">
            <div className={clsx("max-w-[80%] rounded-3xl rounded-br-md px-4 py-2.5 break-anywhere", l.status === "failed" ? "bg-like-soft text-fg" : "bg-accent text-accent-on opacity-70")}>
              {l.text && <span className="whitespace-pre-wrap">{l.text}</span>}
              {l.media.length > 0 && <span className="block text-sm">{l.media.length} attachment</span>}
            </div>
            {l.status === "pending" ? (
              <span className="text-xs text-fg2">Sending…</span>
            ) : (
              <span className="flex items-center gap-2 text-xs text-danger" role="alert">
                <AlertCircle size={14} /> {l.error ?? "Failed to send"}
                <button type="button" className="font-bold underline" onClick={() => send(l)}>Retry</button>
                <button type="button" className="underline" onClick={() => setLocal((p) => p.filter((x) => x.clientKey !== l.clientKey))}>Delete</button>
              </span>
            )}
          </div>
        ))}
      </div>
      {c && c.status === "REQUEST" ? (
        <div className="border-t border-line p-4 text-center">
          <p className="text-sm text-fg2">Do you want to let {others[0]?.displayName ?? "them"} message you? They won’t know you’ve seen their message until you accept.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="danger-outline" onClick={() => respond.mutate("delete")}>Delete</Button>
            <Button variant="neutral" onClick={() => dialogs.report({ type: "MESSAGE", id: messages.at(-1)?.id ?? "", label: "message request" })} disabled={!messages.length}>Report</Button>
            <Button onClick={() => respond.mutate("accept")}>Accept</Button>
          </div>
        </div>
      ) : c && !c.canSend ? (
        <p className="border-t border-line px-4 py-4 text-center text-fg2">{c.sendRestriction}</p>
      ) : c ? (
        <MessageComposer key={id} conversationId={id} initialDraft={c.draft} onSend={(m) => send(m)} />
      ) : null}
    </div>
  );
}

const REACTIONS = ["😂", "😲", "😢", "❤️", "🔥", "👍", "👎"];

function MessageBubble({ m, mine, group, showDate, onHidden, onReplace, onReport }: { m: MessageDTO; mine: boolean; group: boolean; showDate: boolean; onHidden: () => void; onReplace: (m: MessageDTO) => void; onReport: () => void }) {
  const toast = useToast();
  const s = useSession();
  const [confirm, setConfirm] = useState(false);
  // On touch screens actions appear after tapping the bubble (desktop: on hover/focus).
  const [showActions, setShowActions] = useState(false);
  const myReaction = m.reactions.find((r) => r.userId === s.actor.id)?.emoji ?? null;
  const react = async (emoji: string | null) => {
    try {
      onReplace(await put<MessageDTO>(`/messages/${m.id}/reaction`, { emoji }));
    } catch (e) {
      toast({ text: errorMessage(e), tone: "error" });
    }
  };
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of m.reactions) map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
    return [...map];
  }, [m.reactions]);
  return (
    <>
      {showDate && <p className="my-3 text-center text-xs text-fg2">{new Date(m.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>}
      {m.kind === "SYSTEM" ? (
        <p className="my-2 text-center text-sm text-fg2">{mine ? "You" : m.sender.displayName} {m.text}</p>
      ) : (
        <div className={clsx("group my-1 flex items-end gap-2", mine ? "flex-row-reverse" : "flex-row")} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,video")) setShowActions((v) => !v); }}>
          {!mine && <Avatar user={m.sender} size={32} />}
          <div className={clsx("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
            {group && !mine && <span className="mb-0.5 text-xs text-fg2">{m.sender.displayName}</span>}
            {m.media.map((media) => (
              <div key={media.id} className="mb-1 w-[min(320px,70vw)]">
                {media.kind === "VIDEO" ? <VideoPlayer media={media} /> : media.kind === "GIF" ? <GifPlayer media={media} /> : (
                  <a href={media.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-card border border-line">
                    <img src={media.thumbUrl ?? media.url} alt={media.alt} className="w-full object-cover" style={media.width && media.height ? { aspectRatio: `${media.width} / ${media.height}` } : undefined} />
                  </a>
                )}
              </div>
            ))}
            {m.sharedPost && <div className="mb-1 w-[min(360px,70vw)]"><QuotedPost quoted={m.sharedPost} /></div>}
            {m.text && (
              <div className={clsx("rounded-3xl px-4 py-2.5 break-anywhere", mine ? "rounded-br-md bg-accent text-accent-on [&_a]:text-accent-on [&_a]:underline" : "rounded-bl-md bg-subtle")}>
                <RichText text={m.text} />
              </div>
            )}
            {counts.length > 0 && (
              <div className="mt-0.5 flex gap-1">
                {counts.map(([e, n]) => (
                  <button key={e} type="button" onClick={() => react(myReaction === e ? null : e)} aria-label={`${e} reaction, ${n}${myReaction === e ? ", yours — click to remove" : ""}`} className={clsx("rounded-full border px-1.5 text-sm", myReaction === e ? "border-accent bg-accent-soft" : "border-line-strong")}>
                    {e} {n > 1 && n}
                  </button>
                ))}
              </div>
            )}
            <span className="mt-0.5 text-xs text-fg2" title={new Date(m.createdAt).toLocaleString()}>{relativeTime(m.createdAt)}</span>
          </div>
          <div className={clsx("items-center gap-1 self-center sm:flex sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100", showActions ? "flex" : "hidden")}>
            <Menu label="React" align="center" trigger={<button type="button" aria-label="React to message" className="grid h-8 w-8 place-items-center rounded-full text-fg2 hover:bg-accent-soft hover:text-accent-text"><Smile size={18} /></button>}>
              <div className="flex gap-1 px-2 py-1" role="group" aria-label="Reactions">
                {REACTIONS.map((e) => (
                  <button key={e} type="button" onClick={() => react(myReaction === e ? null : e)} aria-label={`React with ${e}`} aria-pressed={myReaction === e} className={clsx("grid h-9 w-9 place-items-center rounded-full text-xl hover:bg-hover-strong", myReaction === e && "bg-accent-soft")}>
                    {e}
                  </button>
                ))}
              </div>
            </Menu>
            <Menu label="More" trigger={<button type="button" aria-label="More message actions" className="grid h-8 w-8 place-items-center rounded-full text-fg2 hover:bg-accent-soft hover:text-accent-text"><MoreHorizontal size={18} /></button>}>
              {m.text && <MenuItem icon={<Copy />} onSelect={() => navigator.clipboard.writeText(m.text).then(() => toast({ text: "Copied to clipboard" }), () => toast({ text: "Couldn’t copy.", tone: "error" }))}>Copy message text</MenuItem>}
              <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm(true)}>Delete for you</MenuItem>
              {!mine && <MenuItem icon={<Flag />} onSelect={onReport}>Report message</MenuItem>}
            </Menu>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete message?"
        body="This message will be deleted for you. Other people in the conversation will still be able to see it."
        confirmLabel="Delete for me"
        danger
        onConfirm={async () => {
          setConfirm(false);
          try {
            await del(`/messages/${m.id}`);
            onHidden();
          } catch (e) {
            toast({ text: errorMessage(e), tone: "error" });
          }
        }}
      />
    </>
  );
}

function MessageComposer({ conversationId, initialDraft, onSend }: { conversationId: string; initialDraft: string; onSend: (m: LocalMsg) => void }) {
  const [text, setText] = useState(initialDraft);
  const [media, setMedia] = useState<MediaDTO | null>(null);
  const [uploading, setUploading] = useState<{ progress: number; abort: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gif, setGif] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  // Preserve the unsent draft per conversation (server-side), debounced.
  useEffect(() => {
    if (text === initialDraft) return;
    const t = setTimeout(() => patch(`/conversations/${conversationId}`, { draft: text }).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [text, conversationId, initialDraft]);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);
  const canSend = (text.trim().length > 0 || !!media) && !uploading;
  const submit = () => {
    if (!canSend) return;
    onSend({ clientKey: newClientKey(), text, media: media ? [media] : [], sharedPostId: null, status: "pending", createdAt: new Date().toISOString() });
    setText("");
    setMedia(null);
    patch(`/conversations/${conversationId}`, { draft: "" }).catch(() => {});
  };
  return (
    <div className="safe-bottom border-t border-line bg-bg px-3 py-2">
      {error && <p className="mb-1 text-sm text-danger" role="alert">{error}</p>}
      {(media || uploading) && (
        <div className="relative mb-2 w-[160px] overflow-hidden rounded-card border border-line">
          {media ? (
             
            media.kind === "VIDEO" ? <video src={media.url} className="w-full" muted /> : <img src={media.thumbUrl ?? media.url} alt={media.alt || "Attachment"} className="w-full" />
          ) : (
            <div className="grid h-24 place-items-center text-sm text-fg2">Uploading {Math.round((uploading?.progress ?? 0) * 100)}%</div>
          )}
          <button type="button" aria-label="Remove attachment" onClick={() => { uploading?.abort(); setUploading(null); setMedia(null); }} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"><X size={14} /></button>
        </div>
      )}
      <div className="flex items-end gap-1">
        <input
          ref={file}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setError(null);
            const fields: Record<string, string> = { scope: "MESSAGE" };
            const extra: Record<string, Blob> = {};
            if (f.type.startsWith("video/")) {
              const info = await inspectVideo(f);
              if (info.width) fields.width = String(info.width);
              if (info.height) fields.height = String(info.height);
              if (info.durationMs) fields.durationMs = String(info.durationMs);
              if (info.poster) extra.poster = info.poster;
            }
            const { promise, abort } = uploadFile<MediaDTO>(f, fields, (p) => setUploading((u) => (u ? { ...u, progress: p } : u)), extra);
            setUploading({ progress: 0, abort });
            promise.then((m) => setMedia(m)).catch((err: ApiError) => err.code !== "ABORTED" && setError(err.message)).finally(() => setUploading(null));
          }}
        />
        <button type="button" aria-label="Add photo or video" disabled={!!media || !!uploading} onClick={() => file.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent-text hover:bg-accent-soft disabled:opacity-40"><ImageIcon size={20} /></button>
        <button type="button" aria-label="Add a GIF" disabled={!!media || !!uploading} onClick={() => setGif(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent-text hover:bg-accent-soft disabled:opacity-40"><span className="rounded border-2 border-current px-0.5 text-[0.625rem] font-extrabold leading-none">GIF</span></button>
        <div className="flex min-w-0 flex-1 items-end rounded-3xl border border-line-strong px-3 focus-within:border-accent-text">
          <label htmlFor="dm-input" className="sr-only">Start a new message</label>
          <textarea
            id="dm-input"
            ref={ta}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Start a new message"
            className="min-w-0 flex-1 resize-none bg-transparent py-2 outline-none"
          />
          <EmojiPicker onPick={(em) => setText((t) => t + em)} trigger={<button type="button" aria-label="Emoji" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent-text hover:bg-accent-soft"><Smile size={20} /></button>} />
        </div>
        <button type="button" aria-label="Send" disabled={!canSend} onClick={submit} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent-text hover:bg-accent-soft disabled:opacity-40"><SendHorizontal size={20} /></button>
      </div>
      <GifPicker
        open={gif}
        onClose={() => setGif(false)}
        onPick={async (f) => {
          setGif(false);
          try {
            setMedia(await post<MediaDTO>("/gifs", { file: f, scope: "MESSAGE" }));
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

// ================================================================ info
export function ConversationInfo({ id }: { id: string }) {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const dialogs = useDialogs();
  const q = useQuery({ queryKey: ["conversation", id], queryFn: () => get<ConversationDTO>(`/conversations/${id}`) });
  const media = useQuery({ queryKey: ["conversation-media", id], queryFn: () => get<MediaDTO[]>(`/conversations/${id}/media`) });
  const [name, setName] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const results = useQuery({ queryKey: ["dm-recipients", search], queryFn: () => get<{ user: UserDTO; canMessage: boolean; reason: string | null }[]>(`/dm/recipients?q=${encodeURIComponent(search)}`), enabled: adding });
  const update = useMutation({
    mutationFn: (body: { name?: string | null; muted?: boolean }) => patch<ConversationDTO>(`/conversations/${id}`, body),
    onSuccess: (c) => {
      qc.setQueryData(["conversation", id], c);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setName(null);
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const members = useMutation({
    mutationFn: ({ handle, add }: { handle: string; add: boolean }) => (add ? post<ConversationDTO>(`/conversations/${id}/members`, { handles: [handle] }) : del<ConversationDTO>(`/conversations/${id}/members/${handle}`)),
    onSuccess: (c) => {
      qc.setQueryData(["conversation", id], c);
      toast({ text: "Group updated" });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const leave = useMutation({
    mutationFn: () => del(`/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast({ text: q.data?.kind === "GROUP" ? "You left the group" : "Conversation removed from your inbox" });
      router.push("/messages");
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  if (q.isPending) return <div><PageHeader title="Conversation info" back={`/messages/${id}`} /><Spinner className="py-8" /></div>;
  if (q.isError) return <div><PageHeader title="Conversation info" back="/messages" /><ErrorState message={errorMessage(q.error)} /></div>;
  const c = q.data;
  const other = c.kind === "DIRECT" ? c.participants.find((p) => p.id !== s.actor.id) : null;
  return (
    <div>
      <PageHeader title={c.kind === "GROUP" ? "Group info" : "Conversation info"} back={`/messages/${id}`} />
      {c.kind === "GROUP" && (
        <div className="border-b border-line px-4 py-4">
          {name === null ? (
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-subtle text-fg2"><Users size={22} /></span>
              <span className="min-w-0 flex-1 font-bold break-anywhere">{c.name ?? "Unnamed group"}</span>
              <Button size="sm" variant="outline" onClick={() => setName(c.name ?? "")}><Pencil size={14} /> Edit</Button>
            </div>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ name }); }}>
              <label htmlFor="group-name" className="sr-only">Group name</label>
              <input id="group-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} className="h-10 min-w-0 flex-1 rounded border border-line-strong bg-transparent px-3 outline-none focus:border-accent-text" />
              <Button type="submit" size="sm">Save</Button>
              <Button size="sm" variant="neutral" onClick={() => setName(null)}>Cancel</Button>
            </form>
          )}
        </div>
      )}
      <Toggle label="Snooze notifications" description="Hide this conversation’s unread badge." checked={c.muted} onChange={(v) => update.mutate({ muted: v })} icon={c.muted ? <BellOff size={18} /> : <Bell size={18} />} />
      <h2 className="border-t border-line px-4 pb-2 pt-4 text-heading font-extrabold">People</h2>
      <ul>
        {c.participants.filter((p) => p.active).map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2">
            <Link href={`/${p.handle}`}><Avatar user={p} size={40} /></Link>
            <Link href={`/${p.handle}`} className="min-w-0 flex-1">
              <DisplayName user={p} />
              <div className="text-sm text-fg2">@{p.handle}{p.role === "ADMIN" && c.kind === "GROUP" ? " · Admin" : ""}{p.id === s.actor.id ? " · You" : ""}</div>
            </Link>
            {c.kind === "GROUP" && c.viewerRole === "ADMIN" && p.id !== s.actor.id && (
              <Button size="sm" variant="danger-outline" onClick={() => members.mutate({ handle: p.handle, add: false })}>Remove</Button>
            )}
          </li>
        ))}
      </ul>
      {c.kind === "GROUP" && (
        <div className="px-4 pb-3">
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 py-2 text-accent-text hover:underline"><UserPlus size={18} /> Add people</button>
          ) : (
            <div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" aria-label="Search people to add" className="h-10 w-full rounded-full bg-input px-4 outline-none" autoFocus />
              {results.data?.filter((r) => !c.participants.some((p) => p.id === r.user.id && p.active)).map((r) => (
                <div key={r.user.id} className="flex items-center gap-3 py-2">
                  <Avatar user={r.user} size={32} />
                  <span className="min-w-0 flex-1"><DisplayName user={r.user} /> <span className="text-sm text-fg2">@{r.user.handle}</span></span>
                  <Button size="sm" variant="outline" disabled={!r.canMessage || members.isPending} title={r.reason ?? undefined} onClick={() => members.mutate({ handle: r.user.handle, add: true })}>Add</Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-fg2">Any member can add people or rename the group. Only the admin can remove people.</p>
        </div>
      )}
      <h2 className="border-t border-line px-4 pb-2 pt-4 text-heading font-extrabold">Shared media</h2>
      {media.data?.length === 0 && <p className="px-4 pb-4 text-fg2">Photos and videos shared in this conversation will appear here.</p>}
      <div className="grid grid-cols-3 gap-1 px-4 pb-4">
        {media.data?.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="aspect-square overflow-hidden rounded bg-subtle">
            {m.kind === "VIDEO" ? <video src={m.url} className="h-full w-full object-cover" muted /> : <img src={m.thumbUrl ?? m.url} alt={m.alt} className="h-full w-full object-cover" />}
          </a>
        ))}
      </div>
      <div className="border-t border-line">
        {other && <button type="button" onClick={() => setConfirmBlock(true)} className="flex w-full items-center gap-3 px-4 py-4 text-left text-danger hover:bg-like-soft"><Ban size={18} /> Block @{other.handle}</button>}
        {other && <button type="button" onClick={() => dialogs.report({ type: "USER", id: other.id, label: `@${other.handle}` })} className="flex w-full items-center gap-3 px-4 py-4 text-left text-danger hover:bg-like-soft"><Flag size={18} /> Report @{other.handle}</button>}
        <button type="button" onClick={() => setConfirmLeave(true)} className="flex w-full items-center gap-3 px-4 py-4 text-left text-danger hover:bg-like-soft">
          <LogOut size={18} /> {c.kind === "GROUP" ? "Leave group" : "Delete conversation"}
        </button>
      </div>
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={c.kind === "GROUP" ? "Leave group?" : "Delete conversation?"}
        body={c.kind === "GROUP" ? "You won’t get messages from this group anymore. Others will see that you left." : "This conversation will be removed from your inbox. Other people in the conversation will still be able to see it."}
        confirmLabel={c.kind === "GROUP" ? "Leave" : "Delete"}
        danger
        busy={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={`Block @${other?.handle}?`}
        body="They won’t be able to message you, follow you or see your posts."
        confirmLabel="Block"
        danger
        onConfirm={async () => {
          setConfirmBlock(false);
          try {
            await put(`/users/${other!.handle}/block`);
            qc.invalidateQueries();
            toast({ text: `You blocked @${other!.handle}` });
          } catch (e) {
            toast({ text: errorMessage(e), tone: "error" });
          }
        }}
      />
    </div>
  );
}

function Toggle({ label, description, checked, onChange, icon }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void; icon: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
      <span className="text-fg2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        <span className="block text-sm text-fg2">{description}</span>
      </span>
      <span className={clsx("relative h-6 w-[42px] shrink-0 rounded-full", checked ? "bg-accent" : "bg-line-strong")}>
        <span className={clsx("absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[20px]" : "translate-x-[2px]")} />
      </span>
    </button>
  );
}

// ============================================================ new message
export function NewMessage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<UserDTO[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const results = useQuery({ queryKey: ["dm-recipients", q], queryFn: () => get<{ user: UserDTO; canMessage: boolean; reason: string | null }[]>(`/dm/recipients?q=${encodeURIComponent(q)}`) });
  const start = useMutation({
    mutationFn: () => post<ConversationDTO>("/conversations", { handles: selected.map((u) => u.handle), name: selected.length > 1 ? name || null : null }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      router.replace(`/messages/${c.id}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <div>
      <PageHeader title="New message" back="/messages" right={<Button size="sm" disabled={!selected.length || start.isPending} onClick={() => start.mutate()}>{start.isPending ? "Starting…" : "Next"}</Button>} />
      <div className="border-b border-line px-4 py-2">
        <label htmlFor="recipient-search" className="sr-only">Search people</label>
        <input id="recipient-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="h-10 w-full bg-transparent outline-none" autoFocus />
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {selected.map((u) => (
              <button key={u.id} type="button" onClick={() => setSelected((s) => s.filter((x) => x.id !== u.id))} aria-label={`Remove ${u.displayName}`} className="flex items-center gap-1 rounded-full border border-line-strong py-0.5 pl-0.5 pr-3 font-bold hover:bg-hover-strong">
                <Avatar user={u} size={22} /> {u.displayName} <X size={14} />
              </button>
            ))}
          </div>
        )}
        {selected.length > 1 && (
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Group name (optional)" aria-label="Group name" className="mb-2 h-10 w-full rounded border border-line-strong bg-transparent px-3 outline-none focus:border-accent-text" />
        )}
      </div>
      {error && <p className="px-4 py-2 text-danger" role="alert">{error}</p>}
      {results.isPending && <UserSkeleton count={4} />}
      {results.data?.length === 0 && <p className="px-4 py-6 text-center text-fg2">{q ? `No people match “${q}”.` : "Search for people to message."}</p>}
      <ul>
        {results.data?.map((r) => {
          const chosen = selected.some((x) => x.id === r.user.id);
          return (
            <li key={r.user.id}>
              <button type="button" disabled={!r.canMessage} onClick={() => setSelected((s) => (chosen ? s.filter((x) => x.id !== r.user.id) : [...s, r.user]))} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover disabled:opacity-50">
                <Avatar user={r.user} size={48} />
                <div className="min-w-0 flex-1">
                  <DisplayName user={r.user} />
                  <div className="text-sm text-fg2">@{r.user.handle}{r.reason ? ` · ${r.reason}` : ""}</div>
                </div>
                {chosen && <Check size={20} className="text-accent-text" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { RotateCcw };
