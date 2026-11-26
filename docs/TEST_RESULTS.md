# Test and measurement results

Recorded 24 Nov 2026 on Windows 11 (Node 24.20, PostgreSQL 17 embedded, Chromium 159 via
Playwright 1.65.1). These are the results of runs actually executed during the build.

## Static checks

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | 0 errors, 0 warnings |
| Types | `npm run typecheck` | pass |
| Production build | `npm run build` | pass (69 routes, proxy) |
| Seed integrity | `npm run seed:check` | pass — 27 users, 126 posts (1 deleted tombstone), 3 polls, 6 conversations, ~360 notifications; seeds in ~0.5 s |

## Unit + integration (`npm test`) — 50 passed / 0 failed

- `tests/unit/text.test.ts` — weighted 280 count (URLs = 23, emoji/CJK = 2), entity
  extraction, `javascript:`/`data:` never linked, reserved handles, muted-word matching, RTL.
- `tests/unit/policy.test.ts` — protected/blocked/suspended access, all three reply
  audiences, feed/notification filters, protected reposts.
- `tests/unit/search-and-time.test.ts` — search operators, advanced-search round trip,
  DST-correct time-zone conversion for scheduling.
- `tests/unit/rich-text.test.tsx` — user text never rendered as HTML, safe link attributes, RTL.
- `tests/integration/services.test.ts` (real PostgreSQL `ischoolie_test`, two seeded workspaces):
  idempotent posting; server-side media ownership; synchronized like/repost/bookmark counts and
  deduplicated notifications; reply-audience enforcement; forged delete/pin refused; hidden
  replies; one vote per actor, closed polls and author votes refused; follow counts; protected
  content hidden in URL/timelines/likes/connections/search/media until approval; protected
  repost refused; block and mute effects; notification preferences; private lists; Moment
  ordering, protected-post rejection and render-time visibility; idempotent DMs, read state,
  non-member access refused, message requests, DM policy; scheduled publication exactly once,
  superseded/canceled jobs skipped; cross-workspace reads/writes refused and rejected by
  composite foreign keys.

## Browser journeys (`npm run test:e2e`) — 19 passed / 0 failed

Desktop (1280×900): journeys 1–14 and 17 from the brief (publish & reload; like/repost/
bookmark/quote sync; follow/unfollow; protected request → approve as the other seeded actor;
poll vote + server rejections; image upload with alt text + viewer; drafts + worker-published
schedule; lists incl. private restriction across actors and visitors; Moments; direct + group
messages with retry dedupe and unread state; profile edit + theme/autoplay preferences;
block effects; deep links + reload + Back/Forward; failed-mutation rollback + offline;
keyboard skip link, j/k, shortcuts dialog, typing guard). Security: two isolated sessions,
cross-session post/conversation/private-attachment access refused, client-supplied
author/workspace ids ignored, forged edit refused, CSRF (missing header / foreign Origin)
refused, no-cookie and forged-cookie requests → 401, actor switch limited to the
workspace; cookie HttpOnly + SameSite=Lax. Mobile (Pixel 7): bottom nav, drawer, FAB
composer, inbox → conversation → back, message input inside the viewport.
Responsive: Home, Explore, post detail, profile, composer, Notifications, Messages, Lists,
Bookmarks, Settings at 320/360/390/430/768/1024/1280/1440/1920 px — **no horizontal
overflow**; screenshots at 390 and 1280 in `docs/screenshots/`, plus Home in all three
themes at 390 and 1440.

Bugs found by these runs and fixed: compose modal closing itself (an effect returned its
close function, which React ran as cleanup); focal post not reading the shared cache;
DB session time zone (Asia/Calcutta) skewing `CURRENT_TIMESTAMP` defaults and the job
claim by 5.5 h; global `a { color: inherit }` outside Tailwind's layers overriding link
colors; Explore layout shift.

## Performance (production build, `scripts/measure-performance.ts`)

Local machine, server on localhost (no network throttling, no CPU throttling), headless
Chromium. "Cold" = first visit, which includes provisioning and seeding a new demo
workspace; "warm" = later navigations in the same session (full page loads).

| Load | TTFB ms | FCP ms | LCP ms | CLS |
|---|---|---|---|---|
| desktop cold `/` | 681 | 1224 | 1728 | 0.041 |
| desktop warm `/home` | 32 | 160 | 352 | 0.042 |
| desktop warm `/explore` | 22 | 112 | 188 | 0.002 |
| desktop warm profile | 21 | 108 | 224 | 0.043 |
| mobile cold `/` | 287 | 416 | 672 | 0 |
| mobile warm `/home` | 11 | 92 | 224 | 0 |
| mobile warm `/explore` | 10 | 96 | 168 | 0 |

Full table: `docs/performance-run.txt`. Explore CLS was 0.19 (desktop) / 0.62 (mobile)
before the fix. These numbers are local measurements, not field data or Lighthouse scores.
