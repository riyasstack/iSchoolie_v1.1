import type { Metadata } from "next";
import { ListsView } from "@/features/collections/lists";

export const metadata: Metadata = { title: "Circles" };

export default function Page() {
  return <ListsView />;
}
