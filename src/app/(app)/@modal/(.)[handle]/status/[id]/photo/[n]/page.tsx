import { MediaViewer } from "@/features/posts/media-viewer";

export default async function Page({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  return <MediaViewer id={id} n={Number(n) || 1} kind="photo" asModal />;
}
