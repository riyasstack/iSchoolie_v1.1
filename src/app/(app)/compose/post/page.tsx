import type { Metadata } from "next";
import { Suspense } from "react";
import { ComposePage } from "@/features/compose/compose-views";

export const metadata: Metadata = { title: "Compose post" };

export default function Page() {
  return (
    <Suspense>
      <ComposePage />
    </Suspense>
  );
}
