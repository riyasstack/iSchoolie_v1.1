import type { Metadata } from "next";
import { HomeView } from "@/features/timeline/home";
import { DisplayDialog } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Display" };

export default function Page() {
  return (
    <>
      <HomeView />
      <DisplayDialog />
    </>
  );
}
