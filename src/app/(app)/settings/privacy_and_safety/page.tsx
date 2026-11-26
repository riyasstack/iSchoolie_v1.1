import type { Metadata } from "next";
import { PrivacySettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Privacy and safety" };

export default function Page() {
  return <PrivacySettings />;
}
