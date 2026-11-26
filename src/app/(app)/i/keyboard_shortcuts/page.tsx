import type { Metadata } from "next";
import { HomeView } from "@/features/timeline/home";
import { ShortcutsDialog } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Keyboard shortcuts" };

export default function Page() {
  return (
    <>
      <HomeView />
      <ShortcutsDialog />
    </>
  );
}
