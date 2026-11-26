# Authentication integration guide

iSchoolie currently runs in **demo mode** with no sign-in. This document describes
exactly where real authentication plugs in, what must change, and what must not.

## The seam: `resolveRequestContext()`

All server code gets "who is asking" from one function in
[`src/server/context.ts`](src/server/context.ts):

```ts
export interface RequestContext {
  mode: "demo" | "live";
  actor: { id: string; handle: string };
  workspace: { id: string; kind: "DEMO" | "LIVE"; createdAt: Date; expiresAt: Date | null };
  capabilities: { switchActor: boolean; resetWorkspace: boolean };
  sessionHash?: string; // demo only
}
```

- Every API handler in [`src/server/api-routes.ts`](src/server/api-routes.ts) receives
  `ctx` from the router, which calls `resolveRequestContext()`.
- Feature services (`src/server/services/*`) take `ctx` as their first argument and
  never read user ids, workspace ids, ownership or roles from request bodies.
- The root layout uses `tryResolveRequestContext()` only to choose the theme for the
  first paint.

Replacing authentication means replacing the body of `resolveLiveContext()`; feature
services stay unchanged.

## Modes (`APP_MODE`, independent of `NODE_ENV`)

| Mode | Behaviour today |
|---|---|
| `demo` | Opaque HMAC-signed `isc_session` cookie (HttpOnly, SameSite=Lax, Secure over HTTPS) → `DemoSession` row (stored as SHA-256 hash) → workspace + actor. |
| `live` | `resolveLiveContext()` throws `AUTH_NOT_CONFIGURED` (HTTP 503) for every private API call. Startup logs an error. **It never falls back to demo mode.** |

An unset or unknown `APP_MODE` is a configuration error (startup fails in
`src/instrumentation.ts`).

## Steps to add real authentication

1. **Choose a provider** (e.g. an OIDC provider or a session library such as the one
   recommended in the Next.js authentication guide). Keep the provider's session
   validation server-side; issue only HttpOnly, Secure, SameSite cookies.
2. **Create the shared live network once.** Insert one `DemoWorkspace` row with
   `kind = LIVE` (the model name is historical; it is the tenancy namespace). All real
   accounts live in this single workspace, so they form one social graph. Do **not**
   create a workspace per account.
3. **Link identities to users.** Add an `AuthIdentity` model
   (`provider`, `subject` unique, `userId` → `User`) in a new migration. On first
   sign-in, create a `User` + `Preferences` in the LIVE workspace with a validated,
   unique handle (`validateHandle()` in `src/lib/text.ts` reserves route names), and set
   `isSeedActor = false`.
4. **Implement `resolveLiveContext()`**:
   ```ts
   const session = await provider.getSession();          // server-side validation
   if (!session) throw new AppError("SESSION_REQUIRED", "Sign in to continue.");
   const identity = await prisma.authIdentity.findUnique({ where: { provider_subject: … } });
   const user = …; // suspended → FORBIDDEN
   return {
     mode: "live",
     actor: { id: user.id, handle: user.handle },
     workspace: { id: LIVE_WORKSPACE_ID, kind: "LIVE", createdAt, expiresAt: null },
     capabilities: { switchActor: false, resetWorkspace: false },
   };
   ```
5. **Proxy**: [`src/proxy.ts`](src/proxy.ts) only provisions demo sessions when
   `APP_MODE=demo`. In live mode, redirect unauthenticated page requests to your
   sign-in route instead.
6. **Remove demo controls from live builds**: the switcher/reset endpoints already
   require `capabilities.switchActor/resetWorkspace` (false in live). The UI hides them
   when those capabilities are false — keep it that way. Also hide `DemoNotice`.
7. **Account settings**: wire the "Sign-in and security" rows in
   `src/features/settings/settings.tsx` (password, email, phone, sessions,
   deactivation) to the provider. They are shown as unavailable today on purpose.
8. **CSRF**: the router already enforces same-origin `Origin` + the
   `x-ischoolie-csrf` header on every non-GET request. Keep that when adding the
   provider's own callback routes (exempt only the provider callbacks, never the API).
9. **Rate limits**: switch keys from IP to the authenticated user where appropriate,
   and configure your proxy so `x-forwarded-for` is trustworthy.

## Migration boundary: demo data is never imported

- Demo workspaces are anonymous isolation namespaces with fictional content. They are
  deleted by the worker after `DEMO_RETENTION_DAYS` of inactivity.
- **Do not** convert a demo session, demo actor or demo workspace into a real account.
  A visitor who later signs up starts fresh in the LIVE workspace.
- Seeded fixtures (`src/server/seed`) are for demo workspaces only. Don't seed the LIVE
  workspace with fictional people.
- Authorization stays actor-level inside the LIVE workspace: visibility, blocks,
  protected accounts, list privacy and conversation membership are enforced by the same
  services and policy (`src/server/policy.ts`).

## Checklist before enabling `APP_MODE=live`

- [ ] `resolveLiveContext()` implemented and unit-tested (missing/expired/forged sessions).
- [ ] LIVE workspace row created; `AuthIdentity` migration applied.
- [ ] Sign-in/out routes; proxy redirects unauthenticated pages.
- [ ] Demo controls hidden; `/api/session/start|actor|reset` return 403/503 in live.
- [ ] Production storage adapter configured (see `docs/ARCHITECTURE.md`).
- [ ] Moderation workflow for `Report` records staffed and documented.
- [ ] Email/push delivery only after a real delivery service exists.
- [ ] Load testing; denormalized counters if needed (counts are computed at read time today).
