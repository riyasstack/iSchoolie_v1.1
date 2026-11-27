"use client";
/**
 * The one composer used inline (Home), in the desktop modal, and full-screen on phones.
 * Server rules are authoritative (src/lib/schemas.ts); the client mirrors them for
 * immediate feedback. A per-session client key makes retried submissions idempotent.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import clsx from "clsx";
import { Image as ImageIcon, Smile, BarChart2, CalendarClock, Plus, X, Globe, Users, AtSign, RotateCcw, Check } from "lucide-react";
import { useIsGuest, useReturnTo, useSession } from "@/components/providers";
import { Avatar, DisplayName, Menu, MenuItem } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, del, get, newClientKey, patch, post, put, uploadFile, errorMessage, ApiError } from "@/lib/api";
import { parsePostText, POST_MAX, ALT_MAX, POLL_CHOICE_MAX, graphemeLength } from "@/lib/text";
import { formatInZone } from "@/lib/format";
import { inspectVideo } from "@/lib/video";
import { seedPosts, postKey, isPost } from "../posts/cache";
import { QuotedPost, postPath } from "../posts/post-card";
import { RichText } from "../posts/rich-text";
import { EmojiPicker, GifPicker, SchedulePicker, type ScheduleValue } from "./pickers";
import type { ComposePayload, DraftDTO, MediaDTO, PostDTO, ReplyAudience, ScheduledDTO, TimelinePage, UserDTO } from "@/lib/types";

// --------------------------------------------------------------------- model
interface Upload {
  localId: string;
  file?: File;
  preview: string;
  kind: "IMAGE" | "GIF" | "VIDEO";
  status: "uploading" | "ready" | "failed";
  progress: number;
  media?: MediaDTO;
  error?: string;
  abort?: () => void;
  meta?: { width?: number; height?: number; durationMs?: number; poster?: Blob };
}

interface PollState {
  choices: string[];
  days: number;
  hours: number;
  minutes: number;
}

interface Item {
  key: string;
  text: string;
  uploads: Upload[];
  poll: PollState | null;
}

const newItem = (): Item => ({ key: newClientKey().slice(0, 8), text: "", uploads: [], poll: null });

function pollMinutes(p: PollState) {
  return p.days * 1440 + p.hours * 60 + p.minutes;
}

function itemErrors(it: Item): string | null {
  const parsed = parsePostText(it.text);
  if (!parsed.valid && !parsed.empty) return null; // counter shows it
  if (it.poll) {
    if (it.uploads.length) return "Polls can’t be combined with photos, GIFs or videos.";
    const filled = it.poll.choices.map((c) => c.trim());
    if (filled.filter(Boolean).length < 2 || filled.slice(0, 2).some((c) => !c)) return "Fill in at least the first two poll choices.";
    if (filled.some((c) => graphemeLength(c) > POLL_CHOICE_MAX)) return `Poll choices are limited to ${POLL_CHOICE_MAX} characters.`;
    const nonEmpty = filled.filter(Boolean).map((c) => c.toLowerCase());
    if (new Set(nonEmpty).size !== nonEmpty.length) return "Poll choices must be different.";
    const m = pollMinutes(it.poll);
    if (m < 5) return "Polls must last at least 5 minutes.";
    if (m > 7 * 1440) return "Polls can last up to 7 days.";
    if (parsed.empty) return "Add a question to your poll.";
  }
  return null;
}

function itemReady(it: Item) {
  const parsed = parsePostText(it.text);
  if (!parsed.valid) return false;
  if (parsed.empty && !it.uploads.length && !it.poll) return false;
  if (it.uploads.some((u) => u.status !== "ready")) return false;
  return !itemErrors(it);
}

function toPayload(items: Item[], audience: ReplyAudience, replyToId: string | null, quotedPostId: string | null): ComposePayload {
  return {
    items: items.map((it) => ({
      text: it.text,
      mediaIds: it.uploads.filter((u) => u.media).map((u) => u.media!.id),
      poll: it.poll ? { choices: it.poll.choices.map((c) => c.trim()).filter(Boolean), durationMinutes: pollMinutes(it.poll) } : null,
    })),
    replyAudience: audience,
    replyToId,
    quotedPostId,
  };
}

function hasContent(items: Item[]) {
  return items.some((it) => it.text.trim() || it.uploads.length || it.poll);
}

const RECOVERY_KEY = (actor: string) => `isc-unsent:${actor}`;

function readRecovery(actor: string): string | null {
  try {
    return localStorage.getItem(RECOVERY_KEY(actor));
  } catch {
    return null;
  }
}
function writeRecovery(actor: string, id: string | null) {
  try {
    if (id) localStorage.setItem(RECOVERY_KEY(actor), id);
    else localStorage.removeItem(RECOVERY_KEY(actor));
  } catch {
    /* storage unavailable: server draft remains the source of truth */
  }
}

// --------------------------------------------------------------- composer
export interface ComposerProps {
  mode: "inline" | "modal";
  replyToId?: string | null;
  quoteId?: string | null;
  draftId?: string | null;
  scheduledId?: string | null;
  onDone?: () => void;
  onCancel?: () => void;
  /** Lets the modal intercept close requests to confirm discarding. */
  registerClose?: (fn: () => void) => void;
  /** Show the post being replied to above the editor (off when it is already on screen). */
  showReplyContext?: boolean;
}

/** Guests can't post: show a sign-up call to action in place of the composer. */
export function Composer(props: ComposerProps) {
  const guest = useIsGuest();
  if (guest) return <GuestComposer reply={!!props.replyToId} modal={props.mode !== "inline"} />;
  return <MemberComposer {...props} />;
}

function GuestComposer({ reply, modal }: { reply: boolean; modal: boolean }) {
  const ret = useReturnTo();
  return (
    <div className={modal ? "px-6 py-8 text-center" : "mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong bg-bg px-4 py-3"} data-testid="guest-composer">
      <p className={modal ? "mb-4 text-fg2" : "text-fg2"}>{reply ? "Join iSchoolie or log in to reply." : "Join iSchoolie or log in to share with your campus."}</p>
      <div className={modal ? "flex justify-center gap-3" : "flex shrink-0 gap-2"}>
        <a href={`/signin${ret}`} className="inline-flex min-h-[34px] items-center rounded-xl border border-line-strong px-4 text-sm font-semibold text-fg hover:bg-hover-strong">Log in</a>
        <a href={`/signup${ret}`} className="inline-flex min-h-[34px] items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-on hover:bg-accent-hover">Join iSchoolie</a>
      </div>
    </div>
  );
}

function MemberComposer({ mode, replyToId = null, quoteId = null, draftId: initialDraftId = null, scheduledId = null, onDone, registerClose, showReplyContext = true }: ComposerProps) {
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [active, setActive] = useState(0);
  const [audience, setAudience] = useState<ReplyAudience>("EVERYONE");
  const [schedule, setSchedule] = useState<ScheduleValue | null>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(mode === "modal");
  const [gifOpen, setGifOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [recoverId, setRecoverId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!initialDraftId && !scheduledId);
  const clientKey = useRef(newClientKey());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>("");
  const fileInput = useRef<HTMLInputElement>(null);
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const replyTo = useQuery({ queryKey: postKey(replyToId ?? "none"), queryFn: () => get<PostDTO>(`/posts/${replyToId}`), enabled: !!replyToId });
  const quote = useQuery({ queryKey: postKey(quoteId ?? "none"), queryFn: () => get<PostDTO>(`/posts/${quoteId}`), enabled: !!quoteId });

  // Load a draft or scheduled post for editing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let payload: ComposePayload | null = null;
        let media: MediaDTO[] = [];
        if (initialDraftId) {
          const d = (await get<DraftDTO[]>("/drafts")).find((x) => x.id === initialDraftId);
          if (!d) throw new ApiError("NOT_FOUND", "That draft no longer exists.", 404);
          payload = d.payload;
          media = d.media;
        } else if (scheduledId) {
          const s = (await get<ScheduledDTO[]>("/scheduled")).find((x) => x.id === scheduledId);
          if (!s) throw new ApiError("NOT_FOUND", "That scheduled post no longer exists.", 404);
          payload = s.payload;
          media = s.media;
          setSchedule({ iso: s.scheduledFor, timezone: s.timezone });
        }
        if (cancelled || !payload) return;
        hydrate(payload, media);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
     
  }, [initialDraftId, scheduledId]);

  // Offer recovery of an autosaved, unsent post after a reload.
  useEffect(() => {
    if (initialDraftId || scheduledId || replyToId || quoteId) return;
    const id = readRecovery(session.actor.id);
    if (id) setRecoverId(id);
  }, [initialDraftId, scheduledId, replyToId, quoteId, session.actor.id]);

  function hydrate(payload: ComposePayload, media: MediaDTO[]) {
    const byId = new Map(media.map((m) => [m.id, m]));
    setItems(
      payload.items.map((it) => ({
        key: newClientKey().slice(0, 8),
        text: it.text,
        uploads: it.mediaIds
          .map((id) => byId.get(id))
          .filter((m): m is MediaDTO => !!m)
          .map((m) => ({ localId: m.id, preview: m.thumbUrl ?? m.url, kind: m.kind, status: "ready" as const, progress: 1, media: m })),
        poll: it.poll
          ? { choices: [...it.poll.choices, "", ""].slice(0, Math.max(2, it.poll.choices.length)), days: Math.floor(it.poll.durationMinutes / 1440), hours: Math.floor((it.poll.durationMinutes % 1440) / 60), minutes: it.poll.durationMinutes % 60 }
          : null,
      })),
    );
    setAudience(payload.replyAudience);
  }

  const payload = useMemo(() => toPayload(items, audience, replyToId, quoteId), [items, audience, replyToId, quoteId]);
  const dirty = hasContent(items);

  // Autosave to a server draft (debounced). Scheduled edits are not drafts.
  useEffect(() => {
    if (!loaded || scheduledId || submitting) return;
    if (!dirty) return;
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSaved.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const body = { payload: { ...payload, items: payload.items.map((i) => ({ ...i, poll: i.poll })) } };
        const d = draftId ? await put<DraftDTO>(`/drafts/${draftId}`, body) : await post<DraftDTO>("/drafts", body);
        lastSaved.current = snapshot;
        if (!draftId) setDraftId(d.id);
        writeRecovery(session.actor.id, d.id);
        qc.invalidateQueries({ queryKey: ["drafts"] });
      } catch {
        /* autosave is best-effort; content stays in the editor */
      }
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [payload, dirty, draftId, loaded, scheduledId, submitting, qc, session.actor.id]);

  const update = (idx: number, fn: (it: Item) => Item) => setItems((prev) => prev.map((it, i) => (i === idx ? fn(it) : it)));

  // ------------------------------------------------------------- media
  const startUpload = useCallback(
    (idx: number, up: Upload) => {
      if (!up.file) return;
      const fields: Record<string, string> = { scope: "POST" };
      if (up.meta?.width) fields.width = String(up.meta.width);
      if (up.meta?.height) fields.height = String(up.meta.height);
      if (up.meta?.durationMs) fields.durationMs = String(up.meta.durationMs);
      const { promise, abort } = uploadFile<MediaDTO>(up.file, fields, (f) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, uploads: it.uploads.map((u) => (u.localId === up.localId ? { ...u, progress: f } : u)) } : it))),
        up.meta?.poster ? { poster: up.meta.poster } : {},
      );
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, uploads: it.uploads.map((u) => (u.localId === up.localId ? { ...u, status: "uploading", error: undefined, progress: 0, abort } : u)) } : it)));
      promise
        .then((media) => setItems((prev) => prev.map((it) => ({ ...it, uploads: it.uploads.map((u) => (u.localId === up.localId ? { ...u, status: "ready", progress: 1, media, abort: undefined } : u)) }))))
        .catch((e: ApiError) => {
          if (e.code === "ABORTED") return;
          setItems((prev) => prev.map((it) => ({ ...it, uploads: it.uploads.map((u) => (u.localId === up.localId ? { ...u, status: "failed", error: e.message, abort: undefined } : u)) })));
        });
    },
    [],
  );

  const addFiles = async (idx: number, files: File[]) => {
    setError(null);
    const it = items[idx];
    if (it.poll) {
      setError("Remove the poll to add media. Polls can’t be combined with attachments.");
      return;
    }
    const kindOf = (f: File): Upload["kind"] | null => (f.type === "image/gif" ? "GIF" : f.type.startsWith("image/") ? "IMAGE" : f.type.startsWith("video/") ? "VIDEO" : null);
    const existing = it.uploads.map((u) => u.kind);
    const incoming = files.map(kindOf);
    if (incoming.some((k) => !k)) return setError("Unsupported file. Use JPEG, PNG, WebP, GIF, MP4 or WebM.");
    const all = [...existing, ...(incoming as Upload["kind"][])];
    if (all.some((k) => k !== "IMAGE") && all.length > 1) return setError("Please choose up to 4 photos, or 1 GIF, or 1 video.");
    if (all.length > 4) return setError("Please choose up to 4 photos.");
    for (const f of files) {
      const kind = kindOf(f)!;
      const limit = kind === "IMAGE" ? 5 : kind === "GIF" ? 15 : 40;
      if (f.size > limit * 1024 * 1024) return setError(`${kind === "IMAGE" ? "Images" : kind === "GIF" ? "GIFs" : "Videos"} must be ${limit} MB or smaller.`);
    }
    for (const f of files) {
      const kind = kindOf(f)!;
      const preview = URL.createObjectURL(f);
      const meta = kind === "VIDEO" ? await inspectVideo(f) : undefined;
      const up: Upload = { localId: newClientKey().slice(0, 10), file: f, preview, kind, status: "uploading", progress: 0, meta };
      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, uploads: [...x.uploads, up] } : x)));
      startUpload(idx, up);
    }
  };

  const removeUpload = (idx: number, localId: string) => {
    const u = items[idx].uploads.find((x) => x.localId === localId);
    u?.abort?.();
    if (u?.file) URL.revokeObjectURL(u.preview);
    update(idx, (it) => ({ ...it, uploads: it.uploads.filter((x) => x.localId !== localId) }));
  };

  const pickGif = async (file: string) => {
    setGifOpen(false);
    const it = items[active];
    if (it.poll) return setError("Remove the poll to add a GIF.");
    if (it.uploads.length) return setError("Please choose up to 4 photos, or 1 GIF, or 1 video.");
    try {
      const media = await post<MediaDTO>("/gifs", { file, scope: "POST" });
      update(active, (x) => ({ ...x, uploads: [{ localId: media.id, preview: media.url, kind: "GIF", status: "ready", progress: 1, media }] }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  // ------------------------------------------------------------- text helpers
  const insertAtCaret = (idx: number, s: string) => {
    const ta = textareas.current[items[idx].key];
    const text = items[idx].text;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + s + text.slice(end);
    update(idx, (it) => ({ ...it, text: next }));
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(start + s.length, start + s.length);
    });
  };

  // ------------------------------------------------------------- submit
  const allReady = items.every(itemReady);
  const uploading = items.some((it) => it.uploads.some((u) => u.status === "uploading"));
  const failedUpload = items.some((it) => it.uploads.some((u) => u.status === "failed"));

  const finish = async () => {
    if (draftId) {
      await del(`/drafts/${draftId}`).catch(() => {});
      qc.invalidateQueries({ queryKey: ["drafts"] });
    }
    writeRecovery(session.actor.id, null);
    lastSaved.current = "";
    setDraftId(null);
    setItems([newItem()]);
    setActive(0);
    setSchedule(null);
    setAudience("EVERYONE");
    clientKey.current = newClientKey();
    onDone?.();
  };

  const submit = async () => {
    if (!allReady || submitting) return;
    setSubmitting(true);
    setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      if (schedule) {
        const body = { payload, scheduledFor: schedule.iso, timezone: schedule.timezone };
        if (scheduledId) await put(`/scheduled/${scheduledId}`, body);
        else await post("/scheduled", body);
        qc.invalidateQueries({ queryKey: ["scheduled"] });
        toast({ text: `Your post will be sent ${formatInZone(schedule.iso, schedule.timezone)}`, action: { label: "View", href: "/compose/scheduled" } });
        await finish();
        return;
      }
      const created = await post<PostDTO[]>("/posts", { ...payload, clientKey: clientKey.current });
      seedPosts(qc, created);
      // Insert immediately at the top of the viewer's timelines; others refresh in place.
      for (const key of [["timeline", "home"], ["timeline", "latest"]]) {
        qc.setQueryData<InfiniteData<TimelinePage>>(key, (old) => {
          if (!old?.pages.length) return old;
          const first = old.pages[0];
          const top = created[0];
          const entry = { key: `p:${top.id}`, postId: top.id, sortAt: top.createdAt, parentId: top.replyToId ?? undefined };
          return { ...old, pages: [{ ...first, entries: [entry, ...first.entries.filter((e) => e.postId !== top.id)] }, ...old.pages.slice(1)] };
        });
      }
      qc.invalidateQueries({ queryKey: ["profile-timeline"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (replyToId) {
        qc.invalidateQueries({ queryKey: ["detail"] });
        qc.invalidateQueries({ queryKey: postKey(replyToId) });
      }
      if (quoteId) qc.invalidateQueries({ queryKey: postKey(quoteId) });
      const top = created[0];
      toast({ text: replyToId ? "Your reply was sent." : created.length > 1 ? "Your thread was sent." : "Your post was sent.", action: { label: "View", href: postPath(top) } });
      // Link cards are fetched by the worker; refresh posts with links shortly after.
      for (const p of created.filter((x) => /https?:\/\/|www\./i.test(x.text) && !x.media.length)) {
        for (const delay of [3000, 8000]) setTimeout(() => qc.invalidateQueries({ queryKey: postKey(p.id) }), delay);
      }
      await finish();
    } catch (e) {
      // Recoverable: keep everything in the editor; the same client key is reused on retry.
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------- close handling
  const requestClose = useCallback(() => {
    if (hasContent(items) && !scheduledId) setConfirmClose(true);
    else onDone?.();
  }, [items, scheduledId, onDone]);
  // Block body on purpose: returning the function would make React run it as a cleanup.
  useEffect(() => {
    registerClose?.(requestClose);
  }, [registerClose, requestClose]);

  const discard = async () => {
    setConfirmClose(false);
    for (const it of items) for (const u of it.uploads) u.abort?.();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (draftId && !initialDraftId) await del(`/drafts/${draftId}`).catch(() => {});
    writeRecovery(session.actor.id, null);
    qc.invalidateQueries({ queryKey: ["drafts"] });
    onDone?.();
  };
  const saveAndClose = async () => {
    setConfirmClose(false);
    try {
      const body = { payload };
      if (draftId) await put(`/drafts/${draftId}`, body);
      else await post("/drafts", body);
      writeRecovery(session.actor.id, null);
      qc.invalidateQueries({ queryKey: ["drafts"] });
      toast({ text: "Saved to drafts", action: { label: "View", href: "/compose/drafts" } });
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const restoreRecovered = async () => {
    const id = recoverId;
    setRecoverId(null);
    if (!id) return;
    try {
      const d = (await get<DraftDTO[]>("/drafts")).find((x) => x.id === id);
      if (!d) {
        writeRecovery(session.actor.id, null);
        return setError("That unsent post was already sent or deleted.");
      }
      hydrate(d.payload, d.media);
      setDraftId(d.id);
      lastSaved.current = JSON.stringify(d.payload);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const isReply = !!replyToId;
  const submitLabel = schedule ? (scheduledId ? "Update" : "Schedule") : items.length > 1 ? "Publish all" : isReply ? "Reply" : "Publish";
  const compact = mode === "inline" && !focused && !dirty;

  if (!loaded) return <div className="p-6 text-center text-fg2">Loading…</div>;

  return (
    <div
      className={clsx("flex flex-col", mode === "inline" && "mx-3 mt-3 rounded-2xl border border-line bg-bg shadow-card")}
      onDragOver={(e: DragEvent) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e: DragEvent) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        addFiles(active, Array.from(e.dataTransfer.files));
      }}
    >
      {recoverId && !dirty && (
        <div className="flex items-center gap-3 border-b border-line bg-accent-softer px-4 py-2 text-sm">
          <RotateCcw size={16} className="text-accent-text" />
          <span className="flex-1">You have an unsent post from earlier.</span>
          <button type="button" className="font-bold text-accent-text hover:underline" onClick={restoreRecovered}>Restore</button>
          <button type="button" className="text-fg2 hover:underline" onClick={() => { setRecoverId(null); writeRecovery(session.actor.id, null); }}>Dismiss</button>
        </div>
      )}
      {schedule && (
        <button type="button" onClick={() => setScheduleOpen(true)} className="flex items-center gap-2 px-4 pt-3 text-left text-sm text-fg2 hover:underline">
          <CalendarClock size={16} /> Will send on {formatInZone(schedule.iso, schedule.timezone)}
        </button>
      )}
      {replyTo.data && isPost(replyTo.data) && (showReplyContext ? <ReplyContext p={replyTo.data} /> : <p className="pl-[76px] pr-4 pt-3 text-fg2">Replying to <span className="text-accent-text">@{replyTo.data.author.handle}</span></p>)}
      {replyTo.isError && <p className="px-4 pt-3 text-danger">The post you’re replying to is unavailable.</p>}
      {items.map((it, idx) => (
        <ItemEditor
          key={it.key}
          item={it}
          idx={idx}
          count={items.length}
          active={idx === active}
          me={session.actor}
          compact={compact}
          isReply={isReply && idx === 0}
          placeholder={idx === 0 ? (isReply ? "Write your reply…" : quoteId ? "Add your note…" : "Share something with your campus…") : "Add another post to the thread"}
          setRef={(el) => (textareas.current[it.key] = el)}
          onFocus={() => {
            setActive(idx);
            setFocused(true);
          }}
          onText={(t) => update(idx, (x) => ({ ...x, text: t }))}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length) {
              e.preventDefault();
              addFiles(idx, files);
            }
          }}
          onRemove={() => {
            setItems((prev) => prev.filter((_, i) => i !== idx));
            setActive(Math.max(0, idx - 1));
          }}
          onRemoveUpload={(id) => removeUpload(idx, id)}
          onRetryUpload={(u) => startUpload(idx, u)}
          onAlt={(id, alt) => update(idx, (x) => ({ ...x, uploads: x.uploads.map((u) => (u.media?.id === id ? { ...u, media: { ...u.media!, alt } } : u)) }))}
          onPoll={(p) => update(idx, (x) => ({ ...x, poll: p }))}
          onInsert={(s) => insertAtCaret(idx, s)}
        >
          {idx === 0 && quote.data && isPost(quote.data) && <QuotedPost quoted={quote.data} />}
          {idx === 0 && quote.isError && <p className="mt-2 text-danger">The post you’re quoting is unavailable.</p>}
        </ItemEditor>
      ))}
      {!compact && !isReply && items.length === 1 && (
        <div className="pl-[76px] pr-4">
          <AudienceMenu value={audience} onChange={setAudience} />
        </div>
      )}
      {session.preferences.altTextReminder && items.some((it) => it.uploads.some((u) => u.status === "ready" && u.kind !== "VIDEO" && !u.media?.alt)) && (
        <p className="mx-4 mt-2 rounded bg-accent-softer px-3 py-2 text-sm" role="note">
          Reminder: some images don’t have descriptions yet. Use the ALT button on each image so people using screen readers know what’s in them.
        </p>
      )}
      {error && (
        <p className="mx-4 mt-2 rounded bg-like-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {!compact && (
        <div className={clsx("flex items-center gap-1 px-4 py-2", mode === "inline" ? "ml-[60px] border-t border-line" : "border-t border-line")}>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              addFiles(active, Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <ToolButton label="Media" onClick={() => fileInput.current?.click()} disabled={!!items[active]?.poll || (items[active]?.uploads.length ?? 0) >= 4 || items[active]?.uploads.some((u) => u.kind !== "IMAGE")} disabledReason={items[active]?.poll ? "Polls can’t include media" : "Up to 4 photos, or 1 GIF, or 1 video"}>
            <ImageIcon size={20} />
          </ToolButton>
          <ToolButton label="GIF" onClick={() => setGifOpen(true)} disabled={!!items[active]?.poll || (items[active]?.uploads.length ?? 0) > 0} disabledReason={items[active]?.poll ? "Polls can’t include a GIF" : "Remove media to add a GIF"}>
            <span className="rounded border-2 border-current px-0.5 text-[0.625rem] font-extrabold leading-none">GIF</span>
          </ToolButton>
          <ToolButton
            label="Poll"
            onClick={() => update(active, (x) => ({ ...x, poll: x.poll ? null : { choices: ["", ""], days: 1, hours: 0, minutes: 0 } }))}
            disabled={(items[active]?.uploads.length ?? 0) > 0}
            disabledReason="Polls can’t be combined with media"
          >
            <BarChart2 size={20} className="rotate-90" />
          </ToolButton>
          <EmojiPicker
            onPick={(e) => insertAtCaret(active, e)}
            trigger={
              <button type="button" aria-label="Emoji" title="Emoji" className="grid h-9 w-9 place-items-center rounded-xl text-accent-text hover:bg-accent-soft">
                <Smile size={20} />
              </button>
            }
          />
          {!isReply && (
            <ToolButton label="Schedule" onClick={() => setScheduleOpen(true)}>
              <CalendarClock size={20} />
            </ToolButton>
          )}
          <div className="ml-auto flex items-center gap-3">
            <Counter text={items[active]?.text ?? ""} />
            {!scheduledId && !schedule && (
              <button
                type="button"
                aria-label="Add another post to this thread"
                title="Add"
                disabled={!itemReady(items[items.length - 1]) || items.length >= 25}
                onClick={() => {
                  setItems((p) => [...p, newItem()]);
                  setActive(items.length);
                }}
                className="grid h-[30px] w-[30px] place-items-center rounded-xl border border-line-strong text-accent-text hover:bg-accent-soft disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            )}
            <Button onClick={submit} disabled={!allReady || submitting} aria-disabled={!allReady || submitting} title={uploading ? "Waiting for uploads to finish" : failedUpload ? "Remove or retry failed uploads" : undefined}>
              {submitting ? "Sending…" : submitLabel}
            </Button>
          </div>
        </div>
      )}
      {mode === "inline" && compact && (
        <div className="-mt-1 flex justify-end px-4 pb-3">
          <Button disabled>{isReply ? "Reply" : "Publish"}</Button>
        </div>
      )}
      <GifPicker open={gifOpen} onClose={() => setGifOpen(false)} onPick={pickGif} />
      {scheduleOpen && (
        <SchedulePicker
          open
          value={schedule}
          onClose={() => setScheduleOpen(false)}
          onConfirm={(v) => {
            setSchedule(v);
            setScheduleOpen(false);
          }}
          onClear={() => {
            setSchedule(null);
            setScheduleOpen(false);
          }}
        />
      )}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Save post?"
        body="You can save this to send later from your unsent posts."
        confirmLabel="Save"
        onConfirm={saveAndClose}
        secondary={{ label: "Discard", onClick: discard }}
      />
    </div>
  );
}


// ----------------------------------------------------------------- parts
function ReplyContext({ p }: { p: PostDTO }) {
  return (
    <div className="flex gap-3 px-4 pt-3">
      <div className="flex w-12 shrink-0 flex-col items-center">
        <Avatar user={p.author} size={48} />
        <div className="mt-1 w-0.5 flex-1 bg-line-strong" />
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex min-w-0 items-baseline gap-1">
          <DisplayName user={p.author} />
          <span className="truncate text-fg2">@{p.author.handle}</span>
        </div>
        <RichText text={p.text} className="line-clamp-6" />
        <div className="mt-2 text-fg2">
          Replying to <span className="text-accent-text">@{p.author.handle}</span>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, disabledReason, children }: { label: string; onClick: () => void; disabled?: boolean; disabledReason?: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={disabled && disabledReason ? `${label} (unavailable: ${disabledReason})` : label} title={disabled ? disabledReason : label} onClick={onClick} disabled={disabled} className="grid h-9 w-9 place-items-center rounded-xl text-accent-text hover:bg-accent-soft disabled:opacity-40">
      {children}
    </button>
  );
}

export function Counter({ text }: { text: string }) {
  const p = parsePostText(text);
  if (p.empty && p.weightedLength === 0) return null;
  const r = 9;
  const c = 2 * Math.PI * r;
  const warn = p.remaining <= 20;
  const over = p.remaining < 0;
  const size = warn ? 30 : 22;
  return (
    <div className="relative grid place-items-center" style={{ width: 30, height: 30 }} aria-live="off" aria-label={`${p.remaining} characters remaining`} role="img">
      {p.remaining > -10 && (
        <svg width={size} height={size} viewBox="0 0 20 20" className="-rotate-90">
          <circle cx="10" cy="10" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle cx="10" cy="10" r={r} fill="none" stroke={over ? "var(--danger)" : warn ? "var(--warning)" : "var(--accent)"} strokeWidth="2" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, p.progress))} strokeLinecap="round" />
        </svg>
      )}
      {warn && <span className={clsx("absolute text-xs", over ? "text-danger" : "text-fg2")}>{p.remaining}</span>}
      <span className="sr-only">{p.remaining < 0 ? `${-p.remaining} characters over the ${POST_MAX} limit` : ""}</span>
    </div>
  );
}

function AudienceMenu({ value, onChange }: { value: ReplyAudience; onChange: (v: ReplyAudience) => void }) {
  const opts: { v: ReplyAudience; label: string; icon: React.ReactNode }[] = [
    { v: "EVERYONE", label: "Everyone", icon: <Globe size={18} /> },
    { v: "FOLLOWING", label: "People you follow", icon: <Users size={18} /> },
    { v: "MENTIONED", label: "Only people you mention", icon: <AtSign size={18} /> },
  ];
  const cur = opts.find((o) => o.v === value)!;
  return (
    <div className="border-b border-line pb-2">
      <Menu
        align="start"
        label="Who can reply"
        trigger={
          <button type="button" className="-ml-3 flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-semibold text-accent-text hover:bg-accent-soft">
            {cur.icon} {value === "EVERYONE" ? "Everyone can reply" : value === "FOLLOWING" ? "People you follow can reply" : "Only people you mention can reply"}
          </button>
        }
      >
        <div className="px-4 pb-1 pt-3">
          <div className="font-bold">Who can reply?</div>
          <div className="text-sm text-fg2">Choose who can reply to this post. Anyone mentioned can always reply.</div>
        </div>
        {opts.map((o) => (
          <MenuItem key={o.v} icon={o.icon} onSelect={() => onChange(o.v)}>
            <span className="flex items-center gap-2">
              {o.label} {o.v === value && <Check size={16} className="text-accent-text" />}
            </span>
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

interface EditorProps {
  item: Item;
  idx: number;
  count: number;
  active: boolean;
  me: UserDTO;
  compact: boolean;
  isReply: boolean;
  placeholder: string;
  children?: React.ReactNode;
  setRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  onText: (t: string) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemove: () => void;
  onRemoveUpload: (id: string) => void;
  onRetryUpload: (u: Upload) => void;
  onAlt: (mediaId: string, alt: string) => void;
  onPoll: (p: PollState | null) => void;
  onInsert: (s: string) => void;
}

function ItemEditor(props: EditorProps) {
  const { item, idx, count, active, me, compact, placeholder, children } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [altFor, setAltFor] = useState<MediaDTO | null>(null);
  // Auto-size.
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, compact ? 24 : 52)}px`;
  }, [item.text, compact]);
  const token = useMemo(() => {
    const before = item.text.slice(0, caret);
    const m = before.match(/(^|[^\w@#])([@#][\p{L}\p{N}_]{1,20})$/u);
    return m ? m[2] : null;
  }, [item.text, caret]);
  const issue = itemErrors(item);
  return (
    <div className={clsx("flex gap-3 px-4", idx === 0 ? "pt-3" : "pt-1")}>
      <div className="flex w-12 shrink-0 flex-col items-center">
        <Avatar user={me} size={48} />
        {idx < count - 1 && <div className="mt-1 w-0.5 flex-1 bg-line-strong" />}
      </div>
      <div className={clsx("relative min-w-0 flex-1 pb-2", !active && count > 1 && "opacity-60")}>
        <label className="sr-only" htmlFor={`compose-${item.key}`}>
          {placeholder}
        </label>
        <textarea
          id={`compose-${item.key}`}
          ref={(el) => {
            ref.current = el;
            props.setRef(el);
          }}
          value={item.text}
          onFocus={props.onFocus}
          onChange={(e) => {
            props.onText(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
          }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onPaste={props.onPaste}
          placeholder={placeholder}
          rows={1}
          className={clsx("block w-full resize-none bg-transparent py-3 outline-none placeholder:text-fg2", compact ? "text-[1.25rem]" : "text-[1.25rem]")}
          autoFocus={active && !compact && idx > 0}
        />
        {token && active && <Suggestions token={token} onPick={(s) => {
          const start = caret - token.length;
          const next = item.text.slice(0, start) + s + " " + item.text.slice(caret);
          props.onText(next);
          requestAnimationFrame(() => {
            ref.current?.focus();
            const pos = start + s.length + 1;
            ref.current?.setSelectionRange(pos, pos);
            setCaret(pos);
          });
        }} />}
        {count > 1 && idx > 0 && (
          <button type="button" aria-label="Remove this post from the thread" onClick={props.onRemove} className="absolute right-0 top-2 grid h-8 w-8 place-items-center rounded-xl text-accent-text hover:bg-accent-soft">
            <X size={18} />
          </button>
        )}
        {item.uploads.length > 0 && (
          <div className={clsx("mt-2 grid gap-2", item.uploads.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {item.uploads.map((u) => (
              <div key={u.localId} className="relative overflow-hidden rounded-card border border-line bg-subtle" style={{ aspectRatio: item.uploads.length > 1 ? "1" : "16/9" }}>
                {u.kind === "VIDEO" ? (
                  <video src={u.preview} className="h-full w-full object-cover" muted playsInline controls={u.status === "ready"} aria-label="Video preview" />
                ) : (
                   
                  <img src={u.preview} alt={u.media?.alt || "Attachment preview"} className="h-full w-full object-cover" />
                )}
                <button type="button" aria-label="Remove media" onClick={() => props.onRemoveUpload(u.localId)} className="absolute left-1 top-1 grid h-8 w-8 place-items-center rounded-xl bg-black/75 text-white hover:bg-black/60">
                  <X size={18} />
                </button>
                {u.status === "ready" && u.media && u.kind !== "VIDEO" && (
                  <button type="button" onClick={() => setAltFor(u.media!)} className="absolute bottom-1 left-1 rounded-xl bg-black/75 px-3 py-1 text-sm font-semibold text-white hover:bg-black/60" aria-label={u.media.alt ? `Edit image description: ${u.media.alt}` : "Add image description"}>
                    {u.media.alt ? "ALT ✓" : "+ ALT"}
                  </button>
                )}
                {u.status === "uploading" && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-sm text-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)} aria-label="Upload progress">
                    <div className="flex items-center justify-between">
                      <span>Uploading {Math.round(u.progress * 100)}%</span>
                      <button type="button" className="font-bold underline" onClick={() => { u.abort?.(); props.onRemoveUpload(u.localId); }}>
                        Cancel
                      </button>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-white/30">
                      <div className="h-full bg-white" style={{ width: `${u.progress * 100}%` }} />
                    </div>
                  </div>
                )}
                {u.status === "failed" && (
                  <div className="absolute inset-0 grid place-items-center bg-black/70 p-3 text-center text-sm text-white" role="alert">
                    <div>
                      <p>{u.error ?? "Upload failed."}</p>
                      {u.file && (
                        <button type="button" className="mt-2 rounded-xl bg-white px-3 py-1 font-semibold text-black" onClick={() => props.onRetryUpload(u)}>
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {item.poll && <PollEditor poll={item.poll} onChange={props.onPoll} />}
        {children}
        {issue && (item.text || item.poll) && <p className="mt-2 text-sm text-danger">{issue}</p>}
      </div>
      {altFor && <AltDialog media={altFor} onClose={() => setAltFor(null)} onSaved={(alt) => { props.onAlt(altFor.id, alt); setAltFor(null); }} />}
    </div>
  );
}

function Suggestions({ token, onPick }: { token: string; onPick: (s: string) => void }) {
  const isMention = token.startsWith("@");
  const q = token.slice(1);
  const users = useQuery({ queryKey: ["mention-suggest", q], queryFn: () => get<UserDTO[]>(`/mentions?q=${encodeURIComponent(q)}`), enabled: isMention && q.length > 0, staleTime: 30_000 });
  const tags = useQuery({ queryKey: ["tag-suggest", q], queryFn: () => get<{ hashtags: { tag: string; count: number }[] }>(`/search/typeahead?q=${encodeURIComponent("#" + q)}`), enabled: !isMention && q.length > 0, staleTime: 30_000 });
  const [idx, setIdx] = useState(0);
  const options: { value: string; node: React.ReactNode }[] = isMention
    ? (users.data ?? []).map((u) => ({ value: `@${u.handle}`, node: <span className="flex items-center gap-2"><Avatar user={u} size={32} /><span className="min-w-0"><DisplayName user={u} /><span className="block text-sm text-fg2">@{u.handle}</span></span></span> }))
    : (tags.data?.hashtags ?? []).map((h) => ({ value: `#${h.tag}`, node: <span>#{h.tag} <span className="text-sm text-fg2">{h.count} posts</span></span> }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!options.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onPick(options[Math.min(idx, options.length - 1)].value);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  if (!options.length) return null;
  return (
    <ul role="listbox" aria-label={isMention ? "Mention suggestions" : "Hashtag suggestions"} className="absolute left-0 z-40 mt-1 w-[min(320px,100%)] overflow-hidden rounded-md bg-elevated py-1" style={{ boxShadow: "var(--shadow)" }}>
      {options.map((o, i) => (
        <li key={o.value} role="option" aria-selected={i === idx}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(o.value)} className={clsx("w-full px-4 py-2 text-left hover:bg-hover", i === idx && "bg-hover-strong")}>
            {o.node}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PollEditor({ poll, onChange }: { poll: PollState; onChange: (p: PollState | null) => void }) {
  const set = (patch: Partial<PollState>) => onChange({ ...poll, ...patch });
  return (
    <fieldset className="mt-2 rounded-card border border-line-strong">
      <legend className="sr-only">Poll</legend>
      <div className="space-y-3 p-3">
        {poll.choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="flex-1 rounded border border-line-strong px-2 pt-1 focus-within:border-accent-text">
              <span className="flex justify-between text-xs text-fg2">
                <span>Choice {i + 1}{i >= 2 ? " (optional)" : ""}</span>
                <span>{graphemeLength(c)} / {POLL_CHOICE_MAX}</span>
              </span>
              <input value={c} maxLength={POLL_CHOICE_MAX * 2} onChange={(e) => set({ choices: poll.choices.map((x, j) => (j === i ? e.target.value : x)) })} className="w-full bg-transparent pb-2 outline-none" />
            </label>
            {i === poll.choices.length - 1 && poll.choices.length < 4 ? (
              <button type="button" aria-label="Add a choice" onClick={() => set({ choices: [...poll.choices, ""] })} className="grid h-9 w-9 place-items-center rounded-xl text-accent-text hover:bg-accent-soft">
                <Plus size={20} />
              </button>
            ) : (
              <span className="w-9" />
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <div className="text-sm font-bold">Poll length</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              ["days", "Days", 8],
              ["hours", "Hours", 24],
              ["minutes", "Minutes", 60],
            ] as const
          ).map(([k, label, n]) => (
            <label key={k} className="rounded border border-line-strong px-2 pt-1 focus-within:border-accent-text">
              <span className="text-xs text-fg2">{label}</span>
              <select value={poll[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<PollState>)} className="w-full bg-transparent pb-2 outline-none">
                {Array.from({ length: n }, (_, i) => (
                  <option key={i} value={i} className="bg-bg">
                    {i}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => onChange(null)} className="w-full border-t border-line py-3 text-danger hover:bg-like-soft">
        Remove poll
      </button>
    </fieldset>
  );
}

function AltDialog({ media, onClose, onSaved }: { media: MediaDTO; onClose: () => void; onSaved: (alt: string) => void }) {
  const [alt, setAlt] = useState(media.alt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const len = graphemeLength(alt);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit image description"
      fullScreenMobile
      headerAction={
        <Button
          size="sm"
          className="mr-2"
          disabled={busy || len > ALT_MAX}
          onClick={async () => {
            setBusy(true);
            try {
              const m = await patch<MediaDTO>(`/media/${media.id}`, { alt });
              onSaved(m.alt);
            } catch (e) {
              setError(errorMessage(e));
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="bg-black">
        <img src={media.url} alt="" className="mx-auto max-h-[40dvh] object-contain" />
      </div>
      <DialogBody>
        <label htmlFor="alt-text" className="flex justify-between text-sm text-fg2">
          <span>Description</span>
          <span className={len > ALT_MAX ? "text-danger" : ""}>{len} / {ALT_MAX}</span>
        </label>
        <textarea id="alt-text" value={alt} onChange={(e) => setAlt(e.target.value)} rows={4} className="mt-1 w-full rounded border border-line-strong bg-transparent p-2 outline-none focus:border-accent-text" placeholder="Describe this image for people who can’t see it" />
        <p className="mt-2 text-sm text-fg2">Descriptions are read by screen readers and shown with the ALT badge.</p>
        {error && <p className="mt-2 text-danger" role="alert">{error}</p>}
      </DialogBody>
    </Dialog>
  );
}

export { api, Link };
