"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Heart, Repeat2, User, UserCheck, Bell, Settings, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Avatar, EmptyState, ErrorState, LoadMore, RouteTabs } from "@/components/ui/misc";
import { PostSkeleton } from "@/components/ui/spinner";
import { get, post, errorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { PostCard, UnavailablePost, postPath } from "../posts/post-card";
import { isPost, seedPosts } from "../posts/cache";
import type { NotificationGroupDTO, SessionDTO } from "@/lib/types";

export function NotificationsView({ tab }: { tab: "all" | "mentions" }) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["notifications", tab],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const page = await get<{ items: NotificationGroupDTO[]; nextCursor: string | null }>(`/notifications?tab=${tab}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`);
      seedPosts(qc, page.items.map((g) => g.post).filter((p): p is NonNullable<typeof p> => !!p));
      return page;
    },
    getNextPageParam: (l) => l.nextCursor,
    refetchInterval: 30_000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const newest = items[0]?.createdAt;
  // Mark as read once the list has been shown.
  useEffect(() => {
    if (!newest) return;
    const t = setTimeout(async () => {
      try {
        const badges = await post<SessionDTO["badges"]>("/notifications/read", { upTo: new Date(new Date(newest).getTime() + 1).toISOString() });
        qc.setQueryData(["badges"], badges);
      } catch {
        /* the badge refreshes on the next poll */
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [newest, qc]);
  return (
    <div>
      <PageHeader
        title="Notifications"
        topLevel
        right={
          <Link href="/settings/notifications" aria-label="Notification settings" className="grid h-[34px] w-[34px] place-items-center rounded-full text-accent-text hover:bg-accent-soft">
            <Settings size={20} />
          </Link>
        }
      />
      <RouteTabs
        active={tab}
        tabs={[
          { key: "all", label: "All", href: "/notifications" },
          { key: "mentions", label: "Mentions", href: "/notifications/mentions" },
        ]}
      />
      {q.isPending && <PostSkeleton count={5} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && items.length === 0 && (
        <EmptyState
          title={tab === "all" ? "Nothing to see here — yet" : "Join the conversation"}
          body={tab === "all" ? "From likes to reposts and a whole lot more, this is where all the action happens." : "When someone mentions you, you’ll find it here."}
        />
      )}
      {items.map((g) => (
        <NotificationRow key={g.key} g={g} />
      ))}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} />
    </div>
  );
}

function NotificationRow({ g }: { g: NotificationGroupDTO }) {
  const router = useRouter();
  if (g.type === "REPLY" || g.type === "MENTION" || g.type === "QUOTE") {
    if (!g.post || !isPost(g.post)) {
      return (
        <div className={clsx("border-b border-line py-1", g.unread && "bg-accent-softer")}>
          <p className="px-4 pt-2 text-sm text-fg2">@{g.actors[0]?.handle} {g.type === "REPLY" ? "replied" : g.type === "QUOTE" ? "quoted your post" : "mentioned you"} · {relativeTime(g.createdAt)}</p>
          <UnavailablePost reason={g.post && "unavailable" in g.post ? g.post.unavailable : "not_found"} />
        </div>
      );
    }
    return (
      <div className={clsx(g.unread && "bg-accent-softer")}>
        <PostCard postId={g.post.id} />
      </div>
    );
  }
  const first = g.actors[0];
  const others = g.actorCount - 1;
  const who = (
    <>
      <b>{first?.displayName}</b>
      {others > 0 && ` and ${others} other${others > 1 ? "s" : ""}`}
    </>
  );
  let icon = <User size={26} className="text-accent-text" fill="currentColor" />;
  let text: React.ReactNode = <>{who} followed you</>;
  let href = first ? `/${first.handle}` : "/notifications";
  if (g.type === "LIKE") {
    icon = <Heart size={26} className="text-like" fill="currentColor" />;
    text = <>{who} liked your post</>;
  } else if (g.type === "REPOST") {
    icon = <Repeat2 size={26} className="text-repost" />;
    text = <>{who} reposted your post</>;
  } else if (g.type === "FOLLOW_REQUEST") {
    icon = <Lock size={24} className="text-accent-text" />;
    text = <>{who} requested to follow you</>;
    href = "/i/follower_requests";
  } else if (g.type === "FOLLOW_ACCEPTED") {
    icon = <UserCheck size={26} className="text-accent-text" />;
    text = <>{who} accepted your follow request</>;
  } else if (g.type === "SUBSCRIBED_POST") {
    icon = <Bell size={24} className="text-accent-text" fill="currentColor" />;
    text = <>New post notification for {who}</>;
  }
  const target = g.post && isPost(g.post) ? g.post : null;
  if ((g.type === "LIKE" || g.type === "REPOST" || g.type === "SUBSCRIBED_POST") && target) href = postPath(target);
  return (
    <article
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        router.push(href);
      }}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && router.push(href)}
      aria-label={typeof text === "string" ? text : undefined}
      className={clsx("flex cursor-pointer gap-3 border-b border-line px-4 py-3 hover:bg-hover", g.unread && "bg-accent-softer")}
    >
      <div className="flex w-12 shrink-0 justify-end pt-1">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1">
          {g.actors.map((a) => (
            <Link key={a.id} href={`/${a.handle}`} aria-label={a.displayName}>
              <Avatar user={a} size={32} />
            </Link>
          ))}
        </div>
        <p className="mt-2 break-anywhere">
          {text} <span className="text-fg2">· {relativeTime(g.createdAt)}</span>
        </p>
        {g.post && (target ? <p className="mt-1 line-clamp-3 text-fg2 break-anywhere">{target.text || (target.media.length ? "(Media)" : "")}</p> : g.type !== "FOLLOW" && <p className="mt-1 text-fg2">This post is no longer available.</p>)}
      </div>
    </article>
  );
}
