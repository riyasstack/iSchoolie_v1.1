import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/config";
import type { AuthEnv } from "@/features/auth/auth-forms";

/**
 * Which sign-in methods the Supabase project has enabled (public /auth/v1/settings,
 * cached for a minute). If it can't be read, OAuth buttons stay available and Supabase
 * reports any problem on click.
 */
async function enabledProviders(): Promise<AuthEnv["providers"]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { external?: Record<string, boolean>; disable_signup?: boolean };
    return { google: !!j.external?.google, github: !!j.external?.github, email: j.external?.email !== false, signupDisabled: !!j.disable_signup };
  } catch {
    return { google: true, github: true, email: true, signupDisabled: false };
  }
}

export async function authEnv(): Promise<AuthEnv> {
  const mode = process.env.APP_MODE === "live" ? "live" : "demo";
  const configured = supabaseConfigured();
  const providers = mode === "live" && configured ? await enabledProviders() : { google: false, github: false, email: false, signupDisabled: true };
  return { mode, configured, providers };
}
