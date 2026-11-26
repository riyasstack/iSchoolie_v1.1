"use client";
/**
 * One coherent client cache: every PostDTO lives at ["post", id]. Timelines store
 * entry ids only, so a like/repost/bookmark/vote anywhere updates every screen.
 * Viewer-scoped: the whole cache is cleared when the demo actor changes.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { del, get, post, put, errorMessage, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { PostDTO, TimelinePage, UnavailableDTO } from "@/lib/types";

export type AnyPost = PostDTO | UnavailableDTO;
export const postKey = (id: string) => ["post", id] as const;

export function seedPosts(qc: QueryClient, posts: AnyPost[]) {
  for (const p of posts) {
    qc.setQueryData(postKey(p.id), p);
    if ("author" in p && p.quoted && "author" in p.quoted) {
      // Don't overwrite a fuller cached copy of the quoted post.
      if (!qc.getQueryData(postKey(p.quoted.id))) qc.setQueryData(postKey(p.quoted.id), p.quoted);
    }
  }
}

export function usePost(id: string, initial?: AnyPost) {
  return useQuery({
    queryKey: postKey(id),
    queryFn: () => get<AnyPost>(`/posts/${id}`),
    initialData: initial,
    staleTime: 5 * 60_000,
  });
}

export function isPost(p: AnyPost | undefined | null): p is PostDTO {
  return !!p && "author" in p;
}

/** Infinite timeline that seeds its posts into the entity cache. */
export function useTimeline(key: readonly unknown[], path: string, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    queryKey: key,
    enabled: opts.enabled ?? true,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const sep = path.includes("?") ? "&" : "?";
      const page = await get<TimelinePage>(`${path}${pageParam ? `${sep}cursor=${encodeURIComponent(pageParam)}` : ""}`, signal);
      seedPosts(qc, page.posts);
      return page;
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
  });
}

/** Flattens pages and drops duplicate entries for the same post across page boundaries. */
export function flattenEntries(pages: TimelinePage[] | undefined) {
  const seen = new Set<string>();
  const out: TimelinePage["entries"] = [];
  for (const p of pages ?? [])
    for (const e of p.entries) {
      if (seen.has(e.postId)) continue;
      seen.add(e.postId);
      out.push(e);
    }
  return out;
}

type Toggle = "like" | "repost" | "bookmark";

function applyToggle(p: PostDTO, kind: Toggle, on: boolean): PostDTO {
  if (kind === "like") return { ...p, viewer: { ...p.viewer, liked: on }, counts: { ...p.counts, likes: Math.max(0, p.counts.likes + (on ? 1 : -1)) } };
  if (kind === "repost") return { ...p, viewer: { ...p.viewer, reposted: on }, counts: { ...p.counts, reposts: Math.max(0, p.counts.reposts + (on ? 1 : -1)) } };
  return { ...p, viewer: { ...p.viewer, bookmarked: on } };
}

/** Optimistic toggle with rollback; the server response becomes the source of truth. */
export function useToggle(kind: Toggle) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? put<PostDTO>(`/posts/${id}/${kind}`) : del<PostDTO>(`/posts/${id}/${kind}`)),
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: postKey(id) });
      const prev = qc.getQueryData<AnyPost>(postKey(id));
      if (isPost(prev)) qc.setQueryData(postKey(id), applyToggle(prev, kind, on));
      return { prev };
    },
    onError: (e, { id }, c) => {
      if (c?.prev) qc.setQueryData(postKey(id), c.prev);
      toast({ text: errorMessage(e), tone: "error" });
    },
    onSuccess: (p, { on }) => {
      qc.setQueryData(postKey(p.id), p);
      if (kind === "bookmark") {
        qc.invalidateQueries({ queryKey: ["bookmarks"] });
        toast({ text: on ? "Post added to your Bookmarks" : "Post removed from your Bookmarks", action: on ? { label: "View", href: "/i/bookmarks" } : undefined });
      }
      if (kind === "repost") qc.invalidateQueries({ queryKey: ["profile-timeline"] });
      if (kind === "like") qc.invalidateQueries({ queryKey: ["profile-timeline"], predicate: (q) => q.queryKey[2] === "likes" });
    },
  });
}

/** Generic post mutation that replaces the cached DTO with the server result. */
export function usePostAction<V>(fn: (v: V) => Promise<PostDTO>, success?: (p: PostDTO, v: V) => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (p, v) => {
      qc.setQueryData(postKey(p.id), p);
      success?.(p, v);
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
}

export function useVote() {
  return usePostAction(({ id, optionId }: { id: string; optionId: string }) => post<PostDTO>(`/posts/${id}/vote`, { optionId }));
}

export function useDeletePost() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => del<{ deleted: boolean }>(`/posts/${id}`),
    onSuccess: (_r, id) => {
      qc.setQueryData(postKey(id), { id, unavailable: "deleted" } satisfies UnavailableDTO);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast({ text: "Your post was deleted" });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
}

export { ApiError };
