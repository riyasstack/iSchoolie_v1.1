import type { Metadata } from "next";
import { MomentEditor } from "@/features/collections/moments";

export const metadata: Metadata = { title: "Create new Story" };

export default function Page() {
  return <MomentEditor />;
}
