import type { Metadata } from "next";
import { NotificationsView } from "@/features/notifications/notifications";

export const metadata: Metadata = { title: "Mentions" };

export default function Page() {
  return <NotificationsView tab="mentions" />;
}
