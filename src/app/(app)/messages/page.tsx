import type { Metadata } from "next";
import { SelectConversation } from "@/features/messages/messages";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  return <SelectConversation />;
}
