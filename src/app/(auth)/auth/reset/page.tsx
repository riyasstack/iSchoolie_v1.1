import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { authEnv } from "../../auth-env";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function Page() {
  const env = await authEnv();
  return (
    <Suspense>
      <ResetPasswordForm env={env} />
    </Suspense>
  );
}
