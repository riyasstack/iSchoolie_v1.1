import type { Metadata } from "next";
import { NotificationSettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Alert settings" };

export default function Page() {
  return <NotificationSettings />;
}
