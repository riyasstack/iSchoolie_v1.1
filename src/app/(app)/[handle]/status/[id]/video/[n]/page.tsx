import { PostDetailView } from "@/features/posts/detail";
import { MediaViewer } from "@/features/posts/media-viewer";

export default async function Page({ params }: { params: Promise<{ handle: string; id: string; n: string }> }) {
  const { handle, id, n } = await params;
  return (
    <>
      <PostDetailView id={id} handle={decodeURIComponent(handle)} />
      <MediaViewer id={id} n={Number(n) || 1} kind="video" />
    </>
  );
}
