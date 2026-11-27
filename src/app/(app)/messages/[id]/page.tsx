import type { Metadata } from "next";
import { ConversationView } from "@/features/messages/messages";

export const metadata: Metadata = { title: "Inbox" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationView key={id} id={id} />;
}
