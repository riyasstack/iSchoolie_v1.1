import type { Metadata } from "next";
import { ConversationInfo } from "@/features/messages/messages";

export const metadata: Metadata = { title: "Conversation info" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationInfo id={id} />;
}
