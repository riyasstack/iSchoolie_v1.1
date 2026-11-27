import type { Metadata } from "next";
import { BookmarksView } from "@/features/collections/misc-views";

export const metadata: Metadata = { title: "Saved" };

export default function Page() {
  return <BookmarksView />;
}
