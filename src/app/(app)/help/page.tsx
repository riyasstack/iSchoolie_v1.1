import type { Metadata } from "next";
import { HelpView } from "@/features/help";

export const metadata: Metadata = { title: "Help Center" };

export default function Page() {
  return <HelpView />;
}
