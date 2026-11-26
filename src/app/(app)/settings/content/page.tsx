import type { Metadata } from "next";
import { ContentSettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Content preferences" };

export default function Page() {
  return <ContentSettings />;
}
