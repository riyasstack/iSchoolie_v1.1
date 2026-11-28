import { infiniteQueryOptions, type QueryClient } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { seedPosts } from "./cache";
import type { PostDetailDTO } from "./detail-types";

/** The post page's data (focal post, ancestors, replies). Shared so cards can prefetch it. */
export function detailQuery(qc: QueryClient, id: string, hidden = false) {
  return infiniteQueryOptions({
    queryKey: ["detail", id, hidden] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const d = await get<PostDetailDTO>(`/posts/${id}/detail?${hidden ? "hidden=1&" : ""}${pageParam ? `cursor=${pageParam}` : ""}`);
      seedPosts(qc, [d.focal, ...d.ancestors, ...d.replies]);
      return d;
    },
    getNextPageParam: (last: PostDetailDTO) => last.nextCursor,
  });
}
