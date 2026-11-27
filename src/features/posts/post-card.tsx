"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import clsx from "clsx";
import {
  MessageSquare, Share2, PartyPopper, Send, MoreHorizontal, Pin, Hash, Trash2, BarChart3, UserPlus, UserMinus, ListPlus,
  VolumeX, Ban, Flag, BellOff, Bell, EyeOff, Eye, Pencil, Link2, Inbox, BookMarked, BookmarkMinus, ExternalLink, Lock,
} from "lucide-react";
import { Avatar, DisplayName, Menu, MenuItem } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { GuestGate, useSession } from "@/components/providers";
import { compactCount, fullTime, relativeTime, absoluteTitle, pollTimeLeft } from "@/lib/format";
import { del, put, errorMessage } from "@/lib/api";
import { RichText } from "./rich-text";
import { MediaGrid, VideoPlayer } from "./post-media";
import { isPost, usePost, useToggle, useVote, useDeletePost, usePostAction, type AnyPost } from "./cache";
import { useDialogs } from "../dialogs";
import { ProfileHoverCard } from "../profiles/hover-card";
import { useQueryClient } from "@tanstack/react-query";
import type { EntryContext, LinkCardDTO, PostDTO, UnavailableDTO } from "@/lib/types";

export function postPath(p: Pick<PostDTO, "id" | "author">) {
  return `/${p.author.handle}/status/${p.id}`;
}

const UNAVAILABLE_TEXT: Record<UnavailableDTO["unavailable"], string> = {
  deleted: "This post was deleted by its author.",
  protected: "This post is from an account that protects its posts. Only approved followers can see it.",
  blocked: "This post is from an account you blocked.",
  blocked_by: "This post is unavailable.",
  suspended: "This post is from a suspended account.",
  not_found: "This post is unavailable.",
  muted: "This post is from an account you muted.",
};

export function UnavailablePost({ reason, compact }: { reason: UnavailableDTO["unavailable"]; compact?: boolean }) {
  return (
    <div className={clsx("rounded-card bg-subtle px-4 py-3 text-fg2", !compact && "mx-4 my-3")} role="note">
      {UNAVAILABLE_TEXT[reason]}
    </div>
  );
}

function ContextRow({ context }: { context: EntryContext }) {
  let icon: ReactNode = null;
  let text: ReactNode = null;
  if (context.type === "repost") {
    icon = <Share2 size={14} />;
    text = (
      <Link href={`/${context.by.handle}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
        {context.by.displayName} shared
      </Link>
    );
  } else if (context.type === "pinned") {
    icon = <Pin size={14} />;
    text = "Pinned";
  } else if (context.type === "topic") {
    icon = <Hash size={14} />;
    text = (
      <Link href={`/i/topics/${context.topic.slug}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
        {context.topic.name}
      </Link>
    );
  } else if (context.type === "liked") {
    icon = <PartyPopper size={14} />;
    text = (
      <Link href={`/${context.by.handle}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
        {context.by.displayName} cheered
      </Link>
    );
  } else if (context.type === "follows_reply") {
    icon = <MessageSquare size={14} />;
    text = `${context.by.displayName} replied`;
  }
  return (
    <div className="-mb-1 flex items-center gap-2 pt-3 text-xs font-semibold text-fg2">
      <span className="grid h-5 w-5 place-items-center rounded-md bg-subtle">{icon}</span>
      <div className="min-w-0 truncate">{text}</div>
    </div>
  );
}

function useOpenPost(p: PostDTO) {
  const router = useRouter();
  return (e: MouseEvent | KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a,button,video,input,textarea,[role=menuitem],[role=dialog],label")) return;
    if (window.getSelection()?.toString()) return;
    const href = postPath(p);
    if ("metaKey" in e && (e.metaKey || e.ctrlKey)) window.open(href, "_blank", "noopener");
    else router.push(href);
  };
}

export const PostCard = memo(function PostCard({
  postId,
  context,
  connectTop,
  connectBottom,
  initial,
  showReplyingTo = true,
}: {
  postId: string;
  context?: EntryContext;
  connectTop?: boolean;
  connectBottom?: boolean;
  initial?: AnyPost;
  showReplyingTo?: boolean;
}) {
  const { data } = usePost(postId, initial);
  if (!data) return null;
  if (!isPost(data)) return data.unavailable === "deleted" && !connectTop && !connectBottom ? null : <UnavailablePost reason={data.unavailable} />;
  return <PostCardBody p={data} context={context} connectTop={connectTop} connectBottom={connectBottom} showReplyingTo={showReplyingTo} />;
});

function PostCardBody({ p, context, connectTop, connectBottom, showReplyingTo }: { p: PostDTO; context?: EntryContext; connectTop?: boolean; connectBottom?: boolean; showReplyingTo: boolean }) {
  const open = useOpenPost(p);
  const [showHidden, setShowHidden] = useState(false);
  if (p.viewer.authorMuted && !showHidden && context?.type !== "pinned") {
    // Muted authors collapse in conversations; they're already filtered from feeds.
    return (
      <div className="mx-3 mt-3 rounded-2xl border border-line bg-bg px-4 py-3 text-fg2">
        This post is from an account you muted.{" "}
        <button type="button" className="text-accent-text hover:underline" onClick={() => setShowHidden(true)}>
          View
        </button>
      </div>
    );
  }
  return (
    <article
      data-post-id={p.id}
      tabIndex={0}
      aria-label={`Post by ${p.author.displayName}`}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open(e)}
      className={clsx(
        "post-card mx-3 cursor-pointer border-x border-line bg-bg px-4 outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-line-strong focus-visible:border-accent-text",
        !connectTop && "mt-3 rounded-t-2xl border-t",
        !connectBottom && "rounded-b-2xl border-b shadow-card",
      )}
    >
      {context && <ContextRow context={context} />}
      <div className="flex gap-3">
        <div className="relative flex w-12 shrink-0 flex-col items-center">
          {connectTop ? <div className="h-3 w-0.5 bg-line-strong" aria-hidden="true" /> : <div className="h-3" />}
          <ProfileHoverCard handle={p.author.handle}>
            <Link href={`/${p.author.handle}`} onClick={(e) => e.stopPropagation()} aria-label={`${p.author.displayName} profile`}>
              <Avatar user={p.author} size={48} />
            </Link>
          </ProfileHoverCard>
          {connectBottom && <div className="mt-1 w-0.5 flex-1 bg-line-strong" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1 pb-3 pt-3">
          <PostHeader p={p} />
          {showReplyingTo && p.replyingTo.length > 0 && (
            <div className="text-fg2">
              Replying to{" "}
              {p.replyingTo.map((h, i) => (
                <span key={h}>
                  {i > 0 && " "}
                  <Link href={`/${h}`} className="text-accent-text hover:underline" onClick={(e) => e.stopPropagation()}>
                    @{h}
                  </Link>
                </span>
              ))}
            </div>
          )}
          {p.text && <RichText text={p.text} lang={p.lang} className="text-post" />}
          <PostAttachments p={p} />
          <PostActions p={p} />
        </div>
      </div>
    </article>
  );
}

function PostHeader({ p }: { p: PostDTO }) {
  return (
    <div className="flex items-start gap-1">
      <div className="flex min-w-0 flex-1 items-baseline gap-x-1 overflow-hidden whitespace-nowrap leading-5">
        <ProfileHoverCard handle={p.author.handle}>
          <Link href={`/${p.author.handle}`} className="flex min-w-0 shrink hover:underline" onClick={(e) => e.stopPropagation()}>
            <DisplayName user={p.author} />
          </Link>
        </ProfileHoverCard>
        <span className="min-w-0 shrink-[2] truncate text-fg2">@{p.author.handle}</span>
        <span className="shrink-0 text-fg2" aria-hidden="true">·</span>
        <Link href={postPath(p)} className="shrink-0 text-fg2 hover:underline" title={absoluteTitle(p.createdAt)} onClick={(e) => e.stopPropagation()}>
          <time dateTime={p.createdAt}>{relativeTime(p.createdAt)}</time>
        </Link>
      </div>
      <PostMenu p={p} />
    </div>
  );
}

export function PostAttachments({ p, large }: { p: PostDTO; large?: boolean }) {
  return (
    <>
      {p.media.length > 0 &&
        (large && p.media[0].kind === "VIDEO" ? (
          <div className="mt-3">
            <VideoPlayer media={p.media[0]} large />
          </div>
        ) : (
          <MediaGrid media={p.media} sensitive={p.sensitive} href={(i) => `${postPath(p)}/${p.media[0].kind === "VIDEO" ? "video" : "photo"}/${i}`} />
        ))}
      {p.poll && <PollView p={p} />}
      {p.quoted && <QuotedPost quoted={p.quoted} />}
      {p.card && <LinkCard card={p.card} />}
    </>
  );
}

/** Link preview card (legacy summary / large-image layout). */
export function LinkCard({ card }: { card: LinkCardDTO }) {
  const large = !!card.imageUrl;
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(e) => e.stopPropagation()}
      className={clsx("mt-3 flex overflow-hidden rounded-card border border-line-strong transition-colors hover:bg-hover", large ? "flex-col" : "flex-row")}
      aria-label={`Link: ${card.title ?? card.url}`}
    >
      {card.imageUrl && (
        <span className="block aspect-[1.91/1] w-full overflow-hidden border-b border-line bg-subtle">
          <img src={card.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        </span>
      )}
      <span className="min-w-0 px-3 py-2.5">
        <span className="block truncate text-fg2">{card.siteName}</span>
        {card.title && <span className="block truncate">{card.title}</span>}
        {card.description && <span className="line-clamp-2 block text-fg2">{card.description}</span>}
      </span>
    </a>
  );
}

// ------------------------------------------------------------------------- poll
function PollView({ p }: { p: PostDTO }) {
  const vote = useVote();
  const poll = p.poll!;
  const showResults = !poll.canVote || vote.isPending;
  const max = Math.max(...poll.options.map((o) => o.votes));
  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <GuestGate action="vote in polls">
      <div className="space-y-2" role="group" aria-label="Poll">
        {poll.options.map((o) => {
          const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          if (!showResults)
            return (
              <button
                key={o.id}
                type="button"
                disabled={vote.isPending}
                onClick={() => vote.mutate({ id: p.id, optionId: o.id })}
                className="flex min-h-[34px] w-full items-center justify-center rounded-xl border border-accent px-4 font-semibold text-accent-text hover:bg-accent-soft"
              >
                {o.label}
              </button>
            );
          const mine = poll.viewerVoteOptionId === o.id;
          return (
            <div key={o.id} className="relative flex min-h-[32px] items-center justify-between overflow-hidden rounded-md px-3" aria-label={`${o.label}: ${pct}%${mine ? " (your vote)" : ""}`}>
              <div className={clsx("absolute inset-y-0 left-0 rounded-md", o.votes === max && max > 0 ? "bg-accent-soft" : "bg-hover-strong")} style={{ width: `${Math.max(pct, 1)}%` }} />
              <span className={clsx("relative break-anywhere", o.votes === max && max > 0 && "font-bold")}>
                {o.label} {mine && "✓"}
              </span>
              <span className={clsx("relative ml-3", o.votes === max && max > 0 && "font-bold")}>{pct}%</span>
            </div>
          );
        })}
      </div>
      </GuestGate>
      <p className="mt-2 text-fg2">
        {compactCount(poll.totalVotes)} vote{poll.totalVotes === 1 ? "" : "s"} · {pollTimeLeft(poll.endsAt)}
        {p.viewer.isAuthor && !poll.closed && " · You can’t vote in your own poll"}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------- quoted
export function QuotedPost({ quoted }: { quoted: PostDTO | UnavailableDTO }) {
  const router = useRouter();
  if (!isPost(quoted)) return <div className="mt-3"><UnavailablePost reason={quoted.unavailable} compact /></div>;
  const href = postPath(quoted);
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Quoted post by ${quoted.author.displayName}`}
      onClick={(e) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest("a,button,video")) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          router.push(href);
        }
      }}
      className="mt-3 cursor-pointer overflow-hidden rounded-card border border-line-strong transition-colors hover:bg-hover"
    >
      <div className="px-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <Avatar user={quoted.author} size={20} />
          <DisplayName user={quoted.author} className="ml-1" />
          <span className="truncate text-fg2">@{quoted.author.handle}</span>
          <span className="text-fg2">·</span>
          <span className="shrink-0 text-fg2">{relativeTime(quoted.createdAt)}</span>
        </div>
        {quoted.replyingTo.length > 0 && <div className="text-fg2">Replying to @{quoted.replyingTo[0]}</div>}
        {quoted.text && <RichText text={quoted.text} lang={quoted.lang} className="pb-2.5 text-post" />}
      </div>
      {quoted.media.length > 0 && (
        <div className="[&>div]:mt-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:border-t">
          <MediaGrid media={quoted.media} sensitive={quoted.sensitive} href={(i) => `${href}/${quoted.media[0].kind === "VIDEO" ? "video" : "photo"}/${i}`} />
        </div>
      )}
      {quoted.poll && <div className="px-3 pb-2.5 text-fg2">Poll · {quoted.poll.totalVotes} votes</div>}
    </div>
  );
}

// ---------------------------------------------------------------------- actions
type ChipTone = "accent" | "repost" | "like";

/** Classes for a labelled action chip under a post. */
export function chipClass(tone: ChipTone, active?: boolean, disabled?: boolean) {
  const hover = tone === "accent" ? "enabled:hover:bg-accent-soft enabled:hover:text-accent-text" : tone === "repost" ? "enabled:hover:bg-repost-soft enabled:hover:text-repost" : "enabled:hover:bg-like-soft enabled:hover:text-like";
  const activeCls = active ? (tone === "repost" ? "bg-repost-soft text-repost" : tone === "like" ? "bg-like-soft text-like" : "bg-accent-soft text-accent-text") : "text-fg2";
  return clsx("flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium transition-colors disabled:opacity-50", !disabled && hover, activeCls);
}

function ChipContent({ icon, text, count, large }: { icon: ReactNode; text: string; count?: number; large?: boolean }) {
  return (
    <>
      {icon}
      <span className={large ? "inline" : "hidden sm:inline"}>{text}</span>
      {count !== undefined && count > 0 && <span className="tabular-nums">{compactCount(count)}</span>}
    </>
  );
}

function ActionButton({ label, count, icon, text, onClick, tone, active, disabled, title, large }: { label: string; count?: number; icon: ReactNode; text: string; onClick?: () => void; tone: ChipTone; active?: boolean; disabled?: boolean; title?: string; large?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={title ?? label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={chipClass(tone, active, disabled)}
    >
      <ChipContent icon={icon} text={text} count={count} large={large} />
    </button>
  );
}

export function PostActions({ p, large }: { p: PostDTO; large?: boolean }) {
  const router = useRouter();
  const like = useToggle("like");
  const repost = useToggle("repost");
  const bookmark = useToggle("bookmark");
  const dialogs = useDialogs();
  const toast = useToast();
  const size = large ? 19 : 17;
  const [pop, setPop] = useState(false);
  const repostDisabled = p.author.isProtected;
  const copy = async () => {
    const url = `${window.location.origin}${postPath(p)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ text: "Copied to clipboard" });
    } catch {
      toast({ text: "Couldn’t copy the link. Your browser blocked clipboard access.", tone: "error" });
    }
  };
  return (
    <GuestGate action="reply, share and cheer posts">
    <div className={clsx("flex flex-wrap items-center gap-1", large ? "border-t border-line py-2" : "-ml-2.5 mt-2.5")} role="group" aria-label="Post actions">
      <ActionButton
        label={p.viewer.canReply ? `Reply${p.counts.replies ? `, ${p.counts.replies} replies` : ""}` : p.viewer.replyRestriction ?? "Replies are limited"}
        title={p.viewer.canReply ? "Reply" : p.viewer.replyRestriction ?? "Replies are limited"}
        count={large ? undefined : p.counts.replies}
        text="Reply"
        large={large}
        tone="accent"
        disabled={!p.viewer.canReply}
        icon={<MessageSquare size={size} />}
        onClick={() => router.push(`/compose/post?reply=${p.id}`)}
      />
      <Menu
        label={p.viewer.reposted ? "Undo share" : "Share"}
        align="center"
        trigger={
          <button
            type="button"
            aria-label={repostDisabled ? "Posts from protected accounts can’t be shared" : `${p.viewer.reposted ? "Undo share" : "Share"}${p.counts.reposts + p.counts.quotes ? `, ${p.counts.reposts + p.counts.quotes} shares` : ""}`}
            title={repostDisabled ? "Posts from protected accounts can’t be shared" : "Share"}
            disabled={repostDisabled && !p.viewer.isAuthor}
            onClick={(e) => e.stopPropagation()}
            className={chipClass("repost", p.viewer.reposted, repostDisabled && !p.viewer.isAuthor)}
          >
            <ChipContent icon={repostDisabled ? <Lock size={size - 2} /> : <Share2 size={size} />} text={p.viewer.reposted ? "Shared" : "Share"} count={large ? undefined : p.counts.reposts + p.counts.quotes} large={large} />
          </button>
        }
      >
        {repostDisabled ? (
          <MenuItem icon={<Lock />} disabled>
            Protected posts can’t be shared
          </MenuItem>
        ) : (
          <MenuItem icon={<Share2 />} onSelect={() => repost.mutate({ id: p.id, on: !p.viewer.reposted })}>
            {p.viewer.reposted ? "Undo share" : "Share to your followers"}
          </MenuItem>
        )}
        <MenuItem icon={<Pencil />} onSelect={() => router.push(`/compose/post?quote=${p.id}`)}>
          Share with a note
        </MenuItem>
      </Menu>
      <ActionButton
        label={`${p.viewer.liked ? "Remove cheer" : "Cheer"}${p.counts.likes ? `, ${p.counts.likes} cheers` : ""}`}
        title={p.viewer.liked ? "Remove cheer" : "Cheer"}
        count={large ? undefined : p.counts.likes}
        text={p.viewer.liked ? "Cheered" : "Cheer"}
        large={large}
        tone="like"
        active={p.viewer.liked}
        icon={<PartyPopper size={size} className={pop ? "like-pop" : undefined} onAnimationEnd={() => setPop(false)} />}
        onClick={() => {
          if (!p.viewer.liked) setPop(true);
          like.mutate({ id: p.id, on: !p.viewer.liked });
        }}
      />
      <Menu
        label="Send"
        trigger={
          <button type="button" data-guest-ok="" aria-label="Send post" title="Send or save" onClick={(e) => e.stopPropagation()} className={clsx(chipClass("accent", p.viewer.bookmarked), "ml-auto")}>
            <ChipContent icon={<Send size={size} />} text={p.viewer.bookmarked ? "Saved" : "Send"} large={large} />
          </button>
        }
      >
        <MenuItem icon={<Inbox />} onSelect={() => dialogs.shareByMessage(p.id)}>
          Send in Inbox
        </MenuItem>
        <MenuItem icon={p.viewer.bookmarked ? <BookmarkMinus /> : <BookMarked />} onSelect={() => bookmark.mutate({ id: p.id, on: !p.viewer.bookmarked })}>
          {p.viewer.bookmarked ? "Remove from Saved" : "Save post"}
        </MenuItem>
        <MenuItem icon={<Link2 />} onSelect={copy}>
          Copy link
        </MenuItem>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <MenuItem
            icon={<ExternalLink />}
            onSelect={() => {
              navigator.share({ url: `${window.location.origin}${postPath(p)}`, text: `Post by @${p.author.handle}` }).catch(() => {});
            }}
          >
            Share outside iSchoolie…
          </MenuItem>
        )}
      </Menu>
      {large && p.viewer.isAuthor && (
        <button type="button" aria-label="View post activity" title="View post activity" onClick={(e) => { e.stopPropagation(); dialogs.activity(p.id); }} className={chipClass("accent")}>
          <ChipContent icon={<BarChart3 size={size} />} text="Activity" large />
        </button>
      )}
    </div>
    </GuestGate>
  );
}

// ------------------------------------------------------------------------- menu
export function PostMenu({ p }: { p: PostDTO }) {
  const session = useSession();
  const dialogs = useDialogs();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const deletePost = useDeletePost();
  const pinned = p.pinned;
  const pin = usePostAction(
    async (on: boolean) => {
      if (on) await put(`/posts/${p.id}/pin`);
      else await del(`/posts/${p.id}/pin`);
      return { ...p, pinned: on };
    },
    (_x, on) => {
      qc.invalidateQueries({ queryKey: ["profile-timeline", p.author.handle] });
      qc.invalidateQueries({ queryKey: ["profile", p.author.handle] });
      toast({ text: on ? "Your post was pinned to your profile." : "Your post was unpinned from your profile." });
    },
  );
  const hide = usePostAction(
    (on: boolean) => (on ? put<PostDTO>(`/posts/${p.id}/hide`) : del<PostDTO>(`/posts/${p.id}/hide`)),
    (_x, on) => {
      qc.invalidateQueries({ queryKey: ["detail"] });
      toast({ text: on ? "You hid a reply. People can still see it in the hidden replies view." : "Reply unhidden." });
    },
  );
  const muteConv = usePostAction(
    (on: boolean) => (on ? put<PostDTO>(`/posts/${p.id}/mute-conversation`) : del<PostDTO>(`/posts/${p.id}/mute-conversation`)),
    (_x, on) => toast({ text: on ? "You won’t get alerts from this conversation." : "Conversation unmuted." }),
  );
  const relationship = async (path: string, method: "PUT" | "DELETE", msg: string) => {
    try {
      if (method === "PUT") await put(path);
      else await del(path);
      qc.invalidateQueries();
      toast({ text: msg });
    } catch (e) {
      toast({ text: errorMessage(e), tone: "error" });
    }
  };
  const me = p.viewer.isAuthor;
  const h = p.author.handle;
  return (
    <>
      <Menu
        label="More"
        trigger={
          <button type="button" aria-label="More" title="More" onClick={(e) => e.stopPropagation()} className="-mr-2 -mt-1 grid h-[34.75px] w-[34.75px] shrink-0 place-items-center rounded-xl text-fg2 hover:bg-accent-soft hover:text-accent-text">
            <MoreHorizontal size={18.75} />
          </button>
        }
      >
        {me ? (
          <>
            <MenuItem danger icon={<Trash2 />} onSelect={() => setConfirmDelete(true)}>
              Delete
            </MenuItem>
            <MenuItem icon={<Pin />} onSelect={() => pin.mutate(!pinned)}>
              {pinned ? "Unpin from profile" : "Pin to your profile"}
            </MenuItem>
            <MenuItem icon={p.viewer.conversationMuted ? <Bell /> : <BellOff />} onSelect={() => muteConv.mutate(!p.viewer.conversationMuted)}>
              {p.viewer.conversationMuted ? "Unmute this conversation" : "Mute this conversation"}
            </MenuItem>
            <MenuItem icon={<BarChart3 />} onSelect={() => dialogs.activity(p.id)}>
              View Post activity
            </MenuItem>
          </>
        ) : (
          <>
            {p.viewer.canHide && (
              <MenuItem icon={p.hidden ? <Eye /> : <EyeOff />} onSelect={() => hide.mutate(!p.hidden)}>
                {p.hidden ? "Unhide reply" : "Hide reply"}
              </MenuItem>
            )}
            {p.viewer.authorFollowed ? (
              <MenuItem icon={<UserMinus />} onSelect={() => relationship(`/users/${h}/follow`, "DELETE", `You unfollowed @${h}`)}>
                Unfollow @{h}
              </MenuItem>
            ) : (
              <MenuItem icon={<UserPlus />} onSelect={() => relationship(`/users/${h}/follow`, "PUT", p.author.isProtected ? `Follow request sent to @${h}` : `You followed @${h}`)}>
                Follow @{h}
              </MenuItem>
            )}
            <MenuItem icon={<ListPlus />} onSelect={() => dialogs.listMembership(h)}>
              Add/remove @{h} from Circles
            </MenuItem>
            <MenuItem icon={p.viewer.conversationMuted ? <Bell /> : <BellOff />} onSelect={() => muteConv.mutate(!p.viewer.conversationMuted)}>
              {p.viewer.conversationMuted ? "Unmute this conversation" : "Mute this conversation"}
            </MenuItem>
            <MenuItem icon={<VolumeX />} onSelect={() => relationship(`/users/${h}/mute`, p.viewer.authorMuted ? "DELETE" : "PUT", p.viewer.authorMuted ? `@${h} has been unmuted.` : `@${h} has been muted. You won’t see their posts in your timeline.`)}>
              {p.viewer.authorMuted ? `Unmute @${h}` : `Mute @${h}`}
            </MenuItem>
            <MenuItem icon={<Ban />} onSelect={() => setConfirmBlock(true)}>
              Block @{h}
            </MenuItem>
            <MenuItem icon={<Flag />} onSelect={() => dialogs.report({ type: "POST", id: p.id, label: `post by @${h}` })}>
              Report Post
            </MenuItem>
          </>
        )}
      </Menu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Post?"
        body="This can’t be undone and it will be removed from your profile, the timeline of any accounts that follow you, and from search results."
        confirmLabel="Delete"
        danger
        busy={deletePost.isPending}
        onConfirm={() => deletePost.mutate(p.id, { onSettled: () => setConfirmDelete(false) })}
      />
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={`Block @${h}?`}
        body={`They will not be able to follow you or view your posts, and you will not see posts or alerts from @${h}.`}
        confirmLabel="Block"
        danger
        onConfirm={() => {
          setConfirmBlock(false);
          relationship(`/users/${h}/block`, "PUT", `You blocked @${h}`);
        }}
      />
      {session.actor.id === "" && null}
    </>
  );
}

/** Focal post on the detail page: larger text, full timestamp, engagement links. */
export function FocalPost({ p }: { p: PostDTO }) {
  const replyAudienceNote =
    p.replyAudience === "FOLLOWING" ? `People @${p.author.handle} follows or mentioned can reply` : p.replyAudience === "MENTIONED" ? `People @${p.author.handle} mentioned can reply` : null;
  return (
    <article data-post-id={p.id} aria-label={`Post by ${p.author.displayName}`} className="mx-3 mt-3 rounded-2xl border border-line bg-bg px-4 pt-4 shadow-card">
      <div className="flex items-start gap-3">
        <ProfileHoverCard handle={p.author.handle}>
          <Link href={`/${p.author.handle}`} aria-label={`${p.author.displayName} profile`}>
            <Avatar user={p.author} size={48} />
          </Link>
        </ProfileHoverCard>
        <div className="min-w-0 flex-1">
          <Link href={`/${p.author.handle}`} className="block hover:underline">
            <DisplayName user={p.author} />
          </Link>
          <div className="truncate text-fg2">@{p.author.handle}</div>
        </div>
        <PostMenu p={p} />
      </div>
      {p.replyingTo.length > 0 && (
        <div className="mt-2 text-fg2">
          Replying to{" "}
          {p.replyingTo.map((h) => (
            <Link key={h} href={`/${h}`} className="mr-1 text-accent-text hover:underline">
              @{h}
            </Link>
          ))}
        </div>
      )}
      {p.text && <RichText text={p.text} lang={p.lang} className="mt-3 text-detail" />}
      <PostAttachments p={p} large />
      <div className="my-4 text-fg2">
        <Link href={`/${p.author.handle}/status/${p.id}`} className="hover:underline">
          <time dateTime={p.createdAt}>{fullTime(p.createdAt)}</time>
        </Link>
      </div>
      {replyAudienceNote && <div className="-mt-2 mb-3 flex items-center gap-1 text-sm text-fg2"><MessageSquare size={14} /> {replyAudienceNote}</div>}
      {(p.counts.reposts > 0 || p.counts.quotes > 0 || p.counts.likes > 0) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line py-4">
          {p.counts.reposts > 0 && (
            <Link href={`/${p.author.handle}/status/${p.id}/reposts`} className="hover:underline">
              <b>{compactCount(p.counts.reposts)}</b> <span className="text-fg2">Share{p.counts.reposts === 1 ? "" : "s"}</span>
            </Link>
          )}
          {p.counts.quotes > 0 && (
            <Link href={`/${p.author.handle}/status/${p.id}/quotes`} className="hover:underline">
              <b>{compactCount(p.counts.quotes)}</b> <span className="text-fg2">Quote share{p.counts.quotes === 1 ? "" : "s"}</span>
            </Link>
          )}
          {p.counts.likes > 0 && (
            <Link href={`/${p.author.handle}/status/${p.id}/likes`} className="hover:underline">
              <b>{compactCount(p.counts.likes)}</b> <span className="text-fg2">Cheer{p.counts.likes === 1 ? "" : "s"}</span>
            </Link>
          )}
        </div>
      )}
      <PostActions p={p} large />
    </article>
  );
}
