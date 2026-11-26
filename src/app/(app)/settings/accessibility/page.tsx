import type { Metadata } from "next";
import { AccessibilitySettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Accessibility" };

export default function Page() {
  return <AccessibilitySettings />;
}
