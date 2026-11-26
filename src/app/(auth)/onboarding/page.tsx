import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingForm } from "@/features/auth/auth-forms";
import { authEnv } from "../auth-env";

export const metadata: Metadata = { title: "Pick a username" };

export default async function Page() {
  const env = await authEnv();
  return (
    <Suspense>
      <OnboardingForm env={env} />
    </Suspense>
  );
}
