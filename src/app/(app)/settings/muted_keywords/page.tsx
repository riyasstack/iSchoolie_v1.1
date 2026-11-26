import type { Metadata } from "next";
import { MutedWords } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Muted words" };

export default function Page() {
  return <MutedWords />;
}
