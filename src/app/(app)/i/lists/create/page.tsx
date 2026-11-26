import type { Metadata } from "next";
import { ListEditor } from "@/features/collections/lists";

export const metadata: Metadata = { title: "Create a new List" };

export default function Page() {
  return <ListEditor />;
}
