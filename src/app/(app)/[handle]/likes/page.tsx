import { ProfileView } from "@/features/profiles/profile";

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProfileView handle={decodeURIComponent(handle)} tab="likes" />;
}
