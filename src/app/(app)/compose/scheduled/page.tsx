import type { Metadata } from "next";
import { ScheduledPage } from "@/features/compose/compose-views";

export const metadata: Metadata = { title: "Scheduled posts" };

export default function Page() {
  return <ScheduledPage />;
}
