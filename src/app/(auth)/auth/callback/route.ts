/**
 * OAuth (Google, GitHub) and email-link return point. Supabase redirects here with a
 * one-time `code` (PKCE); exchanging it sets the session cookies.
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext, supabaseConfigured } from "@/lib/supabase/config";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(reason)}`, url.origin), 303);
  if (!supabaseConfigured()) return fail("not_configured");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return fail(providerError.slice(0, 200));
  const code = url.searchParams.get("code");
  if (!code) return fail("missing_code");
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);
  // The app decides whether the person still needs to pick a username (/onboarding).
  return NextResponse.redirect(new URL(next, url.origin), 303);
}
