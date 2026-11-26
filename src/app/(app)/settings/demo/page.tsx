import type { Metadata } from "next";
import { DemoSettings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Demo environment" };

export default function Page() {
  return <DemoSettings />;
}
