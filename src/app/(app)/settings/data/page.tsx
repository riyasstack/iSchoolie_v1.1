import type { Metadata } from "next";
import { DataSettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Data usage" };

export default function Page() {
  return <DataSettings />;
}
