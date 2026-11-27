import type { Metadata } from "next";
import { NotificationsView } from "@/features/notifications/notifications";

export const metadata: Metadata = { title: "Alerts" };

export default function Page() {
  return <NotificationsView tab="all" />;
}
