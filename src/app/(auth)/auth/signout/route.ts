/** Sign out (POST only, same-origin): revokes the session and clears the auth cookies. */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || new URL(origin).host !== host) {
    return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected." } }, { status: 403 });
  }
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut({ scope: "local" });
  }
  return NextResponse.redirect(new URL("/home", req.nextUrl.origin), 303);
}
