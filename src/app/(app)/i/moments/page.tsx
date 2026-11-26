import type { Metadata } from "next";
import { MomentsView } from "@/features/collections/moments";

export const metadata: Metadata = { title: "Moments" };

export default function Page() {
  return <MomentsView />;
}
