import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreView } from "@/features/search/explore";

export const metadata: Metadata = { title: "Explore" };

export default function Page() {
  return (
    <Suspense>
      <ExploreView />
    </Suspense>
  );
}
