import type { Metadata } from "next";
import { AccountsList } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Blocked accounts" };

export default function Page() {
  return <AccountsList kind="blocked" />;
}
