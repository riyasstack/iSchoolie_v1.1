import type { Metadata } from "next";
import { TopicsView } from "@/features/collections/topics";

export const metadata: Metadata = { title: "Interests" };

export default function Page() {
  return <TopicsView />;
}
