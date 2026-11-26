import type { Metadata } from "next";
import { AccountSettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Your account" };

export default function Page() {
  return <AccountSettings />;
}
