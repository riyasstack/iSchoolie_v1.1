import type { Metadata } from "next";
import { Suspense } from "react";
import { AdvancedSearchView } from "@/features/search/explore";

export const metadata: Metadata = { title: "Advanced search" };

export default function Page() {
  return (
    <Suspense>
      <AdvancedSearchView />
    </Suspense>
  );
}
