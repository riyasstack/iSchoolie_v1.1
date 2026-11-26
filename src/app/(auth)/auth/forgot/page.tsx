import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/features/auth/auth-forms";
import { authEnv } from "../../auth-env";

export const metadata: Metadata = { title: "Reset password" };

export default async function Page() {
  const env = await authEnv();
  return (
    <Suspense>
      <ForgotPasswordForm env={env} />
    </Suspense>
  );
}
