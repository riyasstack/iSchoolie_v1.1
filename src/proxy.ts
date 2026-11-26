/**
 * Demo-mode entry: page navigations without a validly signed session cookie are
 * sent to /api/session/start, which provisions an isolated workspace (rate
 * limited) and returns to the requested page. Signature checks only — no DB here —
 * so an expired-but-signed session shows the recovery screen instead of
 * re-seeding on every request.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyCookie } from "@/lib/session-token";

export async function proxy(req: NextRequest) {
  if (process.env.APP_MODE !== "demo") return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  const token = await verifyCookie(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
  if (token) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/api/session/start";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Pages only: skip API, Next internals, static assets, and the offline/error page.
  matcher: ["/((?!api/|_next/|brand/|favicon|icon|apple-icon|manifest|robots|offline).*)"],
};
