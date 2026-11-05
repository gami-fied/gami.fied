# Gami.Fied: Audit and Improvement Plan

This file tracks everything that needs fixing, improving or building. Tick items as they land and update the progress table.

- **Audit date:** 2026-11-05
- **Audited commit:** `5749e78` on `master`
- **Current version:** `1.0.0-rc.1`

## How to use this file

- `[ ]` not started, `[~]` in progress, `[x]` done, `[-]` dropped (add a one-line reason).
- Work the phases in order. Phases 0 to 2 block any public 1.0. Phases 3 to 5 can overlap. Phases 6 to 8 follow.
- Add the PR link after an item when it is done, for example `[x] **SEC-01** ... (#123)`.
- New bugs go in the matching sub-phase with the next free ID.

**Priority:** `P0` exploitable or corrupts data, fix before anyone runs this in production. `P1` broken feature or false promise. `P2` important improvement. `P3` polish.

**Evidence:** `[ran]` confirmed by running something. `[code]` found by reading the code, not yet reproduced. `[check]` suspected, needs confirming on a live stack. Reproduce every `[code]` item with a failing test before fixing it.

## Progress

| Phase | Goal | Done / Total | Status |
| :--- | :--- | :---: | :--- |
| 0 | Baseline: green CI, runnable stack | 11 / 15 | In progress, the rest need Docker or a CI run |
| 1 | Security and tenant safety | 19 / 23 | In progress, 3 partly done, 1 moved to FEAT-17 |
| 2 | Core engine correctness | 22 / 32 | In progress, 2 partly done |
| 3 | Make every promise true | 0 / 26 | Not started |
| 4 | Developer experience | 0 / 16 | Not started |
| 5 | Dashboard UI and UX | 0 / 34 | Not started |
| 6 | Scale and operations | 0 / 13 | Not started |
| 7 | New product features | 0 / 26 | Not started |
| 8 | Launch and community | 0 / 11 | Not started |

## Decisions needed from the maintainer

These change the work in later phases, so settle them early.

- [ ] **DEC-1: SDK licence.** The SDK is AGPL-3.0-only. Many companies will not put an AGPL client library in a proprietary app, and that blocks adoption. Recommendation: MIT or Apache-2.0 for the SDK and any UI packages, keep AGPL on the server. Needs the rights of every contributor.
- [ ] **DEC-2: Product name.** The repo mixes "Gami", "Gami.Fied", "Gami Engine" and "gami.fied". Pick one and do a trademark check.
- [ ] **DEC-3: Default branch.** Local work is on `master`, the main branch is `main`, and both exist on `origin`. Keep one.
- [ ] **DEC-4: Target customer.** Recommendation: developers of consumer, edtech, fitness and community apps who want to own their data. This decides whether streaks, rewards and React components come before enterprise work such as SSO.
- [ ] **DEC-5: Business model.** Community only, open core, or a hosted cloud. The `edition: 'community'` field implies more editions are planned.

---

## Assessment

### 1. Is the core idea good?

**Yes, with a narrower pitch.** Gami is a self-hosted engine that turns product events into XP, levels, badges, challenges and leaderboards, with a dashboard, webhooks and an SDK. Teams keep rebuilding this, and it is more work than it looks because of ledgers, idempotency, retries and anti-abuse.

The architecture is the strongest part of the project. An append-only XP ledger, transactional outboxes, a pure rules package and multi-tenant scoping are the right choices. The problems are in execution and completeness, not in the concept.

Three things hold the idea back today:

1. **No streaks.** Streaks are the headline feature of the leading competitor and are claimed in Gami's own README, but they do not exist in the code.
2. **Nothing for the end-user's browser.** There are no drop-in components and no safe client token. A customer must build every UI and proxy every read through their own backend.
3. **The pitch is broad.** "Gamification infrastructure" is vague. "The self-hosted, open-source alternative to Trophy" is clear and searchable.

Be honest about the risk too. Gamification cannot rescue a product people do not want to use, and the evidence for streaks lifting B2B retention is weak. The product should help customers measure the effect (see FEAT-24), not just hand out points.

### 2. Does anything similar exist?

Yes, but the specific gap looks open: a modern, actively maintained, self-hostable engine with a full dashboard.

| Product | Type | Strengths | Gap Gami can use |
| :--- | :--- | :--- | :--- |
| [Trophy](https://trophy.so/pricing) | Hosted API | Streaks, achievements, points, leaderboards, rewards, lifecycle email, push, MCP server, drop-in pages | Hosted only in what I found. $299/month Pro on its pricing page, 30-day trial |
| [Open Loyalty](https://www.rfp.wiki/vendors/open-loyalty) | Enterprise loyalty engine | Headless, API first, mature | [Quote based](https://apis.io/plans/open-loyalty/open-loyalty-plans-pricing/). Its free edition is [reported](https://sourceforge.net/software/product/Open-Loyalty/) as capped for testing. Loyalty focus, not product engagement |
| [gengine / ActiDoo](https://github.com/actidoo/gamification-engine) | OSS engine (MIT, Python) | Multi-level achievements, rules, periodic leaderboards. 477 stars | Looks dated, README asks for tests. No modern dashboard or SDK. Maintenance not confirmed |
| [GamifyKit](https://github.com/devblac/gamifykit) | OSS Go library (Apache-2.0) | Lightweight, event bus, realtime hub | A library with 1 star. No dashboard or multi-tenancy |
| [Smart Community Lab engine](https://github.com/smartcommunitylab/smartcampus.gamification/wiki) | OSS engine | Documented game model and API | Academic origin. Activity not checked |
| [Spinify](https://www.g2.com/products/trophy/pricing), [StriveCloud](https://strivecloud.io/), [Gamelayer](https://peerpush.com/p/trophy) | Hosted platforms | Sales or community engagement | Closed and hosted |

Notes on this research:

- Third-party listings give [conflicting Trophy prices](https://alternativeto.net/software/trophy/about). The $299 figure comes from Trophy's own page.
- [Market reports](https://www.startus-insights.com/?p=51155) put 2026 gamification spending between about $16B and $47B. The definitions differ too much to rely on, so treat this only as "the category is real".
- [B2B streak evidence](https://dev.to/gerus_team/5-gamification-patterns-that-actually-move-saas-metrics-not-just-vanity-numbers-2fod) is mostly practitioner opinion, and [Userpilot](https://userpilot.com/blog/engagement-gamification/) advises measuring cohort retention instead of streak length.
- A web search for "Gami.Fied" found no public presence, although `@gami.fied/sdk@0.1.2` is on npm. Discoverability starts close to zero.
- This was a desk review. No competitor was tried hands-on.

### 3. Health check

This table is the state at audit time. The Phase 0 items above show what has changed since.

| Check | Result |
| :--- | :--- |
| `pnpm typecheck` | Pass, 29 of 29 tasks `[ran]` |
| Dashboard `next build` | Pass, 39 routes `[ran]` |
| `turbo lint --continue` | **Fail.** 7 of 14 packages fail with about 200 errors `[ran]` |
| Unit tests in rules, progression, challenges, sdk, webhooks, integrations | Pass, 80 tests in 9 files `[ran]` |
| 26 API integration test files and the database, queue, leaderboards and notifications tests | **Not run.** Docker and Postgres are not on the audit machine |
| Live dashboard walkthrough | **Not done** for the same reason. UI findings come from code, and BASE-13 covers the live pass |
| CI | None. There is no `.github` directory |

### 4. Top findings

1. A project API key can delete its whole organization (SEC-08).
2. API key scopes are never checked, so every key is effectively an admin key (SEC-07).
3. Email verification can be bypassed, and OTPs can be brute-forced (SEC-01, SEC-02).
4. 24 admin security and policy settings are never read, so they do nothing (TRUTH-01).
5. Password reset does not exist (SEC-05).
6. Replay reports success but does nothing for processed events (ENG-05).
7. Webhooks fire from only some XP paths, and one slow endpoint can stall all background delivery (ENG-11, ENG-21).
8. Streaks, Redis-cached leaderboards, multi-step challenges and scheduled backups are claimed but missing (TRUTH-08).
9. The README setup and both SDK quickstarts do not work as written (TRUTH-12, TRUTH-15).

---

## Phase 0: Baseline

**Goal:** Every later fix can be verified. **Exit:** a fresh clone runs by following the README, and CI is green.

### 0.1 Repository clean-up

- [x] **BASE-01** `P2` Remove compiled files committed to source: `apps/worker/src/heartbeat.js`, `.js.map`, `.d.ts`, `.d.ts.map`. `[ran]`
- [x] **BASE-02** `P2` Delete the duplicate [apps/worker/src/heartbeat.ts](apps/worker/src/heartbeat.ts). The worker already imports the one from `@gami/queue`. `[code]`
- [x] **BASE-03** `P2` Remove `docker-compose.yml.old` and replace it with a real `docker-compose.dev.yml` (see BASE-08). `[ran]`
- [x] **BASE-04** `P3` Remove or fill the empty [packages/ui](packages/ui/src/index.ts). The README calls it a shared design system, but it has one line. `[ran]`
- [x] **BASE-05** `P3` Add the missing `eslint.config.mjs` or lint setup to packages whose `lint` task has no effect, and remove unused dependencies. `[check]`

### 0.2 Local development

- [x] **BASE-06** `P1` Add `POSTGRES_PASSWORD` and `PLATFORM_BOOTSTRAP_SECRET` to `.env.example`. Compose requires both, but the example has neither, and it uses the unrecognised name `BOOTSTRAP_SECRET`. `[code]`
- [x] **BASE-07** `P1` Split `.env.example` into safe development defaults and a production template. It currently sets `NODE_ENV=production`, which is wrong for a first local run. `[code]`
- [~] **BASE-08** `P1` Create a dev compose with only Postgres and Redis, and point `infra:up` at it. Today `pnpm infra:up` launches the full production stack, which then collides with `pnpm dev` on ports 3000 and 3001. `[code]` Written, not yet run because Docker is not on this machine.
- [x] **BASE-09** `P1` Fix the seed. Its rule uses `actions: { awardXp: 100 }`, which fails validation and never fires, and its API key can never authenticate. Generate a working demo project with a real key, rules, levels, badges and users. `[code]` Verified on a live stack: all 16 demo events produced the expected XP, badges and rewards, and re-seeding is safe.

### 0.3 CI and quality gates

- [x] **BASE-10** `P1` Clear all lint errors: 93 unused variables, 77 `any`, 21 empty blocks and the rest. `[ran]` 10 warnings remain by design: 9 `exhaustive-deps` (UX-04 removes the cause) and 1 `no-img-element`. `any` is allowed in test files only.
- [x] **BASE-11** `P1` Add a root `test` script and a Turbo `test` task, so one command runs everything. Add a `test` script to the worker, which has none. `[ran]` `apps/api` and `packages/database` run files serially, because they share one database and the disaster recovery test deletes rows across tables.
- [~] **BASE-12** `P1` Add GitHub Actions for lint, typecheck, build, tests with Postgres and Redis service containers, and Docker image builds. Written but not yet run on GitHub. Expect the first run to expose failures in the integration tests or Docker builds.

### 0.4 Live baseline

- [x] **BASE-13** `P1` Run the 26 API integration test files against real Postgres and Redis, then walk the main dashboard screens. Done against remote services: 182 of 186 API tests and all 17 database tests passed in the full serial run. 2 of the 4 failures were stale assertions (fixed), 1 was latency (passes with a longer limit, and one more timed out the same way), and 1 is ENG-30, which only fails when the database clock runs ahead. Screens covered: overview, leaderboards, rules, settings, users, analytics, events, developer, admin bootstrap and a 404, plus users at phone width. Not walked: the other screens, and admin pages past bootstrap.
- [ ] **BASE-14** `P1` Run the full Docker stack from a clean machine and confirm the `[check]` items in 3.2. `[check]`
- [ ] **BASE-15** `P2` Add a Playwright smoke test: register, create a project, create a key, send an event, see XP. `[check]`

---

## Phase 1: Security and tenant safety

**Goal:** Safe to expose to the internet. **Exit:** every P0 has a regression test, and an external review is booked for 1.0.

### 1.1 Account security

- [x] **SEC-01** `P0` Email verification bypass. [otp.ts:124](apps/api/src/auth/otp.ts:124) and [otp.ts:148](apps/api/src/auth/otp.ts:148) accept any `email` in the body, then mark the session user verified. A user with a fake address can request a code for a mailbox they control. Ignore the body and always use the session email. `[code]`
- [x] **SEC-02** `P0` OTP brute force. There is no attempt limit or rate limit on `/api/auth/otp/verify`, and a 6-digit code lives for 15 minutes. Add per-user attempt counts, lockout, and a resend limit. `[code]`
- [x] **SEC-03** `P0` OTP uses `Math.random()` at [otp.ts:21](apps/api/src/auth/otp.ts:21) and is stored in plain text. Use `crypto.randomInt`, store a hash, and compare in constant time. `[code]`
- [x] **SEC-04** `P1` The OTP requirement is enforced only by a browser redirect in [dashboard-shell.tsx](apps/dashboard/src/components/layout/dashboard-shell.tsx). An unverified user can call the API directly. Enforce it in `requireAuth`. `[code]`
- [x] **SEC-05** `P1` Add forgotten-password and reset flows. No reset code exists in the API or the UI, so a locked-out user has no self-service recovery. `[ran]`
- [x] **SEC-06** `P2` Remove the OTP code from the email subject line, where it shows in lock-screen previews. `/otp/send` should also stop reporting "sent" when SMTP is missing. `[code]`

### 1.2 API keys and authorization

- [x] **SEC-07** `P0` API key scopes are never enforced. No route passes `requiredScope`, and the create route cannot set scopes. Define scopes such as `events:write`, `users:read` and `admin`, default new keys to `events:write`, and require a scope on every route. `[ran]` Done. New keys default to `events:write`. Existing keys keep `*`, so review them.
- [x] **SEC-08** `P0` Project API keys get `owner` over the whole organization at [authorization/index.ts:102](apps/api/src/authorization/index.ts:102). One leaked key can delete the organization, export every project, or manage members. Block API keys from all organization routes. `[code]` Done. This is a breaking change: `gami.organizations` in the SDK now needs a signed-in session.
- [x] **SEC-09** `P0` API keys get `admin` on project routes at [authorization/index.ts:239](apps/api/src/authorization/index.ts:239), so a key can mint more keys, delete the project, and create webhooks that exfiltrate data. Key management must require a user session. `[code]`
- [x] **SEC-10** `P1` Any project `member` can create, edit or delete rules, which award XP. [rules/index.ts](apps/api/src/rules/index.ts) has no role check, unlike levels and challenges. `[ran]`
- [~] **SEC-11** `P1` Replace scattered role checks with one declarative permission map, so a missing check is impossible. Generate the docs matrix from it. `[code]` Done: `apps/api/src/authorization/permissions.ts` protects new routes by default. Left: remove the older checks that now duplicate it, and generate the docs matrix (TRUTH-08).
- [x] **SEC-12** `P1` Cross-tenant write. [xp/index.ts:161](apps/api/src/xp/index.ts:161) inserts the path `userId` with `onConflictDoNothing`, and the ledger foreign key has no project check. A user ID from another project passes. Verify the user belongs to the project, and add composite foreign keys. `[code]` Done. An adjustment for an unknown user now returns 404 instead of creating one, and four tables have composite foreign keys.
- [x] **SEC-13** `P1` Add key expiry and scopes to the create route and dashboard, plus rotation with an overlap window. List responses should include scopes and expiry. `[code]`
- [-] **SEC-14** `P2` Separate test and live keys by environment. `[code]` Dropped here: it depends on project environments, so it moves to FEAT-17.

### 1.3 Network and SSRF

- [x] **SEC-15** `P0` DNS rebinding remains possible. [webhook-dispatcher.ts:168](apps/worker/src/webhook-dispatcher.ts:168) validates an IP, then `fetch` resolves the host again. Pin the validated IP with a custom undici dispatcher. `[code]`
- [x] **SEC-16** `P1` Close the SSRF blocklist gaps in [security.ts:50](packages/webhooks/src/security.ts:50). `fd12::`, `fe90::`, `::ffff:7f00:1` (hex-mapped IPv4), `100.64.0.0/10` and `198.18.0.0/15` all pass. Use a proper CIDR library such as `ipaddr.js`. `[code]`
- [x] **SEC-17** `P1` Stop trusting `x-forwarded-host` and `x-forwarded-proto` from any client in [auth/index.ts:13](apps/api/src/auth/index.ts:13). Honour them only behind a configured proxy. `[code]` Done. Set `TRUST_PROXY=true` only behind a proxy that overwrites these headers.
- [x] **SEC-18** `P2` Remove the internal `destinationUrl` from proxy error responses in [route.ts:42](apps/dashboard/src/app/api/[...path]/route.ts:42) and its `/v1` copy. `[code]`
- [~] **SEC-19** `P2` Add security headers (CSP, HSTS, frame denial) to the API and dashboard, and global IP rate limits. Only `/v1/events` has a limiter. `[ran]` Headers and the IP limit are live. Left: a full script CSP, which needs nonces. The current CSP covers framing, base URI, objects and form targets only.

### 1.4 Secrets and production configuration

- [~] **SEC-20** `P0` The production compose publishes Postgres and an unauthenticated Redis on all host interfaces. Remove the `ports` entries for both and enable `requirepass`. `[code]` Written, not yet run because Docker is not on this machine (BASE-14).
- [x] **SEC-21** `P1` `validateProductionConfig` accepts the `.env.example` placeholders such as `your-random-32-byte-secret-key-goes-here`. Reject them, require strong key lengths, and require `PLATFORM_BOOTSTRAP_SECRET` to be set. `[code]`
- [x] **SEC-23** `P1` The invitation sign-up form pre-fills the password `Password123!` in [accept-invitation/page.tsx](apps/dashboard/src/app/accept-invitation/page.tsx). Anyone who keeps it has a publicly known password. Start empty and enforce the password policy. `[code]`
- [x] **SEC-22** `P2` Remove source-code default secrets and the plain-text fallback in `decryptSecret`. Add a key ID to encrypted values so the master key can be rotated. Rename the `secret_hash` column, which holds an encrypted value. `[code]` Done, with `ENCRYPTION_MASTER_KEY_PREVIOUS` for rotation instead of a stored key ID. Rotated values are only re-encrypted when next saved.

---

## Phase 2: Core engine correctness

**Goal:** XP, badges and deliveries are always right. **Exit:** concurrency and crash tests pass for every award path.

### 2.1 Event ingestion

- [ ] **ENG-01** `P1` Idempotent retries can return a false 409. [events/index.ts:142](apps/api/src/events/index.ts:142) compares `JSON.stringify` of a `jsonb` value, and Postgres reorders keys. Compare a canonical hash stored on the event. `[code]`
- [ ] **ENG-02** `P1` Merge the two copies of ingestion. The dashboard test route skips the deactivated-user check and the `user.created` webhook, so test results can differ from production. Extract one `ingestEvent` service. `[code]`
- [ ] **ENG-03** `P2` Move the `user.created` webhook into the same transaction as the user insert. It currently passes the user ID as the event ID and is not atomic. `[code]`
- [ ] **ENG-04** `P2` Invalid `startDate` and `endDate` values become `Invalid Date` and probably return a 500. Validate all list query params with Zod. `[check]`

### 2.2 Replay and outbox

- [ ] **ENG-05** `P1` Replay does nothing for processed events but reports success. `event_outbox.event_id` is unique, so the insert at [events/index.ts:580](apps/api/src/events/index.ts:580) is dropped, and the BullMQ `jobId` also dedupes. Rule executions then skip anything completed. Design real replay with a replay ID and a clear choice of what re-runs. `[code]`
- [~] **ENG-06** `P1` Event outbox has no terminal failure state. Attempts are not raised on reclaim, and failures retry forever. Add a max attempt count and a dead-letter view. `[code]` Done: events stop after 10 attempts with status `failed`. Left: raise attempts on reclaim, and add the dead-letter view.
- [x] **ENG-07** `P2` The event outbox query has no `ORDER BY`, so ordering is not guaranteed and rows can starve. Order by `available_at, id`. `[code]`
- [ ] **ENG-08** `P2` Build one generic claim, dispatch, retry helper. Six outboxes each repeat this logic with different bugs. `[code]`

### 2.3 Rule execution

- [x] **ENG-09** `P1` Confirmed live. Non-matching rules are recorded as `failed` at [executor.ts:68](apps/worker/src/executor.ts:68). Every event writes a row for every enabled rule, with most marked failed, which bloats the table and pollutes health data. Filter by trigger in SQL, and record `skipped`. `[code]`
- [x] **ENG-10** `P1` A rule with two `award_xp` actions silently loses the second. `xp_ledger_rule_execution_unique` allows one row per execution, and the 23505 error is meant to be treated as a harmless duplicate (see ENG-31, which currently makes it fail instead). Add an action index to the unique key. `[code]` Done with migration 0025, which also stops a rule losing its second achievement.
- [x] **ENG-11** `P1` Rule-based XP sends no `xp.awarded` or `level.up` webhook. The executor at [executor.ts:84](apps/worker/src/executor.ts:84) has its own inline copy, and `executeAwardXpAction` is never used for rules. Its registry handler would always throw. Make one `awardXp` service for rules, rewards and manual adjustments. `[code]` Done: `@gami/rewards` is now the only code that writes XP and grants rule and challenge achievements.
- [x] **ENG-12** `P1` Rule evaluation errors are logged as "did not match", and unknown action types are marked `completed` with no effect. Store the real error, and reject unknown actions when the rule is saved. `[code]` Done. `log` and other unknown actions now fail instead of doing nothing, so existing rules using them show as failed.
- [x] **ENG-13** `P2` Check on save that referenced achievement keys exist, and warn when they are disabled. `[code]` Done. Disabled keys return a `warnings` list on save. The dashboard does not show it yet.

### 2.4 XP, levels and achievements

- [~] **ENG-14** `P1` Manual XP adjustment fails for external IDs. If the path ID is an existing `externalId`, the user insert is skipped and the ledger insert then fails with a 500. Resolve users properly (see DX-01). `[code]` An unknown ID now returns 404 rather than 500. Left: accepting external IDs (DX-01).
- [x] **ENG-15** `P1` Negative adjustments can push a balance below zero, while progression treats it as zero. Decide on a floor and enforce it in the transaction. `[code]` Done: a deduction below zero returns 422 `INSUFFICIENT_XP` and writes nothing.
- [x] **ENG-16** `P2` Level-ups include disabled levels. [calculator.ts:113](packages/progression/src/calculator.ts:113) loops over every number, producing "Level N" notices for levels that are switched off. Iterate over active levels. `[code]`
- [x] **ENG-17** `P2` `nextLevel` in the progress API assumes `level + 1`, which is wrong when a level is disabled. `[code]`

- [x] **ENG-29** `P1` The rule builder saves `in` and `not_in` values as a comma-separated string, while the evaluator requires an array. `in` never matches and `not_in` never excludes. Split the list when saving, and reject non-array values in validation. `[code]` Done: the builder always saves arrays, and validation rejects anything else. List values are saved as strings, so `in` will not match a numeric payload value.

### 2.5 Challenges

- [x] **ENG-18** `P1` Challenge rewards send no webhooks. XP rewards skip `xp.awarded` and `level.up`, and achievement rewards skip `achievement.unlocked`. ENG-11's shared service fixes this. `[code]`
- [x] **ENG-19** `P1` Reward failure handling is broken. In [challenge-processor.ts](apps/worker/src/challenge-processor.ts), a database error aborts the shared transaction, so the catch block's update also fails and all 50 rewards roll back. Process each record in its own transaction or savepoint. `[code]`
- [x] **ENG-20** `P2` Rewards for a missing or disabled achievement are marked complete with nothing granted. Record this as a failure. Skip the balance update if the ledger insert was a conflict, which is unconditional today at line 82. `[code]`

### 2.6 Delivery

- [x] **ENG-21** `P0` Webhook HTTP calls run inside one database transaction at [webhook-dispatcher.ts:87](apps/worker/src/webhook-dispatcher.ts:87). A batch of 50 slow endpoints can hold a transaction and connection for about 8 minutes and stall every later step of the poller. Claim rows, commit, send in parallel with per-endpoint limits, then record results. The email and integration dispatchers already work this way. `[code]`
- [x] **ENG-22** `P1` Permanent webhook failures retry anyway. The query at [webhook-dispatcher.ts:74](apps/worker/src/webhook-dispatcher.ts:74) reselects `failed` rows under 10 attempts with no backoff, so a 404 is retried on each poll. Separate `failed` from `dead`. `[code]` Done: `failed` is now final and a retry stays `pending`, so no separate `dead` status was needed.
- [ ] **ENG-23** `P2` Add a timestamp to the webhook signature to stop replay attacks, publish a verification helper in the SDK, and support secret rotation. `[code]`
- [ ] **ENG-24** `P2` Automatically disable endpoints after sustained failure and notify the owner. `failureCount` is only stored. `[code]`

- [x] **ENG-28** `P1` [notifications/src/service.ts](packages/notifications/src/service.ts) catches errors from a query inside the caller's transaction. A failed integration insert aborts that transaction, so the commit then fails and the XP award is lost. Phase 0 added a log line, but the catch needs a savepoint or a move outside the transaction. `[code]`

- [x] **ENG-30** `P2` Workers compare database timestamps with the app clock. `available_at` defaults to the database's `now()`, but [notification-dispatcher.ts:23](apps/worker/src/notification-dispatcher.ts:23) and others use `new Date()`, so clock skew delays rows. A 3.4 second skew failed a test. Other dispatchers hide this with 10 to 60 second buffers. Compare using the database clock everywhere. `[ran]`
- [x] **ENG-31** `P1` Every unique-violation check is broken. All 13 sites test `error.code === '23505'`, but Drizzle wraps errors and the code is on `error.cause`. Repeat badge awards are marked `failed` (12 of 16 demo runs of the badge rules that were not plain non-matches). Duplicate slugs should return 409 but will probably return 500, and concurrent idempotent events and XP adjustments lose their fallback. Add one `isUniqueViolation()` helper with tests. `[ran]`
- [x] **ENG-32** `P1` The notification dispatcher releases its row locks before doing the work. `FOR UPDATE SKIP LOCKED` runs in a transaction that ends immediately, so two workers can claim the same rows. `[code]`

### 2.7 Leaderboards

- [x] **ENG-25** `P1` `::int` casts in [service.ts:86](packages/leaderboards/src/service.ts:86) will overflow past 2.1 billion XP because the column is `bigint`, turning the leaderboard into a 500. Cast to `bigint`. `[code]`
- [x] **ENG-26** `P1` Deactivated users still appear in leaderboards, and zero-XP users are ranked. Filter both by default. `[code]` Done. A user with no XP in the period is unranked, and `getUserRank` returns `rank: null`.
- [x] **ENG-27** `P2` Fix or remove `getLeaderboardAroundUser`, which returns a page rather than a window and has no route. `[code]` Done: removed, because nothing used it. Rebuild it if a window view is wanted.

---

## Phase 3: Make every promise true

**Goal:** Every setting, doc and claim matches reality. **Exit:** a new user can follow any doc page and it works.

### 3.1 Admin settings

- [ ] **TRUTH-01** `P1` 24 settings across the security, registration, rate limit, notification, webhook and integration schemas are never read outside their schema. So far only the integration `enabled` and `allowDiscordIntegration` toggles and `requireEmailOtpVerification` are known to work. The webhook and notification `enabled` flags and `defaultEmailNotifications` still need checking. Implement each setting below, or remove it from the UI. `[ran]`
- [ ] **TRUTH-02** `P1` Enforce `allowPublicRegistration` and `allowOrgCreation`. Self-hosters currently cannot close sign-ups. `[ran]`
- [ ] **TRUTH-03** `P1` Enforce session lifetime, password policy, failed login lockout and login rate limits through Better Auth. `[ran]`
- [ ] **TRUTH-04** `P1` Make rate limits read from config. `RATE_LIMIT_MAX` defaults to 100 per minute, while the admin default claims 10,000. `[code]`
- [ ] **TRUTH-05** `P2` Enforce webhook and API key creation toggles, per-project limits, timeouts, retry counts, and daily email caps. `[ran]`
- [ ] **TRUTH-06** `P2` Make diagnostics honest. `migrations` reports `current` whenever the database is up, and `smtp` checks only env vars, so SMTP set through the UI shows as missing at [diagnostics](apps/api/src/admin/diagnostics/index.ts:36). The onboarding checklist has the same SMTP gap. `[code]`
- [ ] **TRUTH-07** `P3` Remove `allowSlackIntegration` and `allowExternalSso` until Slack and SSO exist. `[code]`

### 3.2 Deployment

- [ ] **TRUTH-08** `P1` Correct or build every false claim:
  - Streak tracking (not implemented, see FEAT-01)
  - Redis-cached leaderboards (no Redis in the service)
  - Multi-step challenges (counter only)
  - Multi-criteria achievements (no criteria model)
  - Scheduled backups and retention pruning (no scheduler exists)
  - DNS rebinding shield (see SEC-15)
  - Scoped API keys (see SEC-07)
  - "Enterprise Security" and the PASS marks in [docs/security-audit.md](docs/security-audit.md)
- [ ] **TRUTH-09** `P1` `/openapi.json` returns 404 in Docker because `.dockerignore` line 21 excludes `docs/`. Bundle the spec into the build. `[code]`
- [ ] **TRUTH-10** `P1` SMTP env names disagree. `.env.example` has `SMTP_PASS` and `SMTP_FROM`, the code reads `SMTP_PASSWORD` and `SMTP_FROM_EMAIL`, and compose passes none of them. `[ran]`
- [ ] **TRUTH-11** `P1` Fix the Docker images, which ship the whole builder stage with dev dependencies:
  - Use Next.js `standalone` output and `pnpm deploy`, and create slimmer runtime images.
  - Confirm `pnpm` works as a non-root user with Corepack, since the `migration` and `dashboard` commands need it. `[check]`
  - Confirm `/app/storage/backups` is writable. It looks root-owned, and compose mounts no volume, so backups would fail or vanish on recreate. `[check]`
  - Pass `TRUSTED_ORIGINS` and CORS origins through. CORS is hardcoded to localhost at [index.ts:77](apps/api/src/index.ts:77), which blocks any real domain. `[code]`
  - Add a reverse proxy and TLS example.
  - Stop the API starting after a failed migration at [index.ts:257](apps/api/src/index.ts:257). `[code]`

### 3.3 Documentation

- [ ] **TRUTH-12** `P1` Rewrite the README quickstart. `GamiClient`, `gami.ingestEvent`, `gami.getUserXp` and `pnpm --filter @gami/database migrate` do not exist, and the `.env` copy step is missing. `[ran]`
- [ ] **TRUTH-13** `P1` Remove the dead `docs/CURRENT_IMPLEMENTATION.md` link, and update the "20 test files, 155+ tests" claim. `[ran]`
- [ ] **TRUTH-14** `P1` Replace `gami_pk_live_`, which appears 13 times across docs and the dashboard, with the real prefix `gami_live_`. Copied examples fail with 401 otherwise. `[ran]`
- [ ] **TRUTH-15** `P1` Fix [packages/sdk/README.md](packages/sdk/README.md), which uses `eventKey`, `attributes`, `executionTimeMs` and no `projectId`. None of this matches the SDK. Compile docs examples in CI. `[ran]`
- [ ] **TRUTH-16** `P2` Replace the hardcoded `gamiapi.fied.cc` host in docs and dashboard samples with the instance's own URL. `[ran]`
- [ ] **TRUTH-17** `P2` Merge overlapping pages such as `backups.md` and `backup-restore.md`, or `analytics*.md`, and add a page describing architecture and security model. `[code]`

### 3.4 Data lifecycle

- [ ] **TRUTH-25** `P1` Organization import loses data: it skips levels, events, XP, badges awarded and challenge progress, even though they are exported. Phase 0 fixed a crash on any import containing rules (rule conditions and actions now round-trip) and three export fields that always came out empty. `[code]`
- [ ] **TRUTH-18** `P1` Organization import cannot work on real data. It inherits the global 64 KB body limit. Stream it, or allow a large authenticated upload limit on that route. `[code]`
- [ ] **TRUTH-19** `P1` Backups load every table into memory as JSON from the API process, including sessions and password hashes, and encryption is optional. Use `pg_dump` in a worker, encrypt by default, and support S3-compatible storage. `[code]`
- [ ] **TRUTH-20** `P1` Add scheduled jobs for backups and retention. Events, rule executions, outboxes and notifications grow without limit, and clean-up is manual. `[ran]`
- [ ] **TRUTH-21** `P1` Add hard deletion of an end user for GDPR and CCPA, including cascade and audit record. `DELETE` is only a soft deactivation. `[code]`
- [ ] **TRUTH-22** `P2` Neutralise CSV formula injection in [analytics.ts:387](packages/database/src/analytics.ts:387), and stream exports rather than buffering. `[code]`
- [ ] **TRUTH-23** `P2` Add an unsubscribe link and list-unsubscribe header to non-transactional email. Confirm what the current preference flow covers. `[check]`
- [ ] **TRUTH-26** `P2` Turbo's strict env mode drops variables set in the shell for `turbo dev`, so the apps silently fall back to localhost. `.env` works because the apps read it themselves. Declare the variables in `turbo.json` or document this. `.env.local` is also never loaded, despite being in `.gitignore`, which surprises people. `[ran]`
- [ ] **TRUTH-24** `P2` Commit the missing Drizzle snapshots. `meta/` has only `0002_snapshot.json` for 24 migrations, which makes `db:generate` unreliable. `platform_backups` has no migration at all, and the service creates the table through raw SQL at runtime, so add a proper migration. `[ran]`

---

## Phase 4: Developer experience

**Goal:** Integrating takes minutes, not hours. **Exit:** a new developer gets a user's XP in the browser in under 15 minutes.

### 4.1 Public API

- [ ] **DX-01** `P1` Accept external user IDs everywhere. Developers know their own ID, but most routes need internal `usr_...` IDs. `getBalance` with an external ID silently returns 0 XP. `[code]`
- [ ] **DX-02** `P1` Define a real versioned public API. Only `/v1/events` and data routes use `/v1`, while the SDK calls internal `/api/projects/...`, so dashboard refactors can break clients. `[ran]`
- [ ] **DX-03** `P1` Scope API keys to their project implicitly. `projectId` is required on every SDK call, even though the key already identifies it. `[code]`
- [ ] **DX-04** `P1` Return one error format. Routes return at least three shapes, and the limiter and some validators do not include `requestId`. Remove duplicated top-level fields in a major version. `[code]`
- [ ] **DX-05** `P2` Standardise pagination with cursors and totals. Events return no total, the XP ledger returns both `entries` and `data`, and some lists return bare arrays. `[code]`
- [ ] **DX-06** `P2` Validate all bodies with Zod. Levels and API keys use unchecked casts. `[code]`
- [ ] **DX-07** `P1` Generate OpenAPI from route schemas. [docs/openapi.json](docs/openapi.json) documents only 4 paths, and the dashboard docs page has its own hardcoded copy. `[ran]`
- [ ] **DX-08** `P2` Return awarded XP, badges and level changes from event ingestion through an optional synchronous evaluate mode, so apps can show rewards immediately. Trophy-style instant feedback is a major usability win. `[code]`
- [ ] **DX-09** `P2` Add batch ingestion at `POST /v1/events/batch`. `[code]`

### 4.2 Client-side access

- [ ] **DX-10** `P1` Add short-lived end-user tokens signed by the customer's backend. Today the SDK is called isomorphic, but in a browser it would expose a key with admin power. Warn about this in the docs now. `[code]`
- [ ] **DX-11** `P1` Make CORS configurable per project with an allowlist. `[code]`

### 4.3 SDKs and tooling

- [ ] **DX-12** `P1` Add a server-only check to the SDK and resolve DEC-1. `[code]`
- [ ] **DX-13** `P2` Keep SDK types generated from OpenAPI so they cannot drift. `[code]`
- [ ] **DX-14** `P2` Publish Python, then Go and PHP SDKs. `[code]`
- [ ] **DX-15** `P2` Add a CLI for key setup, sending test events, and syncing rules from version-controlled files. `[code]`
- [ ] **DX-16** `P3` Add an MCP server so AI agents can configure rules and inspect users. Trophy already offers one. `[code]`

---

## Phase 5: Dashboard UI and UX

**Goal:** Consistent, resilient and accessible. **Exit:** BASE-13 findings are cleared and an accessibility audit passes. All items are from code reading until the live walkthrough.

### 5.1 Foundations

- [ ] **UX-01** `P1` Project selection is lost on refresh. There is no `localStorage` or URL state, so a user always lands on the first org and project. Put org and project in the URL, for example `/o/:org/p/:project/rules`. This also fixes deep links.
- [ ] **UX-02** `P1` Confirmed live: unknown URLs show the default Next.js 404. Add `error.tsx`, `not-found.tsx`, `loading.tsx` and `global-error.tsx`. None exist, so a render error shows a blank or default page.
- [ ] **UX-03** `P1` Errors are silently hidden. There are 83 `catch {}` blocks, and failed reads often look like empty data. Show a clear error with a retry on every screen.
- [ ] **UX-04** `P1` Adopt TanStack Query or SWR. There are 129 hand-written `fetch` calls in 45 files, with no caching, deduping or shared error handling.
- [ ] **UX-05** `P2` Add a typed API client, reusing types from the SDK.
- [ ] **UX-06** `P2` Split the largest views: integrations (1,272 lines), users (1,022), webhooks (872), rules (838).
- [ ] **UX-07** `P2` Move auth checks into Next middleware, so protected pages stop flashing a loading screen before redirecting.
- [ ] **UX-08** `P2` Fix the platform admin check. `isPlatformAdmin` is read from the session, but Better Auth is not configured to expose it, so admins without an org role are treated as members in the shell.

### 5.2 Consistency

- [ ] **UX-09** `P1` Replace native `alert()` and `confirm()`, used more than 20 times, with the existing `Dialog` and toast components.
- [ ] **UX-10** `P1` Confirmed live: an organization owner sees a red "Platform administrator authorization required" banner above the form. Move `/dashboard/settings`, which shows platform SMTP config, to admin. It should hold project and org settings. Its access-denied copy already describes those.
- [ ] **UX-11** `P2` Define design tokens for colour, spacing and type, and use them everywhere. Colours are currently ad hoc across orange, emerald, amber, cyan, rose and purple.
- [ ] **UX-12** `P2` Fix typography. Space Grotesk is loaded, but the shell forces `font-mono` everywhere, with heavy use of uppercase and very small text. Use sans for UI and mono for code and IDs.
- [ ] **UX-13** `P2` Standardise corners and modal patterns. Corners mix `rounded-none` and other radii, and 7 files build their own overlays with `fixed inset-0`.
- [ ] **UX-14** `P2` Align terms. For example "Leaderboard" and "Leaderboards", "Delivery Health" and "System", "Challenges" and "Quests", plus the name in DEC-2.
- [ ] **UX-15** `P2` Remove references to things that do not exist: Slack in access copy, "streak challenges" in onboarding, and the "7-Day Streak" rule preset, which waits for a `streak_maintained` event that nothing emits.
- [ ] **UX-16** `P2` Hide or properly gate the "Data Management" link for plain members, who pass the client guard and then hit a server refusal.
- [ ] **UX-17** `P3` Remove the dead `registration` tab state in admin settings, or build that tab (TRUTH-02 needs it).

### 5.3 Accessibility and responsiveness

- [ ] **UX-18** `P1` Fix accessibility basics. There are only 7 `aria-` attributes against 114 buttons, and 4 `htmlFor` against 47 labels. Add names to icon buttons, associate labels, and manage focus in modals.
- [ ] **UX-19** `P2` Add keyboard support to dropdowns, drawers and clickable rows.
- [ ] **UX-20** `P2` Check colour contrast, especially `zinc-400` and `zinc-500` on near-black at small sizes.
- [ ] **UX-21** `P2` Make the 18 table screens work on phones, using horizontal scrolling or card layouts.
- [ ] **UX-22** `P3` Add a light theme and respect `prefers-reduced-motion`. There are no theme styles today.
- [ ] **UX-23** `P3` Use `Intl` formatting for dates and numbers, with a clear time zone. Leaderboard periods are in UTC, which should be labelled.

### 5.4 Missing workflows

- [ ] **UX-24** `P1` Add project and organization settings: rename and delete, with typed confirmation. The API supports this, but no UI exists.
- [ ] **UX-25** `P1` Add a forgot-password page (SEC-05), password strength hints, and account deletion.
- [ ] **UX-26** `P1` Build a first-run wizard that ends with a real event producing real XP, using a template rule, and live code samples with the user's own key and URL.
- [ ] **UX-27** `P2` Add a project template gallery such as Learning app, Fitness, Community, or SaaS onboarding.
- [ ] **UX-28** `P2` Improve the rule builder with a preview against real recent events and a "why did this not fire?" trace.
- [ ] **UX-29** `P2` Add a user timeline showing events, rules fired, XP, badges and deliveries on one screen.
- [ ] **UX-30** `P2` Add global search (Cmd+K), and bulk actions on users.
- [ ] **UX-32** `P2` The rule test panel reads `actionsExecuted`, but the evaluator returns `actions`, so matched rules never list their actions. `[code]`
- [ ] **UX-33** `P1` Analytics and the Developer page show `0` for every metric while loading, which looks like real data on a slow connection. On the live run, analytics showed 0 users with 5 present. The API keys page also says "No API keys" while loading. Show skeletons until data arrives. `[ran]`
- [ ] **UX-34** `P2` At phone width the top bar cuts off the project switcher. `[ran]`
- [ ] **UX-31** `P3` Add polish: better empty states with next steps, unsaved-change warnings, and skeletons that match their content.

---

## Phase 6: Scale and operations

**Goal:** Known capacity numbers and good visibility. **Exit:** a published load test and a runbook.

### 6.1 Performance

- [ ] **OPS-01** `P1` Run a load test and publish results for ingestion, worker throughput and leaderboards.
- [ ] **OPS-02** `P1` Back leaderboards with Redis sorted sets, and rebuild them from the ledger. Every read currently scans and ranks all project users.
- [ ] **OPS-03** `P1` Replace in-memory aggregation with SQL. Progression and challenge summaries load every row into Node.
- [ ] **OPS-04** `P2` Set worker concurrency and per-project fairness. The worker runs one job at a time, and one noisy project can starve others.
- [ ] **OPS-05** `P2` Use one `processEvent` flow. Processors and the poller both dispatch notifications and rewards, which adds redundant work.
- [ ] **OPS-06** `P2` Partition `events` and `xp_ledger` by month, and add rollup tables for analytics.
- [ ] **OPS-07** `P1` Reduce queries per request. Dashboard API calls took about 3 seconds against a database 170 to 300 ms away, which suggests a dozen or so sequential round trips each. Measure this, resolve auth and project access in one query, and cache API key lookups, which make three queries and write `last_used_at` per request.
- [ ] **OPS-08** `P3` Replace `Date.now()` based IDs with UUIDv7 or ULID, used consistently.

### 6.2 Observability

- [ ] **OPS-09** `P1` Replace `console.log` in the worker and packages with structured logging. Add request and event correlation IDs.
- [ ] **OPS-10** `P2` Expose Prometheus metrics, OpenTelemetry traces, and a sample Grafana dashboard.
- [ ] **OPS-11** `P2` Add alerts for outbox lag, dead letters and a stale worker.
- [ ] **OPS-12** `P2` Drain work on shutdown. The worker stops the timer without awaiting an in-flight poll.
- [ ] **OPS-13** `P2` Provide Helm charts, and one-click deployment templates such as Railway, Render or Coolify.

---

## Phase 7: New product features

**Goal:** Match the market, then lead on what self-hosting makes possible. Build in the order below, after Phase 2.

### 7.1 Parity (needed to compete)

- [ ] **FEAT-01** `P1` Streaks: daily or weekly, by user time zone, with freezes, repair, risk alerts and history. Build it as a first-class engine, not a rule preset.
- [ ] **FEAT-02** `P1` React components: progress bar, badge grid, leaderboard, streak calendar, toast, and notification feed. MIT licensed.
- [ ] **FEAT-03** `P1` Real-time updates through SSE or WebSockets, for instant toasts and live leaderboards.
- [ ] **FEAT-04** `P1` Achievement criteria built into the achievement itself, such as "100 lessons", with progress, tiers, and hidden or secret badges.
- [ ] **FEAT-05** `P1` Multi-step challenges: ordered steps, payload filters, recurring daily and weekly quests, and time-limited events.
- [ ] **FEAT-06** `P1` Metric aggregation in rules: sum, count, or unique values over a window, such as "spent $100 this month".
- [ ] **FEAT-07** `P2` Lifecycle messaging: streak reminders, weekly recaps, win-back emails, editable templates and scheduling.
- [ ] **FEAT-08** `P2` Mobile push through APNs and FCM, plus Slack, Teams and generic HTTP integrations.

### 7.2 Differentiators

- [ ] **FEAT-09** `P2` Points currencies and wallets: multiple currencies, spending, expiry and balances.
- [ ] **FEAT-10** `P2` Reward store: catalogue, redemption, stock, coupons, and fulfilment webhooks.
- [ ] **FEAT-11** `P2` Segments, and leaderboards by cohort, team, country or custom attribute.
- [ ] **FEAT-12** `P2` League systems with promotion and relegation, plus team and friend leaderboards.
- [ ] **FEAT-13** `P2` XP multipliers, boosts, and double-XP weekends, with scheduling.
- [ ] **FEAT-14** `P2` Anti-abuse: per-user caps, cooldowns, velocity checks, anomaly flags, and shadow-banning from rankings.
- [ ] **FEAT-15** `P2` Rule versioning, draft and publish, rollback, and environment promotion.
- [ ] **FEAT-16** `P2` Rule simulation: backtest a rule against past events, and show XP inflation before launch.
- [ ] **FEAT-17** `P2` Project environments (staging and production) with config promotion, including separate test and live API keys (from SEC-14).
- [ ] **FEAT-18** `P2` Inbound connectors for Segment, RudderStack, Stripe and GitHub.
- [ ] **FEAT-19** `P3` Referral and invite rewards.
- [ ] **FEAT-20** `P3` Social features: activity feed, sharing cards and kudos.
- [ ] **FEAT-21** `P3` Scripted rule conditions using a safe expression language such as CEL or JSONLogic.
- [ ] **FEAT-22** `P3` Plugin SDK for custom actions. The action registry is a good base.

### 7.3 Insight and enterprise

- [ ] **FEAT-23** `P2` Balance dashboard: XP inflow and spend, level funnels, drop-off and badge rarity.
- [ ] **FEAT-24** `P2` Impact analytics: A/B tests of mechanics, plus cohort retention of gamified and control users. This is the feature that proves customer value.
- [ ] **FEAT-25** `P3` SSO (SAML and OIDC), SCIM, and 2FA for the dashboard. 2FA should come first.
- [ ] **FEAT-26** `P3` Data warehouse export to BigQuery, Snowflake and S3.

---

## Phase 8: Launch and community

**Goal:** People can find, trust and contribute to the project.

### 8.1 Project health

- [ ] **LAUNCH-01** `P1` Add `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and issue and PR templates. None exist.
- [ ] **LAUNCH-02** `P1` Commission an independent security review, then rewrite `docs/security-audit.md` from its results.
- [ ] **LAUNCH-03** `P2` Add Dependabot or Renovate, secret scanning and image scanning.
- [ ] **LAUNCH-04** `P2` Automate versioning across packages. The root is `1.0.0-rc.1`, while the API says `0.1.0` and the SDK is `0.1.2`.

### 8.2 Go to market

- [ ] **LAUNCH-05** `P1` Build a docs site with search and a live API reference.
- [ ] **LAUNCH-06** `P1` Publish a hosted demo with sample data, and record a 2-minute video.
- [ ] **LAUNCH-07** `P1` Write a landing page positioned as a self-hosted alternative to hosted gamification APIs, with an honest comparison table.
- [ ] **LAUNCH-08** `P2` Build one real example app in `examples/`, such as a learning app with streaks.
- [ ] **LAUNCH-09** `P2` Publish guides on gamification design, including when not to use it.
- [ ] **LAUNCH-10** `P2` Launch on GitHub, Hacker News, Product Hunt, and self-hosting communities once the demo is solid.
- [ ] **LAUNCH-11** `P3` Validate a hosted cloud offering if DEC-5 points that way.

---

## Suggested order for the first milestones

1. **M1, Trustworthy repo:** Phase 0.
2. **M2, Safe:** All `P0` items in Phases 1 and 2, then SEC-05, SEC-10, SEC-17 and SEC-21.
3. **M3, Correct:** The rest of Phase 2, built on one shared `awardXp` service.
4. **M4, Honest RC2:** Phase 3.
5. **M5, Integrable:** DX-01 to DX-04, DX-07, DX-10, FEAT-01 and FEAT-02, then UX-01 to UX-04.
6. **M6, Public 1.0:** Remaining `P1` items, LAUNCH-01 to LAUNCH-07.
