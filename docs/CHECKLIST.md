# Screen, feature and state checklist

Legend — **A**: verified by an automated test (named) · **V**: verified visually in the
browser / screenshots · **I**: implemented, not separately verified · **D**: deferred / not implemented.

Test files: `tests/unit/*` (Vitest), `tests/integration/services.test.ts` and
`tests/integration/coverage.test.ts` ("coverage"; Vitest against `ischoolie_test`),
`tests/e2e/*.spec.ts` incl. `ui-flows.spec.ts` ("ui-flows"; Playwright, Chromium). Screenshots: `docs/screenshots/`.

## Screens and routes

| Screen family | Routes | Status | Evidence |
|---|---|---|---|
| Entry / Home | `/` → `/home` | A, V | e2e 1, 13; `home-1280.png`, `home-390.png`, theme-*.png |
| Home / Latest switch | ✦ menu, persisted pref | A (service), V | integration "posting"; manual |
| Inline composer, new-post pill | `/home` | A | e2e 1; ui-flows (pill appears after another account posts) |
| Explore | `/explore?tab=…` | V, A (deep link) | `explore-*.png`; e2e 13 |
| Search | `/search?q&f=top/live/user/image/video` | A | integration (protected exclusion, block), e2e 2/5/7/12 |
| Advanced search | `/search-advanced` | A (parser), I (form) | unit search-and-time |
| Post detail | `/:handle/status/:id` (ancestors, replies, continuation via "Replying to") | A, V | e2e 1/2/5; `post-detail-*.png` |
| Hidden replies | `/:handle/status/:id/hidden` | A | integration "hide replies" |
| Engagement lists | `/…/likes`, `/…/reposts`, `/…/quotes` | A | ui-flows; coverage (counts match rows, protected lists refused) |
| Media viewer | `/…/photo/:n`, `/…/video/:n` (modal + direct load) | A | e2e 6, 13 |
| Composer | `/compose/post` (`?reply`, `?quote`, `?draft`, `?scheduled`) | A, V | e2e 1/2/6/14, mobile; `composer-*.png` |
| Drafts / Scheduled | `/compose/drafts`, `/compose/scheduled` | A | e2e 7; integration scheduling |
| Notifications | `/notifications`, `/notifications/mentions` | A, V | integration (prefs), e2e 13; `notifications-*.png` |
| Messages inbox / conversation | `/messages`, `/messages/:id` (split view ≥ 1002 px) | A, V | e2e 10, mobile; `messages-*.png` |
| New message / requests | `/messages/compose`, `/messages/requests` | A (service) | integration "messages" |
| Conversation info | `/messages/:id/info` | A | ui-flows (rename, snooze); coverage (add, admin-only remove, leave hand-off) |
| Bookmarks | `/i/bookmarks` | A, V | e2e 2; `bookmarks-*.png` |
| Lists | `/i/lists`, `/i/lists/:id`, `/create`, `/:id/edit`, `/:id/members`, `/:id/followers`, `/:handle/lists`, `/:handle/lists/memberships` | A, V | e2e 8; integration lists; `lists-*.png` |
| Topics | `/i/topics`, `/i/topics/:slug` | A | ui-flows; coverage (follow adds labelled topic posts to Home, unfollow removes) |
| Moments | `/i/moments`, `/:id`, `/create`, `/:id/edit` | A | e2e 9; integration moments |
| Profiles | `/:handle`, `/with_replies`, `/media`, `/likes` | A, V | e2e 1/3/4/6; `profile-*.png` |
| Connections | `/:handle/followers`, `/:handle/following` (search, pagination) | A (privacy) | integration protected |
| Follow requests | `/i/follower_requests` (received + sent) | A | e2e 4 |
| Profile edit | `/settings/profile` (crop, upload, validation) | A | e2e 11 |
| Discovery | `/i/connect` | A | ui-flows; coverage (excludes self, followed, blocked, muted, suspended) |
| Settings | `/settings/*` (account, privacy, notifications, content, display, accessibility, data, demo, muted words, blocked, muted) | A, V | e2e 11/12; integration prefs; `settings-*.png` |
| Help, shortcuts, display dialogs | `/help`, `/i/keyboard_shortcuts`, `/i/display` (modal + direct) | A | e2e 13, 17 |
| Post activity (owner) | dialog from own post | A | ui-flows; coverage (owner-only, counts match rows, one detail open per viewer per day) |
| System states | not-found, error boundary, `/offline`, session-expired recovery | V | session-expired recovery exercised manually |

## Actions

| Action | Status | Evidence |
|---|---|---|
| Publish post / thread, idempotent retry | A | integration posting; e2e 1 |
| Reply (audience enforced server-side) | A | integration "reply audience" |
| Quote | A | e2e 2 |
| Like/unlike, repost/undo, bookmark/unbookmark, counts in sync | A | e2e 2; integration |
| Share via message | A | ui-flows; coverage (unseeable posts refused) |
| Copy link, native share | A | ui-flows (clipboard contents and share payload checked) |
| Pin/unpin own post; forged pin/delete refused | A | integration forged edit |
| Delete own post (tombstones, pin cleared) | A | ui-flows; coverage |
| Hide/unhide reply | A | integration |
| Mute conversation | A | ui-flows; coverage (reply notifications stop, resume after unmute) |
| Report (category, details, receipt; no decision claimed) | A | ui-flows; coverage (persisted, target validated) |
| Follow/unfollow, protected request/accept/reject/cancel | A | e2e 3/4; integration |
| Profile post notifications (bell) | A | coverage (subscribers only; requires following) |
| Block / mute (feeds, search, notifications, interactions) | A | e2e 12; integration |
| Muted words with scope and duration | A | integration |
| Polls: vote once, closed polls, author can't vote | A | e2e 5; integration |
| Uploads: progress, cancel, retry, alt text, failure states | A | e2e 6; coverage (re-encode, content sniffing, scope rules, owner-only, video byte ranges) |
| GIF picker (bundled, labelled) | A | ui-flows; coverage |
| Drafts autosave/resume/discard, reload recovery | A (server draft + resume) | e2e 7 |
| Scheduling with time zone, worker publication, no duplicates, reschedule/cancel | A | integration scheduling; e2e 7 |
| DMs: send, history, read state, requests, groups, reactions, delete-for-me, idempotent send | A | e2e 10; ui-flows; integration + coverage |
| Settings with observable effects (theme, autoplay, notifications, muted words, DM policy) | A | e2e 11; integration |
| Keyboard navigation and shortcuts | A | e2e 17 |
| Realtime messages and badges (LISTEN/NOTIFY → SSE, polling fallback) | A | realtime integration (delivery after commit, ids only, no duplicate events); ui-flows (message from another process appeared in 0.96 s) |
| Link preview cards with SSRF-safe fetching | A | link-preview unit + integration (address policy, rebinding, redirects, size/type limits, parsing, storage, rendering); verified once against a real public page (example.com) |
| Video poster frames | A | coverage (stored, re-encoded, bad poster tolerated); ui-flows (captured in Chromium from a real WebM) |
| S3-compatible storage adapter | A (against a test server) | storage-contract (same suite as local); **not run against real AWS S3 / R2 / MinIO** |
| Full emoji picker (search, categories, recents) | A | ui-flows |
| Indexed search (pg_trgm, GIN) | A | migration applied; query plan uses `Post_textLower_trgm_idx` |
| Responsive 320–1920, no horizontal overflow | A | e2e 18 (10 screens × 9 widths) |
| Session isolation, forged ids, CSRF, private media | A | e2e security; integration isolation |
| Failed mutation rollback; offline error keeps content | A | e2e 14 |
| Live mode sign-in / sign-up pages (email + password, Google, GitHub buttons, forgot/reset password) | A (UI, validation, redirects) | live-guest e2e; **real OAuth round trip not run: Google/GitHub providers are not enabled in the Supabase project yet** |
| Supabase session verification, onboarding (pick @username), one profile per identity | A | auth-live integration (claims injected as `getClaims()` returns them) |
| Read-only guest mode (feed, post pages, profiles, search, explore) with sign-up prompts | A | auth-live integration (14 refused routes, nothing written); live-guest e2e |
| Private pages redirect guests to sign-in and back (`next`, open-redirect safe) | A | auth-paths unit; live-guest e2e |
| Log out, change/set password, linked sign-in methods in Settings | B (built; needs a real signed-in account to exercise) | typecheck/lint; not run against a real Supabase account |

## Not done, and why

- **Push and email notification delivery** — needs a delivery provider and verified contact
  details, which only exist after real sign-in. Shown as unavailable; nothing claims delivery.
- **External GIF provider** — needs an API key and agreeing to the provider's terms. The picker
  uses a clearly labelled bundled set.
- **Server-side video transcoding** — not needed for playback of uploaded MP4/WebM; posters
  are captured in the browser instead.
- **S3 adapter against real cloud storage** — implemented and contract-tested against a local
  S3-compatible server only.
- **Pixel comparison against dated 2020 screenshots** — none were supplied.
- **Google / GitHub sign-in end to end** — the code path is built and the buttons are live,
  but the providers must be enabled in the Supabase dashboard with OAuth client credentials
  (only the project owner can create those). Until then the buttons show “not enabled yet”.
- **Email confirmation end to end** — needs a real inbox; no real Supabase accounts were
  created during testing.
- **Public launch** — still needs the items in README “Public-release requirements”.
