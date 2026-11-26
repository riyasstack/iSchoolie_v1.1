import type { Metadata } from "next";
import { ProfileEditor } from "@/features/settings/profile-edit";

export const metadata: Metadata = { title: "Edit profile" };

export default function Page() {
  return <ProfileEditor />;
}
