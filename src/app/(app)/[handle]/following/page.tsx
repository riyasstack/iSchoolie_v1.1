import { ConnectionsView } from "@/features/profiles/profile";

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ConnectionsView handle={decodeURIComponent(handle)} kind="following" />;
}
