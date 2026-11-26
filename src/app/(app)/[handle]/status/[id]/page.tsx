import type { Metadata } from "next";
import { PostDetailView } from "@/features/posts/detail";

export const metadata: Metadata = { title: "Post" };

export default async function Page({ params }: { params: Promise<{ handle: string; id: string }> }) {
  const { handle, id } = await params;
  return <PostDetailView id={id} handle={decodeURIComponent(handle)} />;
}
