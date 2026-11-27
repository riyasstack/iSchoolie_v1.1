"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { MapPin, Link2, CalendarDays, MoreHorizontal, Mail, Bell, BellRing, ListPlus, VolumeX, Ban, Flag, ScrollText, Zap, MessageSquareText, Copy, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Avatar, DisplayName, EmptyState, ErrorState, Menu, MenuItem, RouteTabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PostSkeleton } from "@/components/ui/spinner";
import { get, put, del, post, errorMessage, ApiError } from "@/lib/api";
import { compactCount, joinedDate, displayUrlSafe } from "./profile-format";
import { RichText } from "../posts/rich-text";
import { Timeline } from "../timeline/timeline";
import { FollowButton } from "./people";
import { useDialogs } from "../dialogs";
import { PeopleList } from "../posts/detail";
import type { ConversationDTO, ProfileDTO } from "@/lib/types";

export type ProfileTab = "posts" | "with_replies" | "media" | "likes";

export function useProfile(handle: string) {
  return useQuery({ queryKey: ["profile", handle.toLowerCase()], queryFn: () => get<ProfileDTO>(`/users/${handle}`), staleTime: 30_000 });
}

export function ProfileView({ handle, tab }: { handle: string; tab: ProfileTab }) {
  const q = useProfile(handle);
  if (q.isPending)
    return (
      <div>
        <PageHeader title={`@${handle}`} back />
        <div className="aspect-[3/1] w-full skeleton" />
        <div className="px-4 pb-4">
          <div className="-mt-[15%] h-[25%] max-h-[134px] min-h-[68px] w-[25%] min-w-[68px] max-w-[134px] rounded-xl border-4 border-bg skeleton" style={{ aspectRatio: "1" }} />
          <div className="mt-4 h-5 w-40 rounded skeleton" />
        </div>
        <PostSkeleton count={3} />
      </div>
    );
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div>
        <PageHeader title="Profile" back />
        <div className="aspect-[3/1] w-full bg-subtle" />
        <div className="px-4">
          <div className="-mt-[12%] h-[134px] w-[134px] max-w-[25vw] max-h-[25vw] rounded-xl border-4 border-bg bg-subtle" />
          <p className="mt-3 text-heading font-extrabold">@{handle}</p>
        </div>
        {notFound ? <EmptyState title="This account doesn’t exist" body="Try searching for another." action={<Link href="/explore"><Button>Search iSchoolie</Button></Link>} /> : <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      </div>
    );
  }
  const p = q.data;
  return (
    <div>
      <PageHeader title={<DisplayName user={p} />} subtitle={p.suspended ? undefined : `${compactCount(p.postsCount)} Posts`} back />
      <ProfileHeader p={p} />
      {p.suspended ? (
        <EmptyState title="Account suspended" body="This fictional account is suspended to demonstrate the suspended state. Its posts aren’t shown." />
      ) : p.relationship.blockedBy ? (
        <EmptyState title="You’re blocked" body={`You can’t follow or see @${p.handle}’s posts.`} />
      ) : p.relationship.blocking ? (
        <BlockedInterstitial p={p} tab={tab} />
      ) : !p.canViewContent ? (
        <EmptyState title="These posts are protected" body={`Only approved followers can see @${p.handle}’s posts. To request access, click Follow.`} />
      ) : (
        <ProfileTabs p={p} tab={tab} />
      )}
    </div>
  );
}

function BlockedInterstitial({ p }: { p: ProfileDTO; tab: ProfileTab }) {
  return <EmptyState title={`@${p.handle} is blocked`} body={`You blocked this account, so their posts are hidden. Unblock @${p.handle} to see their posts and let them follow you again.`} />;
}

function ProfileTabs({ p, tab }: { p: ProfileDTO; tab: ProfileTab }) {
  const base = `/${p.handle}`;
  const empty: Record<ProfileTab, { title: string; body: string }> = {
    posts: p.isSelf ? { title: "You haven’t posted yet", body: "When you post, it’ll show up here." } : { title: `@${p.handle} hasn’t posted`, body: "When they do, their posts will show up here." },
    with_replies: { title: p.isSelf ? "You haven’t posted or replied yet" : `@${p.handle} hasn’t posted or replied`, body: "Posts and replies will show up here." },
    media: { title: p.isSelf ? "You haven’t posted any photos or videos yet" : `@${p.handle} hasn’t posted media`, body: "Photos, GIFs and videos will show up here." },
    likes: { title: p.isSelf ? "You don’t have any cheers yet" : `@${p.handle} hasn’t cheered any posts`, body: p.isSelf ? "Tap Cheer on any post to show it some love. When you do, it’ll show up here." : "When they do, those posts will show up here." },
  };
  return (
    <>
      <RouteTabs
        active={tab}
        tabs={[
          { key: "posts", label: "Posts", href: base },
          { key: "with_replies", label: "Posts & replies", href: `${base}/with_replies` },
          { key: "media", label: "Media", href: `${base}/media` },
          { key: "likes", label: "Cheers", href: `${base}/likes` },
        ]}
      />
      <Timeline
        key={`${p.handle}-${tab}`}
        queryKey={["profile-timeline", p.handle, tab]}
        path={`/users/${p.handle}/timeline?tab=${tab}`}
        empty={<EmptyState title={empty[tab].title} body={empty[tab].body} />}
      />
    </>
  );
}

function ProfileHeader({ p }: { p: ProfileDTO }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const dialogs = useDialogs();
  const [viewer, setViewer] = useState<null | "avatar" | "banner">(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const refresh = (np: ProfileDTO) => {
    qc.setQueryData(["profile", np.handle.toLowerCase()], np);
    qc.invalidateQueries({ queryKey: ["timeline"] });
    qc.invalidateQueries({ queryKey: ["profile-timeline", np.handle] });
  };
  const act = useMutation({
    mutationFn: ({ path, method }: { path: string; method: "PUT" | "DELETE"; msg: string }) => (method === "PUT" ? put<ProfileDTO>(path) : del<ProfileDTO>(path)),
    onSuccess: (np, v) => {
      refresh(np);
      toast({ text: v.msg });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const message = useMutation({
    mutationFn: () => post<ConversationDTO>("/conversations", { handles: [p.handle] }),
    onSuccess: (c) => router.push(`/messages/${c.id}`),
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const r = p.relationship;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${p.handle}`);
      toast({ text: "Copied to clipboard" });
    } catch {
      toast({ text: "Couldn’t copy the link.", tone: "error" });
    }
  };
  return (
    <div className="mx-3 mt-3 overflow-hidden rounded-2xl border border-line bg-bg shadow-card">
      <button type="button" className="block aspect-[4/1] w-full overflow-hidden bg-gradient-to-r from-accent-soft to-like-soft" onClick={() => p.bannerUrl && setViewer("banner")} aria-label={p.bannerUrl ? "View header photo" : "No header photo"} disabled={!p.bannerUrl}>
        {p.bannerUrl && <img src={p.bannerUrl} alt="" className="h-full w-full object-cover" />}
      </button>
      <div className="px-4 pt-4">
        <div className="flex flex-wrap items-start gap-4">
          <button type="button" onClick={() => p.avatarUrl && setViewer("avatar")} aria-label="View profile photo" className="h-[84px] w-[84px] shrink-0 rounded-2xl ring-4 ring-bg">
            <Avatar user={p} size={84} className="!h-full !w-full !rounded-2xl" />
          </button>
          <div className="min-w-0 flex-1 pt-1">
            <DisplayName user={p} className="text-title font-extrabold" />
            <div className="flex flex-wrap items-center gap-1.5 text-fg2">
              @{p.handle}
              {r.followedBy && !p.isSelf && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-text">Follows you</span>}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {p.isSelf ? (
              <Link href="/settings/profile">
                <Button variant="outline">Edit profile</Button>
              </Link>
            ) : (
              !p.suspended && (
                <>
                  <Menu
                    label="More"
                    trigger={
                      <button type="button" aria-label="More" className="grid h-9 w-9 place-items-center rounded-xl border border-line-strong text-fg hover:bg-hover-strong">
                        <MoreHorizontal size={18} />
                      </button>
                    }
                  >
                    {!r.blockedBy && <MenuItem icon={<ListPlus />} onSelect={() => dialogs.listMembership(p.handle)}>Add/remove from Circles</MenuItem>}
                    <MenuItem icon={<ScrollText />} href={`/${p.handle}/lists`}>View Circles</MenuItem>
                    <MenuItem icon={<Copy />} onSelect={copy}>Copy link to profile</MenuItem>
                    <MenuItem icon={<VolumeX />} onSelect={() => act.mutate({ path: `/users/${p.handle}/mute`, method: r.muting ? "DELETE" : "PUT", msg: r.muting ? `@${p.handle} has been unmuted` : `@${p.handle} has been muted` })}>
                      {r.muting ? `Unmute @${p.handle}` : `Mute @${p.handle}`}
                    </MenuItem>
                    <MenuItem icon={<Ban />} onSelect={() => (r.blocking ? act.mutate({ path: `/users/${p.handle}/block`, method: "DELETE", msg: `@${p.handle} has been unblocked` }) : setConfirmBlock(true))}>
                      {r.blocking ? `Unblock @${p.handle}` : `Block @${p.handle}`}
                    </MenuItem>
                    <MenuItem icon={<Flag />} onSelect={() => dialogs.report({ type: "USER", id: p.id, label: `@${p.handle}` })}>Report @{p.handle}</MenuItem>
                  </Menu>
                  {!r.blocking && !r.blockedBy && (
                    <button
                      type="button"
                      disabled={!p.canMessage || message.isPending}
                      title={p.canMessage ? "Message" : `@${p.handle} doesn’t accept messages from you`}
                      aria-label={p.canMessage ? "Message" : `Messaging unavailable: @${p.handle} doesn’t accept messages from you`}
                      onClick={() => message.mutate()}
                      className="grid h-9 w-9 place-items-center rounded-xl border border-line-strong text-fg hover:bg-hover-strong disabled:opacity-40"
                    >
                      <Mail size={18} />
                    </button>
                  )}
                  {r.following && (
                    <button
                      type="button"
                      aria-pressed={r.notify}
                      aria-label={r.notify ? "Turn off alerts for this account’s posts" : "Get notified when this account posts"}
                      title={r.notify ? "Turn off post alerts" : "Turn on post alerts"}
                      onClick={() => act.mutate({ path: `/users/${p.handle}/notify`, method: r.notify ? "DELETE" : "PUT", msg: r.notify ? `You won’t get alerts when @${p.handle} posts.` : `You’ll get a notification in iSchoolie when @${p.handle} posts.` })}
                      className={r.notify ? "grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-on" : "grid h-9 w-9 place-items-center rounded-xl border border-line-strong text-fg hover:bg-hover-strong"}
                    >
                      {r.notify ? <BellRing size={18} /> : <Bell size={18} />}
                    </button>
                  )}
                  <FollowButton key={`${r.following}-${r.requested}-${r.blocking}`} user={p} relationship={r} onChange={refresh} />
                </>
              )
            )}
          </div>
        </div>
        {!p.suspended && (
          <>
            {p.bio && <RichText text={p.bio} className="mt-3" />}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-fg2">
              {p.location && (
                <span className="flex items-center gap-1 break-anywhere">
                  <MapPin size={16} /> {p.location}
                </span>
              )}
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-1 text-accent-text hover:underline">
                  <Link2 size={16} /> {displayUrlSafe(p.website)}
                </a>
              )}
              <span className="flex items-center gap-1">
                <CalendarDays size={16} /> Joined {joinedDate(p.createdAt)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pb-4">
              <Link href={`/${p.handle}/following`} className="rounded-xl bg-subtle px-3 py-1.5 text-sm hover:bg-hover-strong">
                <b>{compactCount(p.followingCount)}</b> <span className="text-fg2">Following</span>
              </Link>
              <Link href={`/${p.handle}/followers`} className="rounded-xl bg-subtle px-3 py-1.5 text-sm hover:bg-hover-strong">
                <b>{compactCount(p.followersCount)}</b> <span className="text-fg2">Followers</span>
              </Link>
              {p.isSelf && (
                <Link href="/i/moments" className="hidden items-center gap-1.5 rounded-xl bg-subtle px-3 py-1.5 text-sm text-fg2 hover:bg-hover-strong sm:flex">
                  <Zap size={14} /> Stories
                </Link>
              )}
              {p.isSelf && (
                <Link href="/i/topics" className="hidden items-center gap-1.5 rounded-xl bg-subtle px-3 py-1.5 text-sm text-fg2 hover:bg-hover-strong sm:flex">
                  <MessageSquareText size={14} /> Interests
                </Link>
              )}
            </div>
            {p.isProtected && !p.isSelf && !r.following && (
              <p className="flex items-center gap-1 pb-3 text-sm text-fg2">
                <Lock size={14} /> {r.requested ? "Your follow request is pending." : "Follow this account to request access to its posts."}
              </p>
            )}
          </>
        )}
      </div>
      {viewer && (
        <Dialog open onOpenChange={(o) => !o && setViewer(null)} title={viewer === "avatar" ? "Profile photo" : "Header photo"} hideTitle width={viewer === "avatar" ? 420 : 1000} className="!bg-transparent">
          <button type="button" className="block w-full" onClick={() => setViewer(null)} aria-label="Close">
            <img src={(viewer === "avatar" ? p.avatarUrl : p.bannerUrl) ?? ""} alt={viewer === "avatar" ? `${p.displayName}’s profile photo` : `${p.displayName}’s header photo`} className={viewer === "avatar" ? "aspect-square w-full rounded-full object-cover" : "w-full object-contain"} />
          </button>
        </Dialog>
      )}
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={`Block @${p.handle}?`}
        body={`They will not be able to follow you or view your posts, and you will not see posts or alerts from @${p.handle}. Blocking also removes them as a follower.`}
        confirmLabel="Block"
        danger
        onConfirm={() => {
          setConfirmBlock(false);
          act.mutate({ path: `/users/${p.handle}/block`, method: "PUT", msg: `You blocked @${p.handle}` });
        }}
      />
    </div>
  );
}

export function ConnectionsView({ handle, kind }: { handle: string; kind: "followers" | "following" }) {
  const q = useProfile(handle);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const p = q.data;
  return (
    <div>
      <PageHeader title={p ? <DisplayName user={p} /> : `@${handle}`} subtitle={`@${handle}`} back={`/${handle}`} />
      <RouteTabs
        active={kind}
        tabs={[
          { key: "followers", label: "Followers", href: `/${handle}/followers` },
          { key: "following", label: "Following", href: `/${handle}/following` },
        ]}
      />
      {p && !p.canViewContent ? (
        <EmptyState title={p.suspended ? "Account suspended" : p.relationship.blocking || p.relationship.blockedBy ? "Not available" : "These lists are protected"} body={p.isProtected ? `Only approved followers can see who @${handle} follows and who follows them.` : undefined} />
      ) : (
        <>
          <form
            className="border-b border-line px-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              setDebounced(search.trim());
            }}
            role="search"
          >
            <input value={search} onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setDebounced(""); }} placeholder={`Search ${kind}`} aria-label={`Search ${kind}`} className="h-10 w-full rounded-xl bg-input px-4 outline-none" />
          </form>
          <PeopleList
            key={`${kind}-${debounced}`}
            queryKey={["connections", handle, kind, debounced]}
            path={`/users/${handle}/${kind}?q=${encodeURIComponent(debounced)}`}
            empty={debounced ? `No ${kind} match “${debounced}”` : kind === "followers" ? (p?.isSelf ? "You don’t have any followers yet" : `@${handle} doesn’t have any followers`) : p?.isSelf ? "You aren’t following anyone yet" : `@${handle} isn’t following anyone`}
            emptyBody={kind === "followers" ? "When someone follows this account, they’ll show up here." : "When this account follows someone, they’ll show up here."}
          />
        </>
      )}
    </div>
  );
}
