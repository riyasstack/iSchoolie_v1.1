# Deploying to Vercel (live mode, Supabase Postgres + Storage)

Project: **ischoolie_v2.1**, imported from `riyasstack/iSchoolie_v1.1` (branch `main`).

## 1. Import

Vercel → Add New → Project → import `riyasstack/iSchoolie_v1.1`.

- Project name: `ischoolie_v2.1`
- Framework preset: Next.js
- Build command: `npm run vercel-build` (prisma generate → prisma migrate deploy → next build)
- Install command / output directory: defaults

## 2. Environment variables (Production + Preview)

Non-secret values — paste as-is (Vercel's env editor accepts a pasted `.env` block):

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

Secrets — add these yourself (mark them *Sensitive*):

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → **Connect** → *Transaction pooler* URI (port **6543**), with your DB password |
| `DIRECT_URL` | Supabase → **Connect** → *Session pooler* URI (port **5432**) — used only for migrations |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase → **Storage → Settings → S3 access keys** → New access key |
| `CRON_SECRET` | Any long random string (e.g. `openssl rand -hex 32`) |

The `ischoolie-media` bucket already exists (private, 50 MB limit).

## 3. Supabase Auth URLs

Supabase → Authentication → URL Configuration:

- Site URL: your production URL, e.g. `https://ischoolie-v2-1.vercel.app`
- Redirect URLs: add `https://ischoolie-v2-1.vercel.app/**` (and your custom domain, if any)

Enable Google / GitHub under Authentication → Providers with the callback
`https://elwhfprrylzzrmabbsus.supabase.co/auth/v1/callback`.

## 4. After the first deploy

- The build applies all Prisma migrations to Supabase, including
  `lock_supabase_data_api`, which keeps the app's tables away from Supabase's public
  Data API (RLS on, API roles revoked).
- The LIVE network is created on first request. For fictional starter content so guests
  have something to browse, run once from your machine with `DATABASE_URL` pointing at
  Supabase: `npm run live:bootstrap -- --sample`.
- Hobby plan crons run once a day; due jobs (scheduled posts, link previews) also run
  in the background after API requests (`INLINE_JOBS=true`).
- Realtime is off on Vercel (`REALTIME=off`): badges and new messages update by polling.
