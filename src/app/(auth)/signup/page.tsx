import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/features/auth/auth-forms";
import { authEnv } from "../auth-env";

export const metadata: Metadata = { title: "Sign up" };

export default async function Page() {
  const env = await authEnv();
  return (
    <Suspense>
      <SignUpForm env={env} />
    </Suspense>
  );
}
