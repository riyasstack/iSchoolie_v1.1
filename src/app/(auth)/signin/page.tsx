import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/features/auth/auth-forms";
import { authEnv } from "../auth-env";

export const metadata: Metadata = { title: "Log in" };

export default async function Page() {
  const env = await authEnv();
  return (
    <Suspense>
      <SignInForm env={env} />
    </Suspense>
  );
}
