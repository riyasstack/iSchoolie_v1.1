import type { Metadata } from "next";
import { TopicView } from "@/features/collections/topics";

export const metadata: Metadata = { title: "Topic" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TopicView slug={slug} />;
}
