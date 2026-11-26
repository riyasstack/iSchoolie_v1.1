import type { Metadata } from "next";
import { DisplaySettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Display" };

export default function Page() {
  return <DisplaySettings />;
}
