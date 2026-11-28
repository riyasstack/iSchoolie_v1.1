"use client";
import { useState, type ReactNode } from "react";
import { PostCard } from "../posts/post-card";
import { flattenEntries, useTimeline } from "../posts/cache";
import { PostSkeleton } from "@/components/ui/spinner";
import { EmptyState, ErrorState, LoadMore } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";

/** How many posts at the top of a freshly loaded timeline rise in one after another. */
const STAGGERED = 6;

/** Generic infinite timeline of posts with conversation connectors and all list states. */
export function Timeline({
  queryKey,
  path,
  empty,
  header,
  enabled = true,
  footer,
}: {
  queryKey: readonly unknown[];
  path: string;
  empty: ReactNode;
  header?: ReactNode;
  enabled?: boolean;
  footer?: ReactNode;
}) {
  const q = useTimeline(queryKey, path, { enabled });
  // Only a load the reader waited for gets the entrance; cached timelines (e.g. coming
  // back to the Feed) appear instantly, exactly where they were.
  const [fresh] = useState(() => !q.data);
  const entries = flattenEntries(q.data?.pages);
  if (q.isPending && enabled) return <PostSkeleton count={5} />;
  if (q.isError && !q.data) {
    const msg = errorMessage(q.error);
    return <ErrorState message={msg} onRetry={() => q.refetch()} />;
  }
  return (
    <div>
      {header}
      {entries.length === 0 && !q.isFetching ? (
        typeof empty === "string" ? <EmptyState title={empty} /> : empty
      ) : (
        <div aria-busy={q.isFetching} aria-live="off">
          {entries.map((e, i) => {
            const rise = fresh && i < STAGGERED;
            return (
              <div key={e.key} className={rise ? "feed-in" : undefined} style={rise ? { animationDelay: `${i * 55}ms` } : undefined}>
                {e.parentId && <PostCard postId={e.parentId} connectBottom showReplyingTo />}
                <PostCard postId={e.postId} context={e.context} connectTop={!!e.parentId} showReplyingTo={!e.parentId} />
              </div>
            );
          })}
        </div>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => !q.isFetchingNextPage && q.fetchNextPage()} error={q.isFetchNextPageError ? errorMessage(q.error) : null} />
      {footer}
    </div>
  );
}
