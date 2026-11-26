import type { Metadata } from "next";
import { NewMessage } from "@/features/messages/messages";

export const metadata: Metadata = { title: "New message" };

export default function Page() {
  return <NewMessage />;
}
