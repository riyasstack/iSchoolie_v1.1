import type { Metadata } from "next";
import { ConnectView } from "@/features/collections/misc-views";

export const metadata: Metadata = { title: "Connect" };

export default function Page() {
  return <ConnectView />;
}
