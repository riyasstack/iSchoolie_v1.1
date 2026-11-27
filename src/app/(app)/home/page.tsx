import type { Metadata } from "next";
import { HomeView } from "@/features/timeline/home";

export const metadata: Metadata = { title: "Feed" };

export default function HomePage() {
  return <HomeView />;
}
