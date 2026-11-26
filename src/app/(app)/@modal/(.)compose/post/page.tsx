import { Suspense } from "react";
import { ComposeModal } from "@/features/compose/compose-views";

export default function InterceptedCompose() {
  return (
    <Suspense>
      <ComposeModal />
    </Suspense>
  );
}
