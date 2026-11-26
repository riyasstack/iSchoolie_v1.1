import type { Metadata } from "next";
import { DraftsPage } from "@/features/compose/compose-views";

export const metadata: Metadata = { title: "Drafts" };

export default function Page() {
  return <DraftsPage />;
}
