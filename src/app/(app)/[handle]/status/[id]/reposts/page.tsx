import { EngagementView } from "@/features/posts/detail";

export default async function Page({ params }: { params: Promise<{ handle: string; id: string }> }) {
  const { handle, id } = await params;
  return <EngagementView id={id} handle={decodeURIComponent(handle)} kind="reposts" />;
}
