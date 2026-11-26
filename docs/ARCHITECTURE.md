# Architecture and persistence notes

## Layers

```
src/app/                 Route composition only (App Router pages, layouts, intercepting modal routes)
  (app)/                 Everything behind the session gate + responsive shell
  (app)/@modal/          Intercepted dialogs: compose, photo/video viewer, display, shortcuts
  api/[...path]/route.ts One route handler → typed router (src/server/http.ts)
src/features/            Presentation by feature (posts, timeline, compose, profiles, messages, …)
src/components/          Shared UI primitives (Radix-based dialog/menu/popover) and the shell
src/lib/                 Code shared by client and server: text rules, schemas, DTO types, formatting
src/server/
  context.ts             resolveRequestContext() — the only source of actor/workspace
  http.ts                Router: request ids, structured logs, CSRF, errors, validation
  api-routes.ts          Route table → services
  policy.ts              Pure visibility / interaction rules (unit-tested)
  services/              Domain services (posts, timelines, users, messages, collections, compose, media, search, account, workspace)
  seed/                  Deterministic fixtures + per-workspace seeder
  storage/               Media storage adapter
scripts/worker.ts        Durable job worker (separate process)
```

Client data uses **TanStack Query** only. Every `PostDTO` is cached once at
`["post", id]`; timelines store entry ids, so a like/repost/bookmark/vote in any screen
updates every screen. Mutations are optimistic with rollback; the server response
replaces the cached entity. Switching demo actor clears the whole cache and reloads
the page (no viewer-scoped data survives).

## Tenancy and isolation

- Every table has `workspaceId`. Relations use **composite foreign keys**
  `(workspaceId, id)`, so a valid id from another workspace cannot be attached — the
  database rejects it (covered by an integration test).
- Demo: one `DemoWorkspace` per browser session, seeded on first visit (~0.5 s).
  Live (future): a single `LIVE` workspace for the shared network (see `AUTH_INTEGRATION.md`).
- Provisioning is rate-limited per client IP (`DEMO_PROVISION_LIMIT_PER_HOUR`) and
  globally. Workspaces expire after `DEMO_RETENTION_DAYS` of inactivity; the worker deletes
  them with their uploads (`ws/<workspaceId>/` prefix). Storage quota: 300 MB per workspace.
- An expired-but-signed cookie shows a recovery screen; the proxy never re-seeds on
  failed lookups (it verifies the signature only).

## Data model highlights (`prisma/schema.prisma`)

- Uniqueness prevents duplicates: `Follow`, `Like`, `Repost`, `Bookmark` (composite PKs),
  `PollVote (pollId, userId)`, `Post (authorId, clientKey)` and `Post.publicationKey`,
  `Message (senderId, clientKey)`, `Notification (workspaceId, dedupeKey)`,
  `Job.uniqueKey`, `PostEvent.dedupeKey`.
- Posts are soft-deleted (`deletedAt`) so reply chains and quotes render
  "This post was deleted" tombstones.
- Counts (likes, reposts, quotes, replies, followers, …) are **derived from rows at read
  time** — there are no UI-owned counters. At large scale, add transactional counters.
- All timestamps are UTC `timestamp(3)`. Every DB session is pinned to `timezone=UTC`
  (`src/server/db.ts`) so `CURRENT_TIMESTAMP` defaults match application time.

## Visibility policy (`src/server/policy.ts`)

| Rule | Where enforced |
|---|---|
| Protected authors visible only to approved followers (posts, media, likes tab, connections, quotes, moments) | serializer, timelines, search, media delivery, moments |
| Blocks: both directions hidden; no follow/reply/like/quote/DM/list-add | serializer + each mutation |
| Mutes: viewer-only filtering of Home/Latest/lists/topics, notifications, search | timelines, notifications, search |
| Muted words: Home-scope and notification-scope | timelines, notifications |
| Reply audience (EVERYONE / FOLLOWING / MENTIONED) on conversation root | `replyEligibility`, checked again on create |
| Protected posts can't be reposted | `canRepost` |

## Home and Latest

- **Latest**: viewer + followed accounts (+ replies among them) and reposts by followed
  accounts, newest first, cursor `(timestamp, key)`, deduplicated by post.
- **Home**: deterministic ranking, documented in `src/server/services/timelines.ts`
  and the Help Center: recency half-life 18 h × engagement boost × source weight
  (followed 1.0, topic 0.55, liked-by-2+-follows 0.45). Engagement is counted as of the
  first page's `asOf`, so paging is stable. Not a recreation of any proprietary algorithm.
- New posts surface only through "Show N new posts" (30 s poll while visible).

## Jobs and scheduling

- `Job` table + `scripts/worker.ts` (run as its own process). Claims due jobs with
  `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, a 5-minute lease for crashed
  workers, exponential backoff, `maxAttempts`.
- Scheduled publication: unique job key per (scheduled post, time); the handler locks the
  `ScheduledPost` row, checks status and that the job's time is still current (so a
  reschedule supersedes it), and creates posts with unique `publicationKey`s → retries can't
  duplicate. Permanent validation failures are recorded as `FAILED` with the reason.
- Recurring cleanup job deletes expired demo workspaces, sessions and old rate-limit rows.

## Media

- Upload: `POST /api/media` (multipart, XHR progress/cancel on the client). Type is
  detected by magic bytes. Images are re-encoded with sharp (EXIF/location stripped,
  orientation applied, ≤ 4096 px; thumbnails ≥ 900 px). GIFs keep animation plus a still.
  Videos (MP4/WebM, ≤ 40 MB) are stored as uploaded — **no transcoding** in this build;
  dimensions come from client-side metadata (bounded).
- Delivery: `GET /api/media/:id` authorizes every read (post visibility, conversation
  membership, owner for unattached files), supports HTTP Range for video seeking, sends
  `nosniff`, a restrictive CSP, and `no-store` for message and protected media.
- Storage adapter (`src/server/storage`): `local` driver writes under `STORAGE_DIR`
  (survives restarts; atomic rename). Seed media is read-only under `assets/seed`.
  **Production adapter (not implemented here):** implement `StorageAdapter`
  (`put/get/delete/deletePrefix`) against an S3-compatible bucket with private objects;
  keep delivery behind `/api/media/:id` (or short-lived signed URLs issued after the same
  authorization). Selecting an unknown `STORAGE_DRIVER` fails loudly — no silent fallback.

## Messaging

Near-realtime polling: 4 s for the open conversation, 15 s for the inbox, paused when
the tab is hidden. Messages are idempotent per `(senderId, clientKey)`; the client keeps
failed messages with their key for retry. Read receipts are stored per participant
(`lastReadAt`) and shown only when both sides allow them. Group rules: any member can add
people or rename; only the admin can remove; the admin role passes on when the admin leaves.

## Security

- Session: opaque 256-bit token, HMAC-signed cookie, token stored only as SHA-256 hash.
- CSRF: SameSite=Lax cookie + same-origin `Origin` check + required `x-ischoolie-csrf`
  header on every non-GET API call.
- Inputs validated with zod (shared client/server schemas). User text is rendered as
  React text nodes; only `http(s)` links become anchors (`rel="noopener noreferrer nofollow ugc"`).
- Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`. No secrets are bundled to the browser.
- Rate limits are persisted in PostgreSQL (posting, likes, reposts, follows, uploads,
  messages, searches, reports, provisioning).
- No external link-preview fetching is implemented (so no SSRF surface).

## Observability

Structured JSON logs with request ids (`x-request-id` response header), route shape (ids
masked), status and latency; message bodies and post text are never logged.
`GET /api/health` checks the database. UI error boundaries offer retry.

## Known limits (honest)

- Demo-scale queries (graph loaded per request, counts at read time, `LIKE` search).
  Fine for ~30 accounts × hundreds of posts; a public deployment needs indexes/full-text
  search and counters.
- Video transcoding/thumbnailing, push/email delivery and external GIF providers are not
  connected.
- Rate limiting by IP trusts `x-forwarded-for`; configure your proxy accordingly.
