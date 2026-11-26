# Deploying to Vercel (live mode, Supabase Postgres + Storage)

Project: **ischoolie_v2.1** (team `green-9edc`), Git-linked to `riyasstack/iSchoolie_v1.1`
branch `main` — every push to `main` deploys to production.

Production URL: **https://ischooliev21.vercel.app** (deployment-specific URLs such as
`ischooliev21-xxxx-green-9edc.vercel.app` sit behind Vercel's login protection).

## 1. Project settings

- Framework preset: Next.js (also set by `vercel.json`)
- Build command: `npm run vercel-build` = `prisma generate && next build`.
  The build does **not** touch the database (see "Migrations" below).
- Install command / output directory: defaults

## 2. Environment variables (Production)

Non-secret config, set as Vercel *Config* variables:

```env
APP_MODE=live
NEXT_PUBLIC_SUPABASE_URL=https://elwhfprrylzzrmabbsus.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_GxA1fg_mBnVnhmVTynAKyw_u-IMt8U2
STORAGE_DRIVER=s3
S3_BUCKET=ischoolie-media
S3_REGION=ap-northeast-1
S3_ENDPOINT=https://elwhfprrylzzrmabbsus.storage.supabase.co/storage/v1/s3
S3_FORCE_PATH_STYLE=true
DB_PIN_TIMEZONE=false
DB_POOL_MAX=5
REALTIME=off
INLINE_JOBS=true
FORCE_SECURE_COOKIES=true
```

Database connection (as deployed):

- `DATABASE_URL` (Secret) — the Supabase connection string with the DB password.
- `SUPABASE_POOLER_HOST=aws-0-ap-northeast-1.pooler.supabase.com` (Config).
  Supabase's direct host `db.<ref>.supabase.co` is IPv6-only and unreachable from Vercel;
  with this set, the app rewrites a direct URL to the project's IPv4 pooler (transaction
  mode, port 6543, user `postgres.<ref>`). See `src/server/db-url.ts`.

Alternatively the **Supabase ↔ Vercel integration** can sync `POSTGRES_PRISMA_URL`,
`POSTGRES_URL_NON_POOLING`, … — the app reads those when `DATABASE_URL` isn't set. When
installing it, choose **Link Existing Supabase Account**; the default *Create New* makes a
separate empty database.

Secrets still to add by hand (type *Secret*), when needed:

| Variable | Needed for | Where to get it |
|---|---|---|
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | photo/video uploads | Supabase → **Storage → Settings → S3 access keys** → New access key |
| `CRON_SECRET` | the daily cron (`/api/cron/jobs`) | Any long random string |

The `ischoolie-media` bucket already exists (private, 50 MB limit).

## 3. Migrations

The Supabase database was migrated on 26 Nov 2026 (all 5 Prisma migrations, recorded in
`_prisma_migrations`; schema fingerprint identical to a local `prisma migrate deploy`).
For future migrations, run from your machine with a session-mode connection:

```bash
DIRECT_URL="postgresql://…pooler.supabase.com:5432/postgres" npm run db:migrate
```

Every new table must also get RLS + revoked API grants (see migration
`20261126130000_lock_supabase_data_api`), because Supabase exposes `public` tables
through its Data API.

## 4. Supabase Auth URLs

Supabase → Authentication → URL Configuration:

- Site URL: the production URL, e.g. `https://ischoolie-v2-1.vercel.app`
- Redirect URLs: add `https://ischoolie-v2-1.vercel.app/**` (and any custom domain)

Enable Google / GitHub under Authentication → Providers with the callback
`https://elwhfprrylzzrmabbsus.supabase.co/auth/v1/callback`.

## 5. Notes

- The LIVE network is created on first request. For fictional starter content so guests
  have something to browse, run once from your machine with `DATABASE_URL` pointing at
  Supabase: `npm run live:bootstrap -- --sample`.
- Hobby plan crons run once a day; due jobs (scheduled posts, link previews) also run
  in the background after API requests (`INLINE_JOBS=true`).
- Realtime is off on Vercel (`REALTIME=off`): badges and new messages update by polling.
