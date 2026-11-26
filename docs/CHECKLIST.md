# Screen, feature and state checklist

Legend — **A**: verified by an automated test (named) · **V**: verified visually in the
browser / screenshots · **I**: implemented, not separately verified · **D**: deferred / not implemented.

Test files: `tests/unit/*` (Vitest), `tests/integration/services.test.ts` (Vitest against
`ischoolie_test`), `tests/e2e/*.spec.ts` (Playwright, Chromium). Screenshots: `docs/screenshots/`.

## Screens and routes

| Screen family | Routes | Status | Evidence |
|---|---|---|---|
| Entry / Home | `/` → `/home` | A, V | e2e 1, 13; `home-1280.png`, `home-390.png`, theme-*.png |
| Home / Latest switch | ✦ menu, persisted pref | A (service), V | integration "posting"; manual |
| Inline composer, new-post pill | `/home` | A (composer), I (pill) | e2e 1; pill polls `/api/timeline/new` |
| Explore | `/explore?tab=…` | V, A (deep link) | `explore-*.png`; e2e 13 |
| Search | `/search?q&f=top/live/user/image/video` | A | integration (protected exclusion, block), e2e 2/5/7/12 |
| Advanced search | `/search-advanced` | A (parser), I (form) | unit search-and-time |
| Post detail | `/:handle/status/:id` (ancestors, replies, continuation via "Replying to") | A, V | e2e 1/2/5; `post-detail-*.png` |
| Hidden replies | `/:handle/status/:id/hidden` | A | integration "hide replies" |
| Engagement lists | `/…/likes`, `/…/reposts`, `/…/quotes` | I | routes load; service shared with tests |
| Media viewer | `/…/photo/:n`, `/…/video/:n` (modal + direct load) | A | e2e 6, 13 |
| Composer | `/compose/post` (`?reply`, `?quote`, `?draft`, `?scheduled`) | A, V | e2e 1/2/6/14, mobile; `composer-*.png` |
| Drafts / Scheduled | `/compose/drafts`, `/compose/scheduled` | A | e2e 7; integration scheduling |
| Notifications | `/notifications`, `/notifications/mentions` | A, V | integration (prefs), e2e 13; `notifications-*.png` |
| Messages inbox / conversation | `/messages`, `/messages/:id` (split view ≥ 1002 px) | A, V | e2e 10, mobile; `messages-*.png` |
| New message / requests | `/messages/compose`, `/messages/requests` | A (service) | integration "messages" |
| Conversation info | `/messages/:id/info` | I | rename/mute/leave/add/remove services covered in part |
| Bookmarks | `/i/bookmarks` | A, V | e2e 2; `bookmarks-*.png` |
| Lists | `/i/lists`, `/i/lists/:id`, `/create`, `/:id/edit`, `/:id/members`, `/:id/followers`, `/:handle/lists`, `/:handle/lists/memberships` | A, V | e2e 8; integration lists; `lists-*.png` |
| Topics | `/i/topics`, `/i/topics/:slug` | I | Home ranking uses follows (code + help docs) |
| Moments | `/i/moments`, `/:id`, `/create`, `/:id/edit` | A | e2e 9; integration moments |
| Profiles | `/:handle`, `/with_replies`, `/media`, `/likes` | A, V | e2e 1/3/4/6; `profile-*.png` |
| Connections | `/:handle/followers`, `/:handle/following` (search, pagination) | A (privacy) | integration protected |
| Follow requests | `/i/follower_requests` (received + sent) | A | e2e 4 |
| Profile edit | `/settings/profile` (crop, upload, validation) | A | e2e 11 |
| Discovery | `/i/connect` | I | suggestion policy documented |
| Settings | `/settings/*` (account, privacy, notifications, content, display, accessibility, data, demo, muted words, blocked, muted) | A, V | e2e 11/12; integration prefs; `settings-*.png` |
| Help, shortcuts, display dialogs | `/help`, `/i/keyboard_shortcuts`, `/i/display` (modal + direct) | A | e2e 13, 17 |
| Post activity (owner) | dialog from own post | I | computed from Like/Repost/Post/Bookmark/PostEvent rows |
| System states | not-found, error boundary, `/offline`, session-expired recovery | V | session-expired recovery exercised manually |

## Actions

| Action | Status | Evidence |
|---|---|---|
| Publish post / thread, idempotent retry | A | integration posting; e2e 1 |
| Reply (audience enforced server-side) | A | integration "reply audience" |
| Quote | A | e2e 2 |
| Like/unlike, repost/undo, bookmark/unbookmark, counts in sync | A | e2e 2; integration |
| Copy link, share via message, native share | I | menu implemented |
| Pin/unpin own post; forged pin/delete refused | A | integration forged edit |
| Delete own post (tombstones) | A (tombstone seed), I | |
| Hide/unhide reply | A | integration |
| Mute conversation | I | suppresses REPLY/MENTION/LIKE/REPOST notifications |
| Report (category, details, receipt; no decision claimed) | I | dialog + `Report` rows |
| Follow/unfollow, protected request/accept/reject/cancel | A | e2e 3/4; integration |
| Profile post notifications (bell) | I | `SUBSCRIBED_POST` generation |
| Block / mute (feeds, search, notifications, interactions) | A | e2e 12; integration |
| Muted words with scope and duration | A | integration |
| Polls: vote once, closed polls, author can't vote | A | e2e 5; integration |
| Uploads: progress, cancel, retry, alt text, failure states | A (upload + alt + failure path seen) | e2e 6 |
| GIF picker (bundled, labelled) | I | |
| Drafts autosave/resume/discard, reload recovery | A (server draft + resume) | e2e 7 |
| Scheduling with time zone, worker publication, no duplicates, reschedule/cancel | A | integration scheduling; e2e 7 |
| DMs: send, history, read state, requests, groups, reactions, delete-for-me, idempotent send | A (send/read/request/idempotency/groups) | e2e 10; integration |
| Settings with observable effects (theme, autoplay, notifications, muted words, DM policy) | A | e2e 11; integration |
| Keyboard navigation and shortcuts | A | e2e 17 |
| Responsive 320–1920, no horizontal overflow | A | e2e 18 (10 screens × 9 widths) |
| Session isolation, forged ids, CSRF, private media | A | e2e security; integration isolation |
| Failed mutation rollback; offline error keeps content | A | e2e 14 |

## Deferred / not implemented

- External link preview cards (no outbound fetching → no SSRF surface).
- Video transcoding and server-side video thumbnails (uploaded videos play as uploaded).
- Production object-storage adapter (contract documented; `local` driver only).
- Push and email notification delivery (shown as unavailable).
- WebSocket realtime (documented polling instead).
- Full emoji catalogue (curated picker set) and external GIF provider (bundled set).
- Pixel comparison against dated screenshots (none supplied).
