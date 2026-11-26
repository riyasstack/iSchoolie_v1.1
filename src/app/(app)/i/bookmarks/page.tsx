import type { Metadata } from "next";
import { BookmarksView } from "@/features/collections/misc-views";

export const metadata: Metadata = { title: "Bookmarks" };

export default function Page() {
  return <BookmarksView />;
}
