import type { Metadata } from "next";
import { ProfileListsView } from "@/features/collections/lists";

export const metadata: Metadata = { title: "Circles" };

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProfileListsView handle={decodeURIComponent(handle)} kind="owned" />;
}
