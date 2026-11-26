import type { Metadata } from "next";
import { ListsView } from "@/features/collections/lists";

export const metadata: Metadata = { title: "Lists" };

export default function Page() {
  return <ListsView />;
}
