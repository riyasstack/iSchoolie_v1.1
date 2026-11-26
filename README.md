# iSchoolie

A consumer social network web app with the layout, density and interaction patterns of
the **September 2020** responsive Twitter website, branded as iSchoolie (Posts, Reposts,
Quote Posts). One responsive codebase for phone, tablet and desktop.

> **Status: functioning demo environment, plus a live mode with real sign-in — not yet a
> public production service.**
> - `APP_MODE=demo`: no sign-in. Each browser session gets its own private, server-persisted
>   workspace filled with fictional people and posts.
> - `APP_MODE=live`: one shared network with **Supabase Auth** — sign up / log in with email +
>   password, Google or GitHub, password reset, onboarding (pick a @username), log out.
>   Visitors can browse the feed, profiles and search as read-only **guests**; any action
>   (post, reply, like, repost, follow, message, vote) asks them to sign up.
>   See [AUTH_INTEGRATION.md](AUTH_INTEGRATION.md) for setup (Supabase dashboard steps).

- Architecture & persistence: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Screen/feature checklist with verification status: [docs/CHECKLIST.md](docs/CHECKLIST.md)
- Test and performance results: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)
- Visual references vs inferences: [docs/REFERENCE_NOTES.md](docs/REFERENCE_NOTES.md)
- Screenshots: [docs/screenshots/](docs/screenshots)

## Stack

Next.js 16 (App Router) · React 19 · strict TypeScript · Tailwind CSS 4 with CSS-variable
tokens · Radix primitives · TanStack Query · zod · PostgreSQL 17 + Prisma 7 (driver
adapter) · sharp · twitter-text (Apache-2.0) for the weighted 280 count · Vitest +
Testing Library · Playwright.

## Requirements

- Node.js ≥ 20.19 (developed on 24.20) and npm 11
- PostgreSQL 15+ — either the bundled project-local server (`npm run db:start`) or your own

## Setup

```powershell
npm install
copy .env.example .env
```

Generate a session secret and put it in `.env` as `SESSION_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> `npm install` may warn that some packages' install scripts aren't covered by
> `allowScripts`. Prisma, `@prisma/engines`, `@embedded-postgres/windows-x64` and `esbuild`
> need theirs; they are approved in `package.json`.

## Run (development)

Three processes. Either run them in separate terminals:

```powershell
npm run db:start
```

```powershell
npm run db:migrate
```

```powershell
npm run dev
```

```powershell
npm run worker
```

…or all of them (database, web, worker) together after migrating once:

```powershell
npm run dev:all
```

Open http://localhost:3000 — you land directly on a populated Home feed.

- `db:start` runs a real PostgreSQL 17 (embedded-postgres) on port 54329 with data in
  `.data/postgres`, UTF-8, sessions pinned to UTC. To use your own server, set
  `DATABASE_URL` and skip `db:start`.
- The **worker** publishes scheduled posts, fetches link preview cards and deletes expired
  demo workspaces. Without it, scheduled posts stay pending and links show no card.
- Uploaded media is stored under `.data/storage` (survives restarts).

## Production build

Stop `npm run dev` first: `next build` cleans `.next`, including the running dev
server's cache, which can leave the dev server stuck reloading. Restart it if that happens.

```powershell
npm run build
```

```powershell
npm run start
```

Run `npm run worker` alongside it. `APP_MODE` must be set explicitly (`demo` or `live`);
it is independent of `NODE_ENV`. `live` uses Supabase Auth (set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, run
`npm run live:bootstrap`, and configure the dashboard as described in AUTH_INTEGRATION.md).
For local development, `npm run dev:live` runs a live-mode server on port 3001 beside the
demo server on 3000.

## Tests

```powershell
npm run lint
```

```powershell
npm run typecheck
```

```powershell
npm test
```

```powershell
npm run test:e2e
```

- `npm test` migrates the separate `ischoolie_test` database, then runs unit and
  integration tests (services against real PostgreSQL).
- `npm run test:e2e` needs the database (and the worker for the scheduling journey); it
  starts the dev server if it isn't running. The responsive journey writes screenshots to
  `docs/screenshots`.

## Other scripts

| Script | Purpose |
|---|---|
| `npm run seed:check` | Seeds a throwaway workspace, prints counts, verifies invariants, deletes it |
| `npm run assets:brand` | Rebuilds web brand assets from the supplied logo master |
| `npm run assets:seed` | Regenerates the original seed media (uses Playwright's bundled ffmpeg for the sample video) |
| `npm run db:reset` | Drops and re-migrates the dev database (development only) |
| `npx tsx scripts/measure-performance.ts http://localhost:3100` | Load/CLS metrics against a running server |
| `npx tsx scripts/capture-themes.ts` | Screenshots of Home in Default / Dim / Lights out |

## Environment variables

See [.env.example](.env.example): `APP_MODE`, `DATABASE_URL`, `EMBEDDED_PG_PORT`,
`SESSION_SECRET`, `DEMO_RETENTION_DAYS`, `DEMO_PROVISION_LIMIT_PER_HOUR`, `STORAGE_DRIVER`,
`STORAGE_DIR`, `FORCE_SECURE_COOKIES`, and `S3_*` for `STORAGE_DRIVER=s3` (AWS S3, R2 or
MinIO). Secrets never reach the browser bundle.

## Demo controls

Clearly labelled demo-only controls (account menu, drawer, Settings → Demo environment):
switch to another seeded fictional identity in your workspace, or reset your workspace.
They don't exist in live mode.

## Public-release requirements (not done here)

Enabling Google/GitHub in the Supabase dashboard and a custom SMTP sender (see
AUTH_INTEGRATION.md), running the S3 adapter against your real
bucket, a staffed moderation workflow for reports, push/email delivery services (after
sign-in exists), scale work (counters, caching), trusted-proxy configuration for IP rate
limits, and a security review. Do not deploy publicly as-is.
