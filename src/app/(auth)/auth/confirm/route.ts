/**
 * Email confirmation / password recovery links (token_hash flow). Configure the Supabase
 * email templates to link to {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…
 * The default templates use the PKCE `code` flow instead, handled by /auth/callback.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext, supabaseConfigured } from "@/lib/supabase/config";

const TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(reason)}`, url.origin), 303);
  if (!supabaseConfigured()) return fail("not_configured");
  if (!tokenHash || !type || !TYPES.has(type)) return fail("invalid_link");
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail(error.message);
  const next = type === "recovery" ? "/auth/reset" : safeNext(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, url.origin), 303);
}
