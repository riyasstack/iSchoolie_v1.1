import type { Metadata } from "next";
import { ProfileView } from "@/features/profiles/profile";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${decodeURIComponent(handle)}` };
}

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProfileView handle={decodeURIComponent(handle)} tab="posts" />;
}
