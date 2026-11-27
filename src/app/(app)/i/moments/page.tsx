import type { Metadata } from "next";
import { MomentsView } from "@/features/collections/moments";

export const metadata: Metadata = { title: "Stories" };

export default function Page() {
  return <MomentsView />;
}
