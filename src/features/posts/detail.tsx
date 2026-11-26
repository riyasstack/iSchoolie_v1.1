"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadMore, RouteTabs } from "@/components/ui/misc";
import { PostSkeleton, UserSkeleton, Spinner } from "@/components/ui/spinner";
import { get, errorMessage, ApiError } from "@/lib/api";
import { FocalPost, PostCard, UnavailablePost, postPath } from "./post-card";
import { isPost, seedPosts, usePost } from "./cache";
import type { PostDTO } from "@/lib/types";
import { Timeline } from "../timeline/timeline";
import { UserCell } from "../profiles/people";
import { Composer } from "../compose/composer";
import type { PostDetailDTO, UserListItem, AnyPostDTO } from "./detail-types";
import type { UnavailableDTO } from "@/lib/types";

export function PostDetailView({ id, handle, hidden = false }: { id: string; handle: string; hidden?: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const focalRef = useRef<HTMLDivElement>(null);
  const q = useInfiniteQuery({
    queryKey: ["detail", id, hidden],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const d = await get<PostDetailDTO>(`/posts/${id}/detail?${hidden ? "hidden=1&" : ""}${pageParam ? `cursor=${pageParam}` : ""}`);
      seedPosts(qc, [d.focal, ...d.ancestors, ...d.replies]);
      return d;
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  const first = q.data?.pages[0];
  // Canonicalise the handle in the URL (e.g. after a rename or a mistyped handle).
  useEffect(() => {
    if (first && isPost(first.focal) && first.focal.author.handle !== handle && !hidden) router.replace(postPath(first.focal));
  }, [first, handle, hidden, router]);
  // Keep the focal post in view when ancestors render above it.
  useEffect(() => {
    if (first && first.ancestors.length && focalRef.current && !hidden) focalRef.current.scrollIntoView({ block: "start" });
  }, [first, hidden]);

  if (q.isPending)
    return (
      <div>
        <PageHeader title={hidden ? "Hidden replies" : "Post"} back />
        <PostSkeleton count={3} />
      </div>
    );
  if (q.isError) {
    const e = q.error;
    return (
      <div>
        <PageHeader title="Post" back />
        <ErrorState message={e instanceof ApiError && e.status === 404 ? "This post doesn’t exist." : errorMessage(e)} onRetry={() => q.refetch()} />
      </div>
    );
  }
  const d = first!;
  const replies = q.data.pages.flatMap((p) => p.replies);
  if (!isPost(d.focal)) {
    return (
      <div>
        <PageHeader title="Post" back />
        <UnavailablePost reason={(d.focal as UnavailableDTO).unavailable} />
        <EmptyState title="This post isn’t available" body="It may have been deleted, or it’s from an account whose posts you can’t see." action={<Link className="text-accent-text hover:underline" href="/home">Go to Home</Link>} />
      </div>
    );
  }
  const focal = d.focal;
  if (hidden) {
    return (
      <div>
        <PageHeader title="Hidden replies" subtitle={`Post by @${focal.author.handle}`} back />
        <p className="border-b border-line px-4 py-3 text-sm text-fg2">
          The author of the conversation hid these replies. Hiding doesn’t delete them; anyone who can see the conversation can view them here.
        </p>
        {replies.length === 0 ? <EmptyState title="No hidden replies" /> : replies.map((r) => <PostCard key={r.id} postId={r.id} />)}
        <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} />
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="Post" back />
      {d.ancestors.map((a) => (isPost(a) ? <PostCard key={a.id} postId={a.id} connectBottom showReplyingTo={false} /> : <div key={a.id} className="pb-1"><UnavailablePost reason={a.unavailable} /></div>))}
      <div ref={focalRef} className="scroll-mt-[53px]">
        <CachedFocalPost initial={focal} />
      </div>
      {focal.viewer.canReply ? (
        <div className="hidden border-b border-line sm:block">
          <Composer mode="inline" replyToId={focal.id} showReplyContext={false} />
        </div>
      ) : (
        <p className="border-b border-line px-4 py-3 text-sm text-fg2">{focal.viewer.replyRestriction ?? "Replies are limited for this post."}</p>
      )}
      {replies.map((r) => (
        <PostCard key={r.id} postId={r.id} showReplyingTo={r.replyToId !== focal.id} />
      ))}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} error={q.isFetchNextPageError ? "Couldn’t load more replies." : null} />
      {d.hiddenReplyCount > 0 && (
        <Link href={`/${focal.author.handle}/status/${focal.id}/hidden`} className="flex items-center gap-3 border-b border-line px-4 py-4 text-accent-text hover:bg-hover">
          <EyeOff size={18} /> View hidden replies ({d.hiddenReplyCount})
        </Link>
      )}
      {replies.length === 0 && !q.hasNextPage && <p className="px-4 py-8 text-center text-fg2">No replies yet.</p>}
    </div>
  );
}

/** The focal post reads from the shared entity cache so likes/votes/reposts update in place. */
function CachedFocalPost({ initial }: { initial: PostDTO }) {
  const { data } = usePost(initial.id, initial);
  if (!data || !isPost(data)) return <UnavailablePost reason={data && "unavailable" in data ? data.unavailable : "not_found"} />;
  return <FocalPost p={data} />;
}

function EngagementTabs({ handle, id, active }: { handle: string; id: string; active: string }) {
  return (
    <RouteTabs
      active={active}
      tabs={[
        { key: "quotes", label: "Quote Posts", href: `/${handle}/status/${id}/quotes` },
        { key: "reposts", label: "Reposts", href: `/${handle}/status/${id}/reposts` },
        { key: "likes", label: "Likes", href: `/${handle}/status/${id}/likes` },
      ]}
    />
  );
}

export function EngagementView({ id, handle, kind }: { id: string; handle: string; kind: "likes" | "reposts" | "quotes" }) {
  const title = kind === "likes" ? "Liked by" : kind === "reposts" ? "Reposted by" : "Quote Posts";
  return (
    <div>
      <PageHeader title={title} back={`/${handle}/status/${id}`} />
      <EngagementTabs handle={handle} id={id} active={kind} />
      {kind === "quotes" ? (
        <Timeline queryKey={["quotes", id]} path={`/posts/${id}/quotes`} empty={<EmptyState title="No Quote Posts yet" body="When someone quotes this post, it’ll show up here." />} />
      ) : (
        <PeopleList queryKey={["engagement", kind, id]} path={`/posts/${id}/${kind}`} empty={kind === "likes" ? "No likes yet" : "No reposts yet"} emptyBody={kind === "likes" ? "When someone likes this post, they’ll show up here." : "When someone reposts this post, they’ll show up here."} />
      )}
    </div>
  );
}

export function PeopleList({ queryKey, path, empty, emptyBody }: { queryKey: readonly unknown[]; path: string; empty: string; emptyBody?: string }) {
  const q = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => get<{ items: UserListItem[]; nextCursor: string | null }>(`${path}${path.includes("?") ? "&" : "?"}${pageParam ? `cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor,
  });
  if (q.isPending) return <UserSkeleton count={6} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (!items.length) return <EmptyState title={empty} body={emptyBody} />;
  return (
    <div>
      {items.map((it) => (
        <UserCell key={it.user.id} item={it} />
      ))}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} />
    </div>
  );
}

/** /i/status/:id → canonical /:handle/status/:id */
export function StatusRedirect({ id }: { id: string }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ["post", id], queryFn: () => get<AnyPostDTO>(`/posts/${id}`) });
  useEffect(() => {
    if (q.data && "author" in q.data) router.replace(postPath(q.data));
  }, [q.data, router]);
  if (q.data && !("author" in q.data)) return <div><PageHeader title="Post" back /><UnavailablePost reason={q.data.unavailable} /></div>;
  if (q.isError) return <div><PageHeader title="Post" back /><ErrorState message={errorMessage(q.error)} /></div>;
  return <Spinner className="py-10" />;
}
