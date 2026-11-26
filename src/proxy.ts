/**
 * Request gate (runs before every page).
 *
 * Demo mode: page navigations without a validly signed session cookie are sent to
 * /api/session/start, which provisions an isolated workspace (rate limited) and returns
 * to the requested page. Signature checks only — no DB here.
 *
 * Live mode: refreshes the Supabase Auth session (rotating cookies), sends signed-out
 * visitors away from private pages to /signin, and signed-in people away from the
 * sign-in/sign-up pages. Guests may browse public pages read-only; the API enforces the
 * same rules independently (src/server/http.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SESSION_COOKIE, verifyCookie } from "@/lib/session-token";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/config";

/** Pages that only make sense with an account (everything else is browsable by guests). */
const PRIVATE_PREFIXES = [
  "/messages", "/notifications", "/i/bookmarks", "/settings", "/compose", "/i/follower_requests",
  "/i/lists/create", "/i/moments/create", "/i/connect", "/onboarding",
];
const PRIVATE_PATTERNS = [/^\/i\/(lists|moments)\/[^/]+\/edit\/?$/];
const AUTH_PAGES = ["/signin", "/signup"];
/** Auth flow pages/routes that must work whatever the session state. */
const AUTH_FLOW = /^\/(auth\/|signin|signup)/;

function matchesPrefix(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

export function isPrivatePath(path: string): boolean {
  return matchesPrefix(path, PRIVATE_PREFIXES) || PRIVATE_PATTERNS.some((re) => re.test(path));
}

export async function proxy(req: NextRequest) {
  const mode = process.env.APP_MODE;
  if (mode === "live") return liveProxy(req);
  if (mode !== "demo") return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  // Sign-in pages explain that demo mode needs no account; don't provision for them.
  if (AUTH_FLOW.test(pathname)) return NextResponse.next();
  const token = await verifyCookie(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
  if (token) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/api/session/start";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url, 307);
}

async function liveProxy(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(list, headers) {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v);
      },
    },
  });
  // Must run before anything else: verifies the JWT and refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const { pathname, search } = req.nextUrl;

  const redirect = (path: string) => {
    const url = req.nextUrl.clone();
    const [p, q] = path.split("?");
    url.pathname = p;
    url.search = q ? `?${q}` : "";
    const r = NextResponse.redirect(url, 307);
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    r.headers.set("cache-control", "private, no-store");
    return r;
  };

  if (!signedIn && isPrivatePath(pathname)) {
    return redirect(`/signin?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && AUTH_PAGES.includes(pathname.replace(/\/$/, ""))) {
    const next = req.nextUrl.searchParams.get("next");
    return redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
  }
  return res;
}

export const config = {
  // Pages only: skip API, Next internals, static assets, and the offline/error page.
  matcher: ["/((?!api/|_next/|brand/|favicon|icon|apple-icon|manifest|robots|offline).*)"],
};
