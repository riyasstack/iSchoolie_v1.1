/**
 * Minimal typed router for the JSON API (src/app/api/[...path]/route.ts).
 * Responsibilities: request ids, structured logs, same-origin/CSRF enforcement,
 * session resolution, validation and error mapping.
 */
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";
import { log } from "./log";
import { resolveRequestContext, type RequestContext } from "./context";
import { isMember } from "./viewer";

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface HandlerArgs {
  req: NextRequest;
  url: URL;
  params: Record<string, string>;
  ctx: RequestContext;
  requestId: string;
  json: <T>(schema: ZodType<T>) => Promise<T>;
  query: <T>(schema: ZodType<T>) => T;
}

export interface PublicHandlerArgs extends Omit<HandlerArgs, "ctx"> {
  ctx: null;
}

export interface RouteDef {
  method: Method;
  pattern: string;
  /** Default true. Public routes receive ctx = null. */
  auth?: boolean;
  /** Default true for non-GET. Disable only for top-level navigations. */
  csrf?: boolean;
  /** Live mode: read-only guests (not signed in) may call this route. Default false. */
  guest?: boolean;
  /** Live mode: signed-in viewers without a profile yet may call this route. Default false. */
  onboarding?: boolean;
  handler: (args: HandlerArgs) => Promise<unknown>;
}

interface Compiled extends RouteDef {
  re: RegExp;
  keys: string[];
}

export function compile(routes: RouteDef[]): Compiled[] {
  return routes.map((r) => {
    const keys: string[] = [];
    const src = r.pattern
      .split("/")
      .map((seg) => {
        if (seg.startsWith(":")) {
          keys.push(seg.slice(1));
          return "([^/]+)";
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    return { ...r, re: new RegExp(`^${src}/?$`), keys };
  });
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export interface DispatcherOptions {
  /** Injectable for tests; defaults to the request-scoped resolver. */
  resolve?: () => Promise<RequestContext>;
}

/** Guests and onboarding viewers are read-only: everything not explicitly allowed is refused. */
export function assertViewerAllowed(route: Pick<RouteDef, "guest" | "onboarding">, ctx: RequestContext) {
  if (isMember(ctx)) return;
  if (ctx.viewer === "onboarding") {
    if (route.onboarding || route.guest) return;
    throw new AppError("ONBOARDING_REQUIRED", "Finish setting up your profile to do that.");
  }
  if (route.guest) return;
  throw new AppError("SIGN_UP_REQUIRED", "Sign up or log in to do that.");
}

export function createDispatcher(routes: RouteDef[], options: DispatcherOptions = {}) {
  const table = compile(routes);
  const resolve = options.resolve ?? resolveRequestContext;
  return async function dispatch(req: NextRequest, segments: string[]): Promise<Response> {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const url = new URL(req.url);
    const path = "/" + segments.map(encodeURIComponent).join("/");
    const method = req.method as Method;
    let status = 200;
    let workspace: string | undefined;
    try {
      let match: { route: Compiled; params: Record<string, string> } | null = null;
      let pathMatched = false;
      for (const route of table) {
        const m = route.re.exec(path);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        const params: Record<string, string> = {};
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        match = { route, params };
        break;
      }
      if (!match) {
        throw new AppError(pathMatched ? "VALIDATION" : "NOT_FOUND", pathMatched ? "Method not allowed." : "Unknown API route.");
      }
      const { route, params } = match;
      if (method !== "GET" && route.csrf !== false) {
        if (!sameOrigin(req) || req.headers.get("x-ischoolie-csrf") !== "1") {
          throw new AppError("CSRF", "Cross-site request rejected.");
        }
      }
      const ctx = route.auth === false ? null : await resolve();
      if (ctx) assertViewerAllowed(route, ctx);
      workspace = ctx?.workspace.id;
      const args = {
        req,
        url,
        params,
        ctx,
        requestId,
        json: async <T,>(schema: ZodType<T>) => {
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            throw new AppError("VALIDATION", "Request body must be JSON.");
          }
          return schema.parse(body);
        },
        query: <T,>(schema: ZodType<T>) => schema.parse(Object.fromEntries(url.searchParams)),
      } as HandlerArgs;
      const result = await route.handler(args);
      if (result instanceof Response) {
        status = result.status;
        result.headers.set("x-request-id", requestId);
        return result;
      }
      const res = NextResponse.json({ data: result ?? null });
      res.headers.set("cache-control", "private, no-store");
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      let appErr: AppError;
      if (err instanceof AppError) appErr = err;
      else if (err instanceof ZodError) {
        appErr = new AppError("VALIDATION", err.issues[0]?.message ?? "Invalid request.", err.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      } else if (isUniqueViolation(err)) {
        appErr = new AppError("CONFLICT", "That already exists.");
      } else {
        appErr = new AppError("INTERNAL", "Something went wrong. Try again.");
        log("error", "unhandled", { requestId, path, method, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), stack: err instanceof Error ? err.stack?.split("\n").slice(0, 6).join(" | ") : undefined });
      }
      status = appErr.status;
      const res = NextResponse.json(
        { error: { code: appErr.code, message: appErr.message, details: appErr.details, requestId } },
        { status },
      );
      res.headers.set("x-request-id", requestId);
      res.headers.set("cache-control", "private, no-store");
      if (appErr.code === "RATE_LIMITED") {
        const retry = (appErr.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
        if (retry) res.headers.set("retry-after", String(retry));
      }
      return res;
    } finally {
      log(status >= 500 ? "error" : "info", "api", { requestId, method, path: routeLabel(path), status, ms: Date.now() - started, ws: workspace?.slice(-6) });
    }
  };
}

/** Avoid logging ids verbatim; keep the route shape. */
function routeLabel(path: string) {
  return path.replace(/\/[a-z0-9]{20,}/gi, "/:id");
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; meta?: unknown; cause?: { code?: string } } | null;
  return !!e && (e.code === "P2002" || e.code === "23505" || e.cause?.code === "23505");
}
