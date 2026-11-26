# Authentication (Supabase Auth)

iSchoolie has two modes, chosen by `APP_MODE` (independent of `NODE_ENV`):

| Mode | Who you are | Sign-in |
|---|---|---|
| `demo` | An anonymous, isolated sandbox per browser (HMAC-signed `isc_session` cookie → `DemoSession` → private workspace of fictional people). | None. `/signin` and `/signup` explain that no account is needed. |
| `live` | One shared network (the single `LIVE` workspace). Visitors are **guests** (read-only) until they sign up. | Supabase Auth: email + password (with email confirmation), Google, GitHub, password reset, sign out. |

An unset or unknown `APP_MODE` is a configuration error. Live mode never falls back to
demo mode.

## What's built

| Piece | Where |
|---|---|
| Supabase clients (browser / server, cookie-based PKCE sessions) | `src/lib/supabase/{browser,server,config}.ts` |
| Session refresh + page gating (runs before every page) | `src/proxy.ts` (`liveProxy`) |
| Verified identity → viewer (`guest` / `onboarding` / `member`) | `src/server/context.ts` (`resolveLiveContext`) + `src/server/auth.ts` |
| Identity ↔ profile link | `AuthIdentity` model (`provider`, `subject` unique, `userId` unique, `email`) — migration `auth_identities` |
| API gating for guests | `src/server/http.ts` (`assertViewerAllowed`) + `GUEST_READ_ROUTES` in `src/server/api-routes.ts` |
| Pages | `/signin`, `/signup`, `/auth/forgot`, `/auth/reset`, `/onboarding` (`src/app/(auth)`, UI in `src/features/auth/auth-forms.tsx`) |
| Route handlers | `/auth/callback` (OAuth + email-link PKCE code exchange), `/auth/confirm` (token-hash email links), `/auth/signout` (POST, same-origin) |
| Guest UI | Sign-up prompt dialog, `GuestGate`, `useRequireAccount`, guest composer CTA, bottom "Don't miss what's happening" bar, guest nav (`src/components/providers.tsx`, `src/components/layout/app-shell.tsx`) |
| Account settings (live) | Settings → Your account → Sign-in and security: email, sign-in methods, change/set password, log out |
| Live network setup | `npm run live:bootstrap [-- --sample]` (`scripts/live-bootstrap.ts`) |

### Flow

1. **Guest** (no Supabase session): can read the public timeline (Home shows newest
   original posts from public accounts), post pages, profiles, followers/following,
   lists, topics, moments, Explore and Search. Protected accounts stay hidden exactly
   as for any non-follower. Clicking reply / repost / like / vote / follow / Post /
   any other action opens the **sign-up prompt**; account pages (`/messages`,
   `/notifications`, `/i/bookmarks`, `/settings`, `/compose`, create/edit pages,
   `/onboarding`) redirect to `/signin?next=…`.
2. **Sign up** with email + password (Supabase sends a confirmation email; the link
   returns through `/auth/callback`), or **Continue with Google / GitHub** (OAuth via
   Supabase, back through `/auth/callback`).
3. **Onboarding**: a signed-in Supabase user without a profile is sent to
   `/onboarding` to pick a name and an available `@username` (suggested from the
   provider profile). This creates `User` + `Preferences` + `AuthIdentity` in the LIVE
   workspace, once per identity.
4. **Member**: full access. Demo-only controls (identity switcher, workspace reset) are
   hidden and refused by the API (`capabilities` are false in live).
5. **Log out**: account menu → *Log out @handle* (or Settings → Your account), which
   POSTs to `/auth/signout` and clears the session cookies.
6. **Forgot password**: `/auth/forgot` emails a recovery link → `/auth/callback` →
   `/auth/reset` (new password; all sessions are then signed out).

### Server-side enforcement (doesn't rely on the UI)

- `getClaims()` verifies the Supabase JWT on every request (proxy and API). Nothing
  about identity is read from request bodies.
- The router refuses everything not in `GUEST_READ_ROUTES` for guests with
  `401 SIGN_UP_REQUIRED`, and for signed-in-but-not-onboarded viewers with
  `403 ONBOARDING_REQUIRED` (only `/onboarding*` and the guest reads are allowed).
  Every guest-allowed route is a `GET`; this is asserted in tests.
- Guest reads have no side effects: no view events, no recent-search rows, no
  preference rows.
- Post-auth redirects (`next=`) accept same-site relative paths only (`safeNext`).
- CSRF: the API keeps its same-origin `Origin` + `x-ischoolie-csrf` check; sign-out is
  POST with an Origin check.
- Passwords go from the browser straight to Supabase Auth. The app server never sees
  them and stores no credentials.

## Configuration

### 1. Environment (`.env`)

```bash
APP_MODE=live
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # public key, safe in the browser
```

The project used here is **ischoolie** in the *iSchoolie's Team* organization
(`https://elwhfprrylzzrmabbsus.supabase.co`). Its URL and publishable key are in the
local `.env` (gitignored). No secret/service-role key is needed or used.

To run live mode beside the demo server: `npm run dev:live` (port 3001, separate
`.next-live` build dir).

### 2. Supabase dashboard (one-time, done by the project owner)

**Authentication → URL Configuration**

- Site URL: your app origin, e.g. `http://localhost:3000` (production: your domain).
- Redirect URLs: add `http://localhost:3000/**` and `http://localhost:3001/**` (and your
  production origin `/**`). OAuth and email links are only sent back to listed URLs.

**Authentication → Sign In / Providers**

- **Email**: enabled by default. Keep *Confirm email* on.
- **Google**: create an OAuth client in Google Cloud Console (type *Web application*),
  add the authorized redirect URI
  `https://elwhfprrylzzrmabbsus.supabase.co/auth/v1/callback`, then paste the client ID
  and secret into Supabase and enable the provider.
- **GitHub**: create an OAuth App (GitHub → Settings → Developer settings), set the
  callback URL to `https://elwhfprrylzzrmabbsus.supabase.co/auth/v1/callback`, then paste
  the client ID and secret into Supabase and enable the provider.

The sign-in pages read the project's public `/auth/v1/settings` and show a provider
button as *(not enabled yet)* until it's enabled in the dashboard.

**Email templates (optional)**: the default templates work with `/auth/callback`
(PKCE code flow). If you switch to token-hash links, point them at
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (or
`type=recovery`). For production, configure a custom SMTP sender — Supabase's built-in
sender is heavily rate-limited.

### 3. The live network

```bash
npm run live:bootstrap              # creates the LIVE workspace if missing
npm run live:bootstrap -- --sample  # optional: adds the fictional starter network once
```

`--sample` adds the same clearly fictional seed accounts and posts the demo uses, so
guests have something to browse on a brand-new network. Seed accounts can't be signed
in to. Leave it out for a real launch; members' posts then make up the feed.

## Data boundaries

- Demo workspaces are never converted into real accounts; a visitor who signs up starts
  fresh in the LIVE workspace.
- App data (posts, follows, DMs, …) stays in the app's own Postgres. Supabase holds only
  the auth users. `AuthIdentity.subject` is the Supabase user id.
- Deleting a Supabase user doesn't delete the iSchoolie profile; an operator must
  remove the `User` row (cascades to `AuthIdentity`).

## Tests

- `tests/integration/auth-live.test.ts` — claims → viewer mapping, onboarding rules
  (one profile per identity, taken/reserved/malformed handles), guest reads through the
  real dispatcher, 14 guest writes/private reads refused with nothing written,
  onboarding-only access, members without demo controls.
- `tests/unit/auth-paths.test.ts` — `safeNext` open-redirect protection and which pages
  are private.
- `tests/e2e/live-guest.spec.ts` (Playwright project `live-guest`, live server on :3001)
  — guest feed/search/profile, sign-up prompts on like/reply/repost/follow, private page
  redirects, API 401s, sign-in/sign-up/forgot pages, onboarding gate, callback errors.

Not covered by automated tests (needs real third-party accounts): completing a Google
or GitHub OAuth round trip and clicking a real confirmation email. Those depend on the
dashboard configuration above.
