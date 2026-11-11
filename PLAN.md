# Gami.Fied: Audit and Improvement Plan

This file tracks everything that needs fixing, improving or building. Tick items as they land and update the progress table.

- **Audit date:** 2026-11-05
- **Audited commit:** `5749e78` on `master`
- **Current version:** `1.1.0`, released on 2026-11-08

## How to use this file

- `[ ]` not started, `[~]` in progress, `[x]` done, `[-]` dropped (add a one-line reason).
- Work the phases in order. Phases 0 to 2 block any public 1.0. Phases 3 to 5 can overlap. Phases 6 to 8 follow. Phase 9 can start now; Phase 10 waits for DEC-5 and DEC-6.
- Add the PR link after an item when it is done, for example `[x] **SEC-01** ... (#123)`.
- New bugs go in the matching sub-phase with the next free ID.

**Priority:** `P0` exploitable or corrupts data, fix before anyone runs this in production. `P1` broken feature or false promise. `P2` important improvement. `P3` polish.

**Evidence:** `[ran]` confirmed by running something. `[code]` found by reading the code, not yet reproduced. `[check]` suspected, needs confirming on a live stack. Reproduce every `[code]` item with a failing test before fixing it.

## Progress

| Phase | Goal | Done / Total | Status |
| :--- | :--- | :---: | :--- |
| 0 | Baseline: green CI, runnable stack | 13 / 15 | In progress |
| 1 | Security and tenant safety | 21 / 23 | In progress, 1 partly done, 1 moved to FEAT-17 |
| 2 | Core engine correctness | 32 / 32 | Done |
| 3 | Make every promise true | 25 / 27 | In progress, 2 partly done |
| 4 | Developer experience | 11 / 16 | In progress, 1 partly done |
| 5 | Dashboard UI and UX | 51 / 57 | In progress, 6 partly done |
| 6 | Scale and operations | 10 / 21 | In progress, 7 partly done |
| 7 | New product features | 19 / 26 | In progress, 3 partly done |
| 8 | Launch and community | 0 / 11 | Not started, 4 moved to Phases 9 and 10 |
| 9 | Website, docs and sandbox | 0 / 32 | Not started |
| 10 | Cloud edition (open core) | 0 / 24 | Not started |

## Decisions needed from the maintainer

These change the work in later phases, so settle them early.

- [x] **DEC-1: SDK licence.** The SDK is AGPL-3.0-only. Many companies will not put an AGPL client library in a proprietary app, and that blocks adoption. Recommendation: MIT or Apache-2.0 for the SDK and any UI packages, keep AGPL on the server. Needs the rights of every contributor. Decided: **MIT** for the SDK from 1.0.0, with AGPL-3.0 kept on the server.
- [x] **DEC-2: Product name.** The repo mixes "Gami", "Gami.Fied", "Gami Engine" and "gami.fied". Pick one and do a trademark check. Decided: **Gami.Fied**, on `gami.fied.cc`. Left: replace the other spellings.
- [ ] **DEC-3: Default branch.** Local work is on `master`, the main branch is `main`, and both exist on `origin`. Keep one.
- [ ] **DEC-4: Target customer.** Recommendation: developers of consumer, edtech, fitness and community apps who want to own their data. This decides whether streaks, rewards and React components come before enterprise work such as SSO.
- [ ] **DEC-5: Business model.** Community only, open core, or a hosted cloud. The `edition: 'community'` field implies more editions are planned. Recommendation: **open core**. A paid Cloud and Enterprise edition sells running it, scale and enterprise features, while the Community engine stays complete (Phase 10).
- [ ] **DEC-6: Contributor licence agreement.** Without one, outside contributions are AGPL-only, which blocks using them in Cloud or `ee/` code. Recommendation: adopt a CLA (for example through CLA Assistant) before accepting outside pull requests.
- [ ] **DEC-7: Enterprise licence.** How `ee/` is licensed: a commercial licence with source available, or the Business Source License, which turns into open source after a few years. Recommendation: a commercial source-available licence, as GitLab and PostHog use.
- [ ] **DEC-8: Website stack and docs tool.** Recommendation: Next.js for `apps/website`, so it shares components with the dashboard, with Pagefind for search and Scalar for the API reference. Decide before WEB-01.
- [ ] **DEC-9: Cloud tenancy and pricing unit.** Recommendation: shared multi-tenant hosting with dedicated instances for Enterprise, priced by events per month with a free tier. This maps onto the existing per-organization event limit.

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
- [x] **BASE-12** `P1` Add GitHub Actions for lint, typecheck, build, tests with Postgres and Redis service containers, and Docker image builds. Written but not yet run on GitHub. Expect the first run to expose failures in the integration tests or Docker builds. Done: all three CI jobs pass on PR #1.

### 0.4 Live baseline

- [x] **BASE-13** `P1` Run the 26 API integration test files against real Postgres and Redis, then walk the main dashboard screens. Done against remote services: 182 of 186 API tests and all 17 database tests passed in the full serial run. 2 of the 4 failures were stale assertions (fixed), 1 was latency (passes with a longer limit, and one more timed out the same way), and 1 is ENG-30, which only fails when the database clock runs ahead. Screens covered: overview, leaderboards, rules, settings, users, analytics, events, developer, admin bootstrap and a 404, plus users at phone width. Not walked: the other screens, and admin pages past bootstrap.
- [x] **BASE-14** `P1` Run the full Docker stack from a clean machine and confirm the `[check]` items in 3.2. `[check]` Done: CI builds all three images, boots the stack and passes the smoke test.
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
- [x] **SEC-11** `P1` Replace scattered role checks with one declarative permission map, so a missing check is impossible. Generate the docs matrix from it. `[code]` Done: `apps/api/src/authorization/permissions.ts` protects new routes by default. The docs matrix is now generated from the registered routes (`docs/permissions.md`), and a test fails when it drifts. The 20 handler checks that duplicated the map are removed. Four stricter checks stay on purpose: project update and delete, and the two delivery-history reads, which the map allows for members.
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

- [x] **SEC-20** `P0` The production compose publishes Postgres and an unauthenticated Redis on all host interfaces. Remove the `ports` entries for both and enable `requirepass`. `[code]` Written, not yet run because Docker is not on this machine (BASE-14). Verified by the CI smoke test.
- [x] **SEC-21** `P1` `validateProductionConfig` accepts the `.env.example` placeholders such as `your-random-32-byte-secret-key-goes-here`. Reject them, require strong key lengths, and require `PLATFORM_BOOTSTRAP_SECRET` to be set. `[code]`
- [x] **SEC-23** `P1` The invitation sign-up form pre-fills the password `Password123!` in [accept-invitation/page.tsx](apps/dashboard/src/app/accept-invitation/page.tsx). Anyone who keeps it has a publicly known password. Start empty and enforce the password policy. `[code]`
- [x] **SEC-22** `P2` Remove source-code default secrets and the plain-text fallback in `decryptSecret`. Add a key ID to encrypted values so the master key can be rotated. Rename the `secret_hash` column, which holds an encrypted value. `[code]` Done, with `ENCRYPTION_MASTER_KEY_PREVIOUS` for rotation instead of a stored key ID. Rotated values are only re-encrypted when next saved.

---

## Phase 2: Core engine correctness

**Goal:** XP, badges and deliveries are always right. **Exit:** concurrency and crash tests pass for every award path.

### 2.1 Event ingestion

- [x] **ENG-01** `P1` Idempotent retries can return a false 409. [events/index.ts:142](apps/api/src/events/index.ts:142) compares `JSON.stringify` of a `jsonb` value, and Postgres reorders keys. Compare a canonical hash stored on the event. `[code]` Done by comparing canonical JSON rather than a stored hash, which also covers existing rows.
- [x] **ENG-02** `P1` Merge the two copies of ingestion. The dashboard test route skips the deactivated-user check and the `user.created` webhook, so test results can differ from production. Extract one `ingestEvent` service. `[code]` Done: `apps/api/src/services/event-ingestion.ts`. The test route now returns 403 for deactivated users and 409 for a changed payload.
- [x] **ENG-03** `P2` Move the `user.created` webhook into the same transaction as the user insert. It currently passes the user ID as the event ID and is not atomic. `[code]`
- [x] **ENG-04** `P2` Invalid `startDate` and `endDate` values become `Invalid Date` and probably return a 500. Validate all list query params with Zod. `[check]`

### 2.2 Replay and outbox

- [x] **ENG-05** `P1` Replay does nothing for processed events but reports success. `event_outbox.event_id` is unique, so the insert at [events/index.ts:580](apps/api/src/events/index.ts:580) is dropped, and the BullMQ `jobId` also dedupes. Rule executions then skip anything completed. Design real replay with a replay ID and a clear choice of what re-runs. `[code]` Done: replay runs failed rules, rules added since, and rules that did not match. Completed rules never run twice, so XP cannot be awarded again. There is deliberately no mode that repeats them.
- [x] **ENG-06** `P1` Event outbox has no terminal failure state. Attempts are not raised on reclaim, and failures retry forever. Add a max attempt count and a dead-letter view. `[code]` Done: events stop after 10 attempts with status `failed`, and `GET /api/projects/:projectId/events/dead-letter` lists them. Events never sit in `processing`, so reclaim has nothing to count. The dashboard screen is UX-35.
- [x] **ENG-07** `P2` The event outbox query has no `ORDER BY`, so ordering is not guaranteed and rows can starve. Order by `available_at, id`. `[code]`
- [x] **ENG-08** `P2` Build one generic claim, dispatch, retry helper. Six outboxes each repeat this logic with different bugs. `[code]` Done for claim, reclaim and backoff in `apps/worker/src/outbox.ts`. Events and challenge rewards keep their own loops because they work inside the transaction.

### 2.3 Rule execution

- [x] **ENG-09** `P1` Confirmed live. Non-matching rules are recorded as `failed` at [executor.ts:68](apps/worker/src/executor.ts:68). Every event writes a row for every enabled rule, with most marked failed, which bloats the table and pollutes health data. Filter by trigger in SQL, and record `skipped`. `[code]`
- [x] **ENG-10** `P1` A rule with two `award_xp` actions silently loses the second. `xp_ledger_rule_execution_unique` allows one row per execution, and the 23505 error is meant to be treated as a harmless duplicate (see ENG-31, which currently makes it fail instead). Add an action index to the unique key. `[code]` Done with migration 0025, which also stops a rule losing its second achievement.
- [x] **ENG-11** `P1` Rule-based XP sends no `xp.awarded` or `level.up` webhook. The executor at [executor.ts:84](apps/worker/src/executor.ts:84) has its own inline copy, and `executeAwardXpAction` is never used for rules. Its registry handler would always throw. Make one `awardXp` service for rules, rewards and manual adjustments. `[code]` Done: `@gami/rewards` is now the only code that writes XP and grants rule and challenge achievements.
- [x] **ENG-12** `P1` Rule evaluation errors are logged as "did not match", and unknown action types are marked `completed` with no effect. Store the real error, and reject unknown actions when the rule is saved. `[code]` Done. `log` and other unknown actions now fail instead of doing nothing, so existing rules using them show as failed.
- [x] **ENG-13** `P2` Check on save that referenced achievement keys exist, and warn when they are disabled. `[code]` Done. Disabled keys return a `warnings` list on save. The dashboard shows this in UX-35.

### 2.4 XP, levels and achievements

- [x] **ENG-14** `P1` Manual XP adjustment fails for external IDs. If the path ID is an existing `externalId`, the user insert is skipped and the ledger insert then fails with a 500. Resolve users properly (see DX-01). `[code]` Done: the path accepts internal or external IDs, and an unknown ID returns 404. Other routes are DX-01.
- [x] **ENG-15** `P1` Negative adjustments can push a balance below zero, while progression treats it as zero. Decide on a floor and enforce it in the transaction. `[code]` Done: a deduction below zero returns 422 `INSUFFICIENT_XP` and writes nothing.
- [x] **ENG-16** `P2` Level-ups include disabled levels. [calculator.ts:113](packages/progression/src/calculator.ts:113) loops over every number, producing "Level N" notices for levels that are switched off. Iterate over active levels. `[code]`
- [x] **ENG-17** `P2` `nextLevel` in the progress API assumes `level + 1`, which is wrong when a level is disabled. `[code]`

- [x] **ENG-29** `P1` The rule builder saves `in` and `not_in` values as a comma-separated string, while the evaluator requires an array. `in` never matches and `not_in` never excludes. Split the list when saving, and reject non-array values in validation. `[code]` Done: the builder always saves arrays, and validation rejects anything else. Text list values also match numeric payload values.

### 2.5 Challenges

- [x] **ENG-18** `P1` Challenge rewards send no webhooks. XP rewards skip `xp.awarded` and `level.up`, and achievement rewards skip `achievement.unlocked`. ENG-11's shared service fixes this. `[code]`
- [x] **ENG-19** `P1` Reward failure handling is broken. In [challenge-processor.ts](apps/worker/src/challenge-processor.ts), a database error aborts the shared transaction, so the catch block's update also fails and all 50 rewards roll back. Process each record in its own transaction or savepoint. `[code]`
- [x] **ENG-20** `P2` Rewards for a missing or disabled achievement are marked complete with nothing granted. Record this as a failure. Skip the balance update if the ledger insert was a conflict, which is unconditional today at line 82. `[code]`

### 2.6 Delivery

- [x] **ENG-21** `P0` Webhook HTTP calls run inside one database transaction at [webhook-dispatcher.ts:87](apps/worker/src/webhook-dispatcher.ts:87). A batch of 50 slow endpoints can hold a transaction and connection for about 8 minutes and stall every later step of the poller. Claim rows, commit, send in parallel with per-endpoint limits, then record results. The email and integration dispatchers already work this way. `[code]`
- [x] **ENG-22** `P1` Permanent webhook failures retry anyway. The query at [webhook-dispatcher.ts:74](apps/worker/src/webhook-dispatcher.ts:74) reselects `failed` rows under 10 attempts with no backoff, so a 404 is retried on each poll. Separate `failed` from `dead`. `[code]` Done: `failed` is now final and a retry stays `pending`, so no separate `dead` status was needed.
- [x] **ENG-23** `P2` Add a timestamp to the webhook signature to stop replay attacks, publish a verification helper in the SDK, and support secret rotation. `[code]` Done: `X-Gami-Signature-V2` and `X-Gami-Timestamp`, `verifyWebhook` in the SDK, and a 24 hour overlap on rotation. `X-Gami-Signature` stays for existing receivers and has no replay protection.
- [x] **ENG-24** `P2` Automatically disable endpoints after sustained failure and notify the owner. `failureCount` is only stored. `[code]` Done: 20 exhausted deliveries in a row disable the endpoint, with an audit log and an email to owners. The email has not been tested against a real SMTP server.

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

- [x] **TRUTH-01** `P1` 24 settings across the security, registration, rate limit, notification, webhook and integration schemas are never read outside their schema. So far only the integration `enabled` and `allowDiscordIntegration` toggles and `requireEmailOtpVerification` are known to work. The webhook and notification `enabled` flags and `defaultEmailNotifications` still need checking. Implement each setting below, or remove it from the UI. `[ran]` Done: `getPlatformSettings` is the one reader. Removed settings that duplicated others: `sessionExpirationMinutes`, `apiRateLimit`, `eventIngestionRateLimit`. Only part of these appear in the admin UI, and the rest are API-only (UX-36).
- [x] **TRUTH-02** `P1` Enforce `allowPublicRegistration` and `allowOrgCreation`. Self-hosters currently cannot close sign-ups. `[ran]` Done. The first account and invited emails can still sign up.
- [x] **TRUTH-03** `P1` Enforce session lifetime, password policy, failed login lockout and login rate limits through Better Auth. `[ran]` Done. Sessions now last a fixed time from sign-in, with no sliding refresh.
- [x] **TRUTH-04** `P1` Make rate limits read from config. `RATE_LIMIT_MAX` defaults to 100 per minute, while the admin default claims 10,000. `[code]` Done. The default project limit is now 1,000 per minute.
- [x] **TRUTH-05** `P2` Enforce webhook and API key creation toggles, per-project limits, timeouts, retry counts, and daily email caps. `[ran]` Done. Default retry counts and timeouts match the old hardcoded behaviour.
- [x] **TRUTH-06** `P2` Make diagnostics honest. `migrations` reports `current` whenever the database is up, and `smtp` checks only env vars, so SMTP set through the UI shows as missing at [diagnostics](apps/api/src/admin/diagnostics/index.ts:36). The onboarding checklist has the same SMTP gap. `[code]`
- [x] **TRUTH-07** `P3` Remove `allowSlackIntegration` and `allowExternalSso` until Slack and SSO exist. `[code]`

### 3.2 Deployment

- [x] **TRUTH-08** `P1` Correct or build every false claim: Done. Claims removed or corrected, and `docs/security-audit.md` is now an honest status page.
  - Streak tracking (not implemented, see FEAT-01)
  - Redis-cached leaderboards (no Redis in the service)
  - Multi-step challenges (counter only)
  - Multi-criteria achievements (no criteria model)
  - Scheduled backups and retention pruning (no scheduler exists)
  - DNS rebinding shield (see SEC-15)
  - Scoped API keys (see SEC-07)
  - "Enterprise Security" and the PASS marks in [docs/security-audit.md](docs/security-audit.md)
- [x] **TRUTH-09** `P1` `/openapi.json` returns 404 in Docker because `.dockerignore` line 21 excludes `docs/`. Bundle the spec into the build. `[code]` Done: the CI smoke test confirms the image serves the spec.
- [x] **TRUTH-10** `P1` SMTP env names disagree. `.env.example` has `SMTP_PASS` and `SMTP_FROM`, the code reads `SMTP_PASSWORD` and `SMTP_FROM_EMAIL`, and compose passes none of them. `[ran]`
- [x] **TRUTH-11** `P1` Fix the Docker images, which ship the whole builder stage with dev dependencies: Done: Dockerfiles that install from the lockfile, standalone dashboard output, a backups volume, configurable CORS, `Caddyfile.example`, and no start after a failed migration. The CI smoke test passes on the real images.
  - Use Next.js `standalone` output and `pnpm deploy`, and create slimmer runtime images.
  - Confirm `pnpm` works as a non-root user with Corepack, since the `migration` and `dashboard` commands need it. `[check]`
  - Confirm `/app/storage/backups` is writable. It looks root-owned, and compose mounts no volume, so backups would fail or vanish on recreate. `[check]`
  - Pass `TRUSTED_ORIGINS` and CORS origins through. CORS is hardcoded to localhost at [index.ts:77](apps/api/src/index.ts:77), which blocks any real domain. `[code]`
  - Add a reverse proxy and TLS example.
  - Stop the API starting after a failed migration at [index.ts:257](apps/api/src/index.ts:257). `[code]`

- [~] **TRUTH-27** `P1` Publish prebuilt images. Done: `release.yml` runs CI on a `v*.*.*` tag, publishes `gami-api`, `gami-worker` and `gami-dashboard` to GHCR for amd64 and arm64, and creates a GitHub release with a pinned compose file. `docker-compose.yml` now pulls these images, and `docker-compose.build.yml` builds from source. Left: run it once, which will also be the first arm64 build, and set the packages to public on GitHub. `[code]`

### 3.3 Documentation

- [x] **TRUTH-12** `P1` Rewrite the README quickstart. `GamiClient`, `gami.ingestEvent`, `gami.getUserXp` and `pnpm --filter @gami/database migrate` do not exist, and the `.env` copy step is missing. `[ran]`
- [x] **TRUTH-13** `P1` Remove the dead `docs/CURRENT_IMPLEMENTATION.md` link, and update the "20 test files, 155+ tests" claim. `[ran]`
- [x] **TRUTH-14** `P1` Replace `gami_pk_live_`, which appears 13 times across docs and the dashboard, with the real prefix `gami_live_`. Copied examples fail with 401 otherwise. `[ran]`
- [x] **TRUTH-15** `P1` Fix [packages/sdk/README.md](packages/sdk/README.md), which uses `eventKey`, `attributes`, `executionTimeMs` and no `projectId`. None of this matches the SDK. Compile docs examples in CI. `[ran]` Done, with `pnpm docs:check` in CI. This found wrong SDK types for events, progress and leaderboards, and an added test found four SDK paths that did not exist. All are fixed.
- [x] **TRUTH-16** `P2` Replace the hardcoded `gamiapi.fied.cc` host in docs and dashboard samples with the instance's own URL. `[ran]`
- [x] **TRUTH-17** `P2` Merge overlapping pages such as `backups.md` and `backup-restore.md`, or `analytics*.md`, and add a page describing architecture and security model. `[code]`

### 3.4 Data lifecycle

- [x] **TRUTH-25** `P1` Organization import loses data: it skips levels, events, XP, badges awarded and challenge progress, even though they are exported. Phase 0 fixed a crash on any import containing rules (rule conditions and actions now round-trip) and three export fields that always came out empty. `[code]`
- [x] **TRUTH-18** `P1` Organization import cannot work on real data. It inherits the global 64 KB body limit. Stream it, or allow a large authenticated upload limit on that route. `[code]` Done with a 100 MB route limit (`ORG_IMPORT_MAX_BYTES`). The import is still held in memory rather than streamed.
- [~] **TRUTH-19** `P1` Backups load every table into memory as JSON from the API process, including sessions and password hashes, and encryption is optional. Use `pg_dump` in a worker, encrypt by default, and support S3-compatible storage. `[code]` Done: encrypted by default with `ENCRYPTION_MASTER_KEY`, sessions left out, no default key. Left: `pg_dump`, running in a worker, and S3 storage. `pg_dump` and Docker are not available on this machine, so this needs a decision and an environment to test in.
- [x] **TRUTH-20** `P1` Add scheduled jobs for backups and retention. Events, rule executions, outboxes and notifications grow without limit, and clean-up is manual. `[ran]` Done: retention runs in the worker every 6 hours, and scheduled backups run in the API. Backups stay off until `backupIntervalHours` is set. Events and notifications are kept forever by default.
- [x] **TRUTH-21** `P1` Add hard deletion of an end user for GDPR and CCPA, including cascade and audit record. `DELETE` is only a soft deactivation. `[code]` Done: `POST /api/projects/:projectId/users/:userId/erase`. Backups still hold the user until they expire.
- [x] **TRUTH-22** `P2` Neutralise CSV formula injection, and stream exports rather than buffering. `[ran]` Done: formula injection is fixed, and row exports stream in batches of 2,000 with a keyset cursor, stopping at 1,000,000 rows. The summary report is still built in memory.
- [x] **TRUTH-23** `P2` Add an unsubscribe link and list-unsubscribe header to non-transactional email. Confirm what the current preference flow covers. `[check]` Done: signed link and one-click headers on notification emails, turning off all four email types. Not tested with a real mail client.
- [x] **TRUTH-26** `P2` Turbo's strict env mode drops variables set in the shell for `turbo dev`, so the apps silently fall back to localhost. `.env` works because the apps read it themselves. Declare the variables in `turbo.json` or document this. `.env.local` is also never loaded, despite being in `.gitignore`, which surprises people. `[ran]` Done: `turbo.json` passes these through, and the docs say `.env.local` is not read.
- [x] **TRUTH-24** `P2` Commit the missing Drizzle snapshots. `meta/` has only `0002_snapshot.json` for 24 migrations, which makes `db:generate` unreliable. `platform_backups` has no migration at all, and the service creates the table through raw SQL at runtime, so add a proper migration. `[ran]` Done: migration 0027 and a full snapshot, and `db:generate` now reports no changes. Older snapshots stay missing, which only matters for rollback.

---

## Phase 4: Developer experience

**Goal:** Integrating takes minutes, not hours. **Exit:** a new developer gets a user's XP in the browser in under 15 minutes.

### 4.1 Public API

- [x] **DX-01** `P1` Accept external user IDs everywhere. Developers know their own ID, but most routes need internal `usr_...` IDs. `getBalance` with an external ID silently returns 0 XP. `[code]` Done: all `/users/:userId` routes accept either ID, and responses always use the internal one.
- [x] **DX-02** `P1` Define a real versioned public API. Only `/v1/events` and data routes use `/v1`, while the SDK calls internal `/api/projects/...`, so dashboard refactors can break clients. `[ran]` Done: `apps/api/src/public/routes.ts` is the public surface. `/api/projects` routes stay as the internal API, and the SDK uses them only when given a `projectId`.
- [x] **DX-03** `P1` Scope API keys to their project implicitly. `projectId` is required on every SDK call, even though the key already identifies it. `[code]` Done for users, XP, levels, leaderboards, achievements, challenges and events. Other SDK resources still need `projectId`.
- [x] **DX-04** `P1` Return one error format. Routes return at least three shapes, and the limiter and some validators do not include `requestId`. Remove duplicated top-level fields in a major version. `[code]` Done with a response hook, which keeps the top-level `message` and `code`.
- [~] **DX-05** `P2` Standardise pagination with cursors and totals. Events return no total, the XP ledger returns both `entries` and `data`, and some lists return bare arrays. `[code]` Events now return `total` and `hasMore`. Left: cursors, and the same shape on other lists.
- [x] **DX-06** `P2` Validate all bodies with Zod. Levels and API keys use unchecked casts. `[code]`
- [x] **DX-07** `P1` Generate OpenAPI from route schemas. [docs/openapi.json](docs/openapi.json) documents only 4 paths, and the dashboard docs page has its own hardcoded copy. `[ran]` The spec is now generated from the public route table, a test keeps it in step, and the dashboard page loads it. Left: request and response schemas for most routes. Done differently: the spec is hand-written, with `openapi-contract.test.ts` running every documented example against the real API, and `sdk-contract.test.ts` doing the same for the SDK.
- [x] **DX-08** `P2` Return awarded XP, badges and level changes from event ingestion through an optional synchronous evaluate mode, so apps can show rewards immediately. Trophy-style instant feedback is a major usability win. `[code]` Done with `?wait=true`, which waits up to 5 seconds for the worker rather than running rules in the API.
- [x] **DX-09** `P2` Add batch ingestion at `POST /v1/events/batch`. `[code]`

### 4.2 Client-side access

- [x] **DX-10** `P1` Add short-lived end-user tokens signed by the customer's backend. Today the SDK is called isomorphic, but in a browser it would expose a key with admin power. Warn about this in the docs now. `[code]` Done: `POST /v1/end-user-tokens`, `/v1/me/*` and `gami.me`. Tokens are read-only and limited to one user.
- [x] **DX-11** `P1` Make CORS configurable per project with an allowlist. `[code]` Done: `allowedOrigins` on each project. An empty list allows any site, because tokens are limited to one user.

### 4.3 SDKs and tooling

- [x] **DX-12** `P1` Add a server-only check to the SDK and resolve DEC-1. `[code]` The SDK now refuses an API key in a browser unless `dangerouslyAllowBrowser` is set. DEC-1 is resolved: the SDK is MIT.
- [ ] **DX-13** `P2` Keep SDK types generated from OpenAPI so they cannot drift. `[code]`
- [ ] **DX-14** `P2` Publish Python, then Go and PHP SDKs. `[code]`
- [ ] **DX-15** `P2` Add a CLI for key setup, sending test events, and syncing rules from version-controlled files. `[code]`
- [ ] **DX-16** `P3` Add an MCP server so AI agents can configure rules and inspect users. Trophy already offers one. `[code]`

---

## Phase 5: Dashboard UI and UX

**Goal:** Consistent, resilient and accessible. **Exit:** BASE-13 findings are cleared and an accessibility audit passes. All items are from code reading until the live walkthrough.

### 5.1 Foundations

- [x] **UX-01** `P1` Project selection is lost on refresh. There is no `localStorage` or URL state, so a user always lands on the first org and project. Put org and project in the URL, for example `/o/:org/p/:project/rules`. This also fixes deep links. Done with `?project=<id>` on every page, plus `localStorage`, rather than a new route structure.
- [x] **UX-02** `P1` Confirmed live: unknown URLs show the default Next.js 404. Add `error.tsx`, `not-found.tsx`, `loading.tsx` and `global-error.tsx`. None exist, so a render error shows a blank or default page.
- [x] **UX-03** `P1` Errors are silently hidden. There are 83 `catch {}` blocks, and failed reads often look like empty data. Show a clear error with a retry on every screen. Done: any failed read now shows a banner with a retry, and a failed project load no longer looks like an empty account.
- [x] **UX-04** `P1` Adopt TanStack Query or SWR. There are 129 hand-written `fetch` calls in 45 files, with no caching, deduping or shared error handling. Done with `apiFetch` in `lib/api-client.ts`, which all 133 calls use. It uses TanStack Query's cache for sharing and short caching, with hooks kept as they were rather than rewritten to `useQuery`.
- [x] **UX-05** `P2` Add a typed API client, reusing types from the SDK. Done: `apiJson<T>` and `ApiError`. Hooks still declare their own response types, so reuse SDK types as they are touched.
- [~] **UX-06** `P2` Split the largest views: integrations (1,272 lines), users (1,022), webhooks (872), rules (838). Integrations constants are split out. Left: the views are still 800 to 1,200 lines, and splitting them further needs their state lifted, which is worth doing when each is next changed.
- [x] **UX-07** `P2` Move auth checks into Next middleware, so protected pages stop flashing a loading screen before redirecting. Done in `src/proxy.ts`, which only checks that a session cookie exists. The API still makes the real decision.
- [x] **UX-08** `P2` Fix the platform admin check. `isPlatformAdmin` is read from the session, but Better Auth is not configured to expose it, so admins without an org role are treated as members in the shell.

### 5.2 Consistency

- [x] **UX-09** `P1` Replace native `alert()` and `confirm()`, used more than 20 times, with the existing `Dialog` and toast components.
- [x] **UX-10** `P1` Confirmed live: an organization owner sees a red "Platform administrator authorization required" banner above the form. Move `/dashboard/settings`, which shows platform SMTP config, to admin. It should hold project and org settings. Its access-denied copy already describes those.
- [x] **UX-11** `P2` Define design tokens for colour, spacing and type, and use them everywhere. Colours are currently ad hoc across orange, emerald, amber, cyan, rose and purple. Done: brand, success, danger, warning and info tokens in `globals.css`, used everywhere.
- [x] **UX-12** `P2` Fix typography. Space Grotesk is loaded, but the shell forces `font-mono` everywhere, with heavy use of uppercase and very small text. Use sans for UI and mono for code and IDs. Done: sans everywhere, with monospace kept for code and IDs. Uppercase is limited to table headers.
- [x] **UX-13** `P2` Standardise corners and modal patterns. Corners mix `rounded-none` and other radii, and 7 files build their own overlays with `fixed inset-0`. Done: `ModalFrame` gives custom modals the shared behaviour, and only the webhook confirm dialog still has its own markup inside it.
- [x] **UX-14** `P2` Align terms. For example "Leaderboard" and "Leaderboards", "Delivery Health" and "System", "Challenges" and "Quests", plus the name in DEC-2. Leaderboard and Challenges are aligned, and "Gami Engine" and "Gami Dashboard" are now Gami.Fied. Correction: renaming the sidebar item to "System Health" was wrong. That page is project delivery health, and the platform-wide page is the one in the admin area. See UX-46. Done: the sidebar, page titles and search now share one set of names.
- [x] **UX-15** `P2` Remove references to things that do not exist: Slack in access copy, "streak challenges" in onboarding, and the "7-Day Streak" rule preset, which waits for a `streak_maintained` event that nothing emits.
- [x] **UX-16** `P2` Hide or properly gate the "Data Management" link for plain members, who pass the client guard and then hit a server refusal.
- [x] **UX-17** `P3` Remove the dead `registration` tab state in admin settings, or build that tab (TRUTH-02 needs it).

### 5.3 Accessibility and responsiveness

- [~] **UX-18** `P1` Fix accessibility basics. There are only 7 `aria-` attributes against 114 buttons, and 4 `htmlFor` against 47 labels. Add names to icon buttons, associate labels, and manage focus in modals. Dialogs have roles, focus handling and a Tab trap, focus outlines are visible, and icon buttons have names. Left: 19 of 58 labels are not linked to a field, mostly labels for groups, and no screen-reader audit has been run.
- [x] **UX-19** `P2` Add keyboard support to dropdowns, drawers and clickable rows. Done for rows, dialogs and dropdowns, which take arrow keys and Escape.
- [x] **UX-20** `P2` Check colour contrast, especially `zinc-400` and `zinc-500` on near-black at small sizes. Done: `zinc-500` and `zinc-600` text moved to `zinc-400`, about 7.9:1 on the background. Measured by colour values, not an automated audit.
- [x] **UX-21** `P2` Make the 18 table screens work on phones, using horizontal scrolling or card layouts. Done with sideways scrolling and a wrapping top bar.
- [x] **UX-22** `P3` Add a light theme and respect `prefers-reduced-motion`. There are no theme styles today. The theme toggle follows the system setting by default. Correction: reduced motion only covers CSS, so `motion` and GSAP animations ignore it (UX-54), and light theme accent text needs a contrast check (UX-52). Done: the dashboard has no JavaScript animation left, so the reduced motion rule covers everything.
- [x] **UX-23** `P3` Use `Intl` formatting for dates and numbers, with a clear time zone. Leaderboard periods are in UTC, which should be labelled. Done: `lib/format.ts`, and leaderboards say UTC.

### 5.4 Missing workflows

- [x] **UX-24** `P1` Add project and organization settings: rename and delete, with typed confirmation. The API supports this, but no UI exists. Done on `/dashboard/settings`, including the end-user token allowlist.
- [x] **UX-25** `P1` Add a forgot-password page (SEC-05), password strength hints, and account deletion. Done, with a password hint on sign-up. Account deletion is refused while the user owns an organization.
- [x] **UX-26** `P1` Build a first-run wizard that ends with a real event producing real XP, using a template rule, and live code samples with the user's own key and URL. Done on the Overview page for projects with no rules. Tested end to end: template, API key, test event, worker, XP.
- [x] **UX-27** `P2` Add a project template gallery such as Learning app, Fitness, Community, or SaaS onboarding. Done: Learning app, Fitness, Community and SaaS onboarding.
- [x] **UX-28** `P2` Improve the rule builder with a preview against real recent events and a "why did this not fire?" trace. Done: a "Why did this fire?" button shows the last 20 matching events, with the result and reason for each.
- [x] **UX-29** `P2` Add a user timeline showing events, rules fired, XP, badges and deliveries on one screen. Done: events, rule runs, XP and badges in the user drawer. Deliveries are not included.
- [x] **UX-30** `P2` Add global search (Cmd+K), and bulk actions on users. Done: Ctrl+K or Cmd+K finds pages and users, and users can be deactivated in bulk.
- [x] **UX-32** `P2` The rule test panel reads `actionsExecuted`, but the evaluator returns `actions`, so matched rules never list their actions. `[code]`
- [x] **UX-33** `P1` Analytics and the Developer page show `0` for every metric while loading, which looks like real data on a slow connection. On the live run, analytics showed 0 users with 5 present. The API keys page also says "No API keys" while loading. Show skeletons until data arrives. `[ran]`
- [x] **UX-34** `P2` At phone width the top bar cuts off the project switcher. `[ran]`
- [x] **UX-35** `P2` Show the failed-events list from `events/dead-letter` with a replay button, and show the `warnings` returned when saving a rule. `[code]`
- [~] **UX-36** `P2` Add admin screens for the registration, rate limit, notification, webhook, integration and retention settings, plus password rules. They work through `PATCH /api/admin/config`, which replaces a whole category, so a partial save resets the rest to defaults. `[code]` Screens are on the admin settings page, and password rules are on the security page. A save now keeps fields it does not send. Left: open them in a browser as a platform admin, which has not been done.
- [x] **UX-37** `P2` Done: the bell now shows project alerts from `GET /api/projects/:projectId/alerts`: failed events, recent rule failures and disabled webhooks. `[ran]`
- [x] **UX-31** `P3` Add polish: better empty states with next steps, unsaved-change warnings, and skeletons that match their content. Skeletons and most empty states are done. Left: unsaved-change warnings. Done: Project Settings warns before leaving with unsaved edits. Dialog forms stay open until closed.

### 5.5 Experience pass

From the audit of 6 November 2026. `[ran]` was measured on a production build, and `[code]` comes from reading the code.

**Roles and placement**

- [~] **UX-38** `P1` Platform admins have no link to `/admin`. Nothing in the dashboard points there, so they must know the URL. Add it to the profile menu, shown only to them, with a way back. `[code]` The link is in the sidebar footer and in search, shown only to platform admins, and admin has a way back. Left: seeing it in a browser, which needs a real platform admin.
- [x] **UX-39** `P1` Keep role rules in one place. 14 files each work out `isAdminOrOwner`. The sidebar's version ignores platform admins while the shell's includes them, and the sidebar and route guard keep separate lists, so `/dashboard/developer` is hidden from members but still opens by URL. Add one `usePermissions` hook and one navigation config that both use. `[code]` Done: `usePermissions` and `lib/navigation.ts`, used by the sidebar, route guard and search.
- [x] **UX-40** `P1` Hide actions members can never use, rather than showing disabled buttons across every list. Fix the mismatch where "Send Test Event" is disabled for members although the API allows it. `[code]` Done: `AdminOnly` hides these actions, status pills stay visible, and members can send test events.
- [x] **UX-41** `P1` Plain members can see every end user's email address. The dashboard shows it and the API returns it. Mask it for members on the server, not only in the UI. `[code]` Done on the server, in the user routes and the CSV export, with tests. Members see "Hidden".
- [x] **UX-42** `P2` A member with no assigned project gets no onboarding and no explanation. Add a "ask your admin for access" state, and show the user's role next to the organization name. `[code]` Done, and checked in a browser as a plain member.
- [x] **UX-43** `P2` Restructure the sidebar. It has 21 items, and scrolls at 900px tall. Suggested groups: Overview, then Build (Rules, Achievements, Levels, Challenges), Activity (Events, Users, XP, Leaderboard, Analytics), Connect (API Keys, Webhooks, Integrations, Developer, API Docs), and Settings. `[ran]` Done: Overview, Build, Activity, Connect and Manage, with 18 items. It fits at 900px.
- [x] **UX-44** `P2` Move organization items out of the project navigation. Members, Invitations and Data Management don't change with the project, so they belong in organization settings. Audit Logs and Delivery Health can sit under project settings. `[code]` Done: Team replaces three sidebar items, with Members, Invitations and Data tabs. Audit Logs and Delivery Health stay under Manage.
- [~] **UX-45** `P2` Tidy the admin area. Backups, Storage & Cleanup and the retention settings are one topic spread over three screens. Backups and Storage also share an icon. `[code]` Platform Health is added, the menu is reordered, and Backups and Storage have their own icons. Left: retention settings are still on Server Settings, with no link from Storage.
- [x] **UX-46** `P2` Fix page names. Use "Delivery Health" for the project page and "Platform Health" in admin. The top bar and page heading repeat each other and often disagree, such as "XP & Ledger System", so show one title. `[code]` Done: the top bar no longer repeats the title, and each page has one short heading.

**Clarity**

- [x] **UX-47** `P1` Make Overview useful for a running project. Today the 12-step checklist fills the screen. Lead with today's events, active users, failures and recent activity, and let the checklist be collapsed and dismissed. Remove "multi-event streak challenges" from the checklist, which is untrue. `[ran]` Done: stats, recent activity and top users lead, setup is collapsed and dismissible, and the SDK guide moved to Developer Hub.
- [x] **UX-48** `P2` Write screens in plain language. Replace "Backend-Driven Setup Checklist", "Event Ingestion Playground", "UTC period ledgers" and similar. `[ran]` Done across page descriptions, dialogs and the setup steps.
- [x] **UX-49** `P2` Add shared `PageHeader` and `EmptyState` components. Done: every dashboard and admin page uses `PageHeader`, with slots for actions and for tabs that scroll on phones. `EmptyState` covers the shell, Overview, Rules and API Docs, and other lists have clearer text.
- [x] **UX-50** `P2` Make search discoverable. Ctrl+K has no visible button or hint. `[code]` Done: a Search button with the shortcut in the top bar, plus arrow keys in the results.
- [~] **UX-51** `P2` Add sorting, filters and URL-kept state to the main tables. `[code]` Users has sorting, plus search, sort and page kept in the address. Left: the other tables.
- [x] **UX-52** `P2` Check light theme contrast. Accent text uses the 400 shades in 486 places, which suit dark backgrounds and are likely too pale on white. Give the tokens light theme values. `[ran]` Done: semantic shades swap in the light theme. Checked on Overview and the sidebar, not on every page.
- [x] **UX-53** `P3` Compact the phone header. The two switchers take a second row on every screen. `[ran]` Done: one row on phones, with the organization switcher in the drawer.

**Animation**

- [x] **UX-54** `P1` Make reduced motion real. The CSS rule doesn't reach JavaScript animations. Wrap the app in `MotionConfig reducedMotion="user"`. `[code]` Done differently: `motion` was removed, so CSS handles all motion and the existing rule applies.
- [x] **UX-55** `P2` Use one animation approach. GSAP is used for a single card in onboarding, so remove it. Use CSS for simple effects, and `motion` only for lists and exits. `[code]` Done: GSAP and `motion` are both removed, with only those packages leaving the lockfile.
- [x] **UX-56** `P2` Define motion tokens. Durations range from 150ms to 700ms with no system. Replace the 18 `transition-all` uses with named properties, add open and close animation to dialogs, and fix `animate-shimmer` on Overview, which has no keyframes and does nothing. Animate only `transform` and `opacity`. `[code]` Done: three duration tokens, open and close animation on dialogs, and no `transition-all` left.
- [x] **UX-57** `P2` Replace the full-screen "Loading session" spinner with the real layout and skeletons, so a refresh never blanks the app. `[ran]` Done: `ShellSkeleton`.

---

## Phase 6: Scale and operations

**Goal:** Known capacity numbers and good visibility. **Exit:** a published load test and a runbook.

### 6.1 Performance

- [~] **OPS-01** `P1` Run a load test and publish results for ingestion, worker throughput and leaderboards. `[ran]` Done: `scripts/load-test.mjs`, `scripts/benchmark-leaderboards.mjs` and `docs/performance.md`, with leaderboard query timings at 100,000 users. Left: end-to-end throughput on reference hardware, because the development database is 170 to 300 ms away and any figure from it would measure the network.
- [~] **OPS-02** `P1` Back leaderboards with Redis sorted sets, and rebuild them from the ledger. Every read currently scans and ranks all project users. `[ran]` Done with an index instead of Redis: the all-time top 20 went from about 185 ms to 1.5 ms at 100,000 users, with no second source of truth. Left: search and daily, weekly or monthly boards still rank every user, and rank and total cost about 30 ms per 100,000 users.
- [x] **OPS-03** `P1` Replace in-memory aggregation with SQL. Progression and challenge summaries load every row into Node. `[ran]` Done: level distribution and challenge summaries are counted in SQL, with tests.
- [~] **OPS-04** `P2` Set worker concurrency and per-project fairness. The worker runs one job at a time, and one noisy project can starve others. `[ran]` Done: `WORKER_CONCURRENCY` (default 4) and `DATABASE_POOL_MAX`. Left: per-project fairness.
- [ ] **OPS-05** `P2` Use one `processEvent` flow. Processors and the poller both dispatch notifications and rewards, which adds redundant work.
- [ ] **OPS-06** `P2` Partition `events` and `xp_ledger` by month, and add rollup tables for analytics.
- [~] **OPS-07** `P1` Reduce queries per request. Dashboard API calls took about 3 seconds against a database 170 to 300 ms away, which suggests a dozen or so sequential round trips each. Measure this, resolve auth and project access in one query, and cache API key lookups, which make three queries and write `last_used_at` per request. Measured again: real requests take 1 to 5 seconds where `/ready`, with one query, takes 0.2 seconds, so each request makes many round trips. The project access check is now one query. Left: session lookups still add a round trip per request, and the Better Auth cookie cache stays off so revoked sessions end at once.
- [ ] **OPS-08** `P3` Replace `Date.now()` based IDs with UUIDv7 or ULID, used consistently.

### 6.2 Observability

- [x] **OPS-09** `P1` Replace `console.log` in the worker and packages with structured logging. Add request and event correlation IDs. `[ran]` Done: a JSON logger in `@gami/config` with redaction and levels, used in the worker, packages and API startup code, and worker lines carry `eventId`, `projectId` and `ruleId`. API requests already return `X-Request-Id`.
- [~] **OPS-10** `P2` Expose Prometheus metrics, OpenTelemetry traces, and a sample Grafana dashboard. `[ran]` Done: `GET /metrics`, with a bearer token or admin session. Left: OpenTelemetry traces and a Grafana dashboard.
- [x] **OPS-11** `P2` Add alerts for outbox lag, dead letters and a stale worker. `[code]` Done: `deploy/prometheus/alerts.yml`, with a runbook in `docs/operations.md`. The rules are not run against a live Prometheus.
- [x] **OPS-12** `P2` Drain work on shutdown. The worker stops the timer without awaiting an in-flight poll. `[ran]` Done: the worker waits up to 30 seconds for jobs and the current poll, each outbox step has a timeout, and SMTP has timeouts. Tests cover it.
- [ ] **OPS-13** `P2` Provide Helm charts, and one-click deployment templates such as Railway, Render or Coolify.

### 6.3 Dashboard performance

Measured on a production build on 6 November 2026. API times are inflated by the remote development database, but the number of calls and round trips is real.

- [x] **OPS-14** `P1` Stop blocking the app on a loading chain. Each full page load waits for session, then organizations, then projects, one after another, before showing anything. Add one bootstrap endpoint. `[ran]` Done: `GET /api/bootstrap`.
- [x] **OPS-15** `P1` Cut calls per page. Overview makes 12 calls and took 14.6 seconds to settle, and its checklist call alone took 7.7 seconds. Add one overview endpoint. Analytics loads all 6 tabs on open, so load only the active tab. `[ran]` Done: `GET /api/projects/:projectId/overview`. Overview went from 12 calls to 5, and Analytics loads only the open tab.
- [~] **OPS-16** `P1` Reduce JavaScript. The login form loads 187 KB compressed, and app pages about 270 KB. There are no dynamic imports. Load heavy dialogs and the rule builder on demand, and move the auth pages off the dashboard bundle. Target 150 KB. `[ran]` Total JavaScript fell from 496 KB to 425 KB compressed by dropping GSAP, `motion` and 3 font weights, and rule dialogs load on demand. Left: the 150 KB target. Overview still loads about 300 KB.
- [x] **OPS-17** `P1` Move hooks to `useQuery` with stale-while-revalidate, so returning to a page shows data instantly and refreshes behind it. The current cache lasts 3 seconds, so screens reload on every visit. `[code]` Done with `useCachedState` rather than `useQuery`, so the hooks kept their shape. Moving between pages now shows a heading in about 100 ms, apart from data first loads.
- [x] **OPS-18** `P2` Route `/api` directly to the API at the reverse proxy in production. Every browser call currently goes through a Next.js route, which adds a hop. `[code]` Done in `Caddyfile.example`. Production needs the same route added.
- [x] **OPS-19** `P2` Pause polling in hidden tabs. Delivery Health and Platform Health poll every 5 seconds, even when nobody is looking. `[code]` Done: `setVisibleInterval`, including the alerts bell and Events auto-refresh.
- [x] **OPS-20** `P2` Trim fonts and effects. 7 font weights load, and `backdrop-blur` runs on every card, the sticky top bar and all toasts, which is expensive on low-end devices. `[code]` Done: 3 sans weights and 1 mono, and no `backdrop-blur` left on cards, the top bar or toasts.
- [~] **OPS-21** `P2` Add a Lighthouse budget to CI, so bundle size and load time can't drift back up. `[code]` `scripts/check-bundle.mjs` runs in CI with a 450 KB budget. Left: a Lighthouse run for load time.

---

## Phase 7: New product features

**Goal:** Match the market, then lead on what self-hosting makes possible. Build in the order below, after Phase 2.

### 7.1 Parity (needed to compete)

- [~] **FEAT-01** `P1` Streaks: daily or weekly, by user time zone, with freezes, repair, risk alerts and history. Build it as a first-class engine, not a rule preset. `[ran]` Done: the engine, tables, worker step, admin API, `/v1` reads with `atRisk`, history, SDK, a Streaks page, a Streaks tab on each user, `streak_updated` events that rules and achievements can react to, and reminder emails through Campaigns. Left: repair of a broken streak.
- [~] **FEAT-02** `P1` React components: progress bar, badge grid, leaderboard, streak calendar, toast, and notification feed. MIT licensed. `[code]` Done: `@gami.fied/react` with a provider, hooks, all six components and a small themeable stylesheet, plus a player-safe `/v1/me/leaderboard`. Tested by rendering on the server, not in a browser. Left: a look in real browsers, and publishing to npm.
- [x] **FEAT-03** `P1` Real-time updates through SSE or WebSockets, for instant toasts and live leaderboards. `[ran]` Done with SSE: `GET /v1/me/stream` for players, with resume from `Last-Event-ID`, and a staff stream that refreshes the Leaderboard, Events and user pages. Needs Redis, which the stack already uses. WebSockets were not needed.
- [x] **FEAT-04** `P1` Achievement criteria built into the achievement itself, such as "100 lessons", with progress, tiers, and hidden or secret badges. `[ran]` Done: criteria on count, sum, unique values or a streak, tiers with bonus XP, secret badges, progress endpoints, and an editor with progress bars on the user page.
- [x] **FEAT-05** `P1` Multi-step challenges: ordered steps, payload filters, recurring daily and weekly quests, and time-limited events. `[ran]` Done: steps in order, conditions on the event, daily and weekly repeats with history, start and end dates, and a builder in the dashboard.
- [x] **FEAT-06** `P1` Metric aggregation in rules: sum, count, or unique values over a window, such as "spent $100 this month". `[ran]` Done: a total-over-time condition that fires once when it is reached, in the rule builder, with a preset.
- [x] **FEAT-07** `P2` Lifecycle messaging: streak reminders, weekly recaps, win-back emails, editable templates and scheduling. `[ran]` Done: Campaigns with editable subject and message, variables, a live preview, timing, and no repeats or emails to anyone who unsubscribed. Tested by queueing into the email outbox, not against a real mail server.
- [~] **FEAT-08** `P2` Mobile push through APNs and FCM, plus Slack, Teams and generic HTTP integrations. `[code]` Done: all five, with device registration, encrypted credentials and dashboard setup. Slack, Teams and HTTP are tested against stand-ins, and push against stand-ins for Apple and Google. Left: a run with real Apple and Google accounts.

### 7.2 Differentiators

- [x] **FEAT-09** `P2` Points currencies and wallets: multiple currencies, spending, expiry and balances. `[ran]` Done: currencies with optional expiry, wallets with a history, spending the soonest-to-expire points first, a rule action, manual adjustments, SDK and API reads, and a Wallet tab on each user. Points about to expire are announced three days ahead.
- [x] **FEAT-10** `P2` Reward store: catalogue, redemption, stock, coupons, and fulfilment webhooks. `[ran]` Done: the catalogue, stock, a limit per person, code pools, one-step purchases that cannot oversell, fulfil and cancel with refunds, `reward.redeemed` and `reward.cancelled` webhooks, and a Store page. Rewards can also generate a unique coupon code for each purchase.
- [x] **FEAT-11** `P2` Segments, and leaderboards by cohort, team, country or custom attribute. `[ran]` Done: segments on user fields and metadata with a live preview, boards narrowed to a segment or to friends, a player's own country or other attribute through `sameAs`, and team or country boards by total or average XP.
- [x] **FEAT-12** `P2` League systems with promotion and relegation, plus team and friend leaderboards. `[ran]` Done: tiers, groups filled in order, weekly or daily seasons closed by the worker with promotion and relegation, a Leagues page, player and server reads, plus friend boards.
- [x] **FEAT-13** `P2` XP multipliers, boosts, and double-XP weekends, with scheduling. `[ran]` Done: boosts by time, day, hour and event, strongest wins, evaluated at event time, with a Boosts page.
- [x] **FEAT-14** `P2` Anti-abuse: per-user caps, cooldowns, velocity checks, anomaly flags, and shadow-banning from rankings. `[ran]` Done: XP caps, award caps and cooldowns, a log of blocked XP, and hiding someone from every leaderboard. Velocity flags on XP and events per hour, with optional auto-hide and a review queue.
- [x] **FEAT-15** `P2` Rule versioning, draft and publish, rollback, and environment promotion. `[ran]` Done: drafts, publish, history and rollback. Promotion between environments came with FEAT-17.
- [x] **FEAT-16** `P2` Rule simulation: backtest a rule against past events, and show XP inflation before launch. `[ran]` Done: a dry-run backtest over stored events with an estimate of XP inflation, in the rule editor.
- [x] **FEAT-17** `P2` Project environments (staging and production) with config promotion, including separate test and live API keys (from SEC-14). `[ran]` Done: production, staging and development projects, `gami_test_` keys outside production, and promotion of the design with a preview, chosen items, fixed references and rule history. Separate data for test keys inside one project was decided against: a staging project already gives fully separate data, keys and settings, and promotion moves the design across.
- [x] **FEAT-18** `P2` Inbound connectors for Segment, RudderStack, Stripe and GitHub. `[ran]` Done: Segment, RudderStack, Stripe and GitHub, with signatures checked over the raw body, idempotent delivery, identify calls filling profiles, and a Connectors page.
- [x] **FEAT-19** `P3` Referral and invite rewards. `[ran]` Done: invite codes, rewards in XP and currency for both sides on sign-up or a qualifying event, a per-player limit, a 30-day window, a `referral.completed` webhook, and an Invites page.
- [x] **FEAT-20** `P3` Social features: activity feed, sharing cards and kudos. `[ran]` Done: friends added by invite code, kudos with daily limits, an activity feed, and signed share-card images. Shown on a Community tab for each user.
- [x] **FEAT-21** `P3` Scripted rule conditions using a safe expression language such as CEL or JSONLogic. `[ran]` Done: JSONLogic expressions as rule conditions, with a safe evaluator, size limits checked on save, and an expression row in the rule builder.
- [x] **FEAT-22** `P3` Plugin SDK for custom actions. The action registry is a good base. `[ran]` Done: plugins loaded from `GAMI_PLUGINS` with namespaced actions, validation on save, retries with an idempotency key, and their actions offered in the rule builder. An example is in `examples/plugins`.

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

- [-] **LAUNCH-05** `P1` Build a docs site with search and a live API reference. Moved to WEB-12 to WEB-19.
- [-] **LAUNCH-06** `P1` Publish a hosted demo with sample data, and record a 2-minute video. Moved to WEB-25 to WEB-31.
- [-] **LAUNCH-07** `P1` Write a landing page positioned as a self-hosted alternative to hosted gamification APIs, with an honest comparison table. Moved to WEB-06 to WEB-08.
- [ ] **LAUNCH-08** `P2` Build one real example app in `examples/`, such as a learning app with streaks.
- [ ] **LAUNCH-09** `P2` Publish guides on gamification design, including when not to use it.
- [ ] **LAUNCH-10** `P2` Launch on GitHub, Hacker News, Product Hunt, and self-hosting communities once the demo is solid.
- [-] **LAUNCH-11** `P3` Validate a hosted cloud offering if DEC-5 points that way. Moved to Phase 10.

---

## Phase 9: Website, docs and sandbox

**Goal:** Anyone can understand Gami.Fied, try it without an account, and install it, from one site at `gami.fied.cc`.

**Shape:** a new `apps/website` in this repository, so docs, the OpenAPI document and the rules engine stay in one place and ship with each release.

```text
apps/website/
├─ app/
│  ├─ (marketing)/          # home, features, compare, pricing, blog, legal
│  ├─ docs/[...slug]/       # renders the repository's docs/ folder
│  ├─ reference/            # the API reference, from docs/openapi.json
│  ├─ playground/           # the in-browser rules sandbox
│  └─ demo/                 # starts a temporary live demo
├─ content/blog/            # posts in MDX
├─ components/
└─ lib/                     # docs loader, search index, shared metadata
```

**Hosting:** marketing, docs and the playground are static and can sit on any CDN. The live demo is a separate, isolated Gami.Fied instance at `demo.gami.fied.cc` that never holds customer data.

### 9.1 Foundation

- [ ] **WEB-01** `P1` Create `apps/website` with Next.js and the dashboard's design tokens, wired into Turbo, lint, typecheck and CI. It must build as a static export, apart from the demo routes.
- [ ] **WEB-02** `P1` Share brand, colours and type between the dashboard and the website through `packages/ui`, so the two look like one product.
- [ ] **WEB-03** `P1` Set up hosting and domains: `gami.fied.cc` for the site, `demo.gami.fied.cc` for the live demo, HTTPS, and a preview deployment for every pull request.
- [ ] **WEB-04** `P2` SEO basics: titles and descriptions per page, Open Graph images, `sitemap.xml`, `robots.txt`, and canonical links for versioned docs.
- [ ] **WEB-05** `P2` Privacy-friendly analytics without cookies (for example Plausible or Umami, self-hosted), so the site needs no consent banner. Track installs started, playground runs and demo starts.

### 9.2 Marketing pages

- [ ] **WEB-06** `P1` Home page: the one-line pitch ("the self-hosted, open-source gamification engine"), a short demo video or animation, a five-line code sample, and calls to action for the playground, the demo and installing.
- [ ] **WEB-07** `P1` Feature pages for each area (progression, economy, competition, community, integrations, administration), each with a screenshot and a link to its guide.
- [ ] **WEB-08** `P1` An honest comparison page against hosted APIs and other open-source engines, built from the table in this plan's assessment. Include where Gami.Fied is weaker.
- [ ] **WEB-09** `P2` Pricing page: Community is free forever; Cloud and Enterprise show "coming soon" with a waitlist until Phase 10 ships. State plainly that the engine is never cut down in Community (see CLOUD-01).
- [ ] **WEB-10** `P2` Blog, plus a changelog page built from `CHANGELOG.md`, so each release is announced without copying text.
- [ ] **WEB-11** `P2` Legal pages: privacy policy, terms for the demo and the site, and a plain explanation of the AGPL server and MIT SDK licences.

### 9.3 Docs

- [ ] **WEB-12** `P1` Render the repository's `docs/` folder as the docs site, with a sidebar, previous and next links, "edit this page" links, and headings that can be linked to. `docs/` stays the only source, so `pnpm docs:check` keeps covering it.
- [ ] **WEB-13** `P1` Full-text search across the docs, built at compile time (for example Pagefind), so it works without a search service.
- [ ] **WEB-14** `P1` API reference rendered from `docs/openapi.json` (for example Scalar), with a "try it" panel that calls the demo instance with a demo key.
- [ ] **WEB-15** `P1` Installation guides as their own section: Docker Compose (the release files), upgrading, reverse proxies, backups, and a one-page "production checklist". Link each to the matching GitHub release.
- [ ] **WEB-16** `P2` One-click deploy guides for common self-hosting platforms (for example Coolify, Railway, Render, DigitalOcean), each tested on a real account before it is published.
- [ ] **WEB-17** `P2` SDK and React component docs with live examples, generated where possible from the SDK's types.
- [ ] **WEB-18** `P2` Versioned docs: the latest release by default, with older versions kept at `/docs/v1.0/...`, built from each release tag.
- [ ] **WEB-19** `P2` A link checker in CI for the built site, covering internal links and anchors.

### 9.4 In-browser playground

Runs the real rules engine in the browser. It needs no server, holds no data, and cannot be abused.

- [ ] **WEB-20** `P1` Make `packages/rules` run in a browser. `validator.ts` uses `Buffer.byteLength` (use `TextEncoder` instead), and `plugins.ts` imports Node's `path` and `url` for `loadPlugins` (move the loader to a Node-only entry such as `@gami/rules/node`). Add a test that bundles the package for the browser.
- [ ] **WEB-21** `P1` Playground page: a rule editor (the dashboard's visual builder and a JSON view), an event composer with presets, and a results panel showing whether the rule matched, which actions ran, and the XP, badges and currency a user would get.
- [ ] **WEB-22** `P2` Simulate a user over time in the browser: streaks, levels and totals over past events, using `packages/progression` and the aggregate logic, with a timeline of what happened.
- [ ] **WEB-23** `P2` Ready-made scenarios to load with one click, such as a learning app with daily streaks, a shop with a points store, or a fitness app with weekly leagues.
- [ ] **WEB-24** `P2` Share a playground setup as a link, with the state kept in the URL, and export it as rule JSON ready to paste into a real install.

### 9.5 Live demo without an account

A real dashboard to click around, created on demand and thrown away.

- [ ] **WEB-25** `P1` "Try the dashboard" creates a temporary organization and project on the demo instance and signs the visitor in to it without an account. It expires after 24 hours, and the worker deletes it and everything in it.
- [ ] **WEB-26** `P1` Seed every demo with a realistic dataset: users, events over the last month, rules, achievements, streaks, a store and a league. Add a "send traffic" button that generates events live, so boards and toasts move.
- [ ] **WEB-27** `P1` Lock demos down with the admin controls from 1.1.0. Turn off webhooks, integrations, connectors, campaigns and push for demo organizations, and set policies of one project, one member and a low events-per-minute limit. Send no email at all from the demo instance.
- [ ] **WEB-28** `P1` Abuse protection for starting demos: a rate limit per address and a privacy-friendly challenge (for example Cloudflare Turnstile), a cap on live demos, and alerts when it is reached.
- [ ] **WEB-29** `P2` Run the demo instance apart from everything else: its own servers, database and Redis, no customer data, a daily reset of anything left over, and its version updated with each release.
- [ ] **WEB-30** `P3` "Keep this setup": export a demo's design (rules, achievements, store and so on) as a file that a self-hosted install can import, and later into a Cloud account.

### 9.6 Launch the site

- [ ] **WEB-31** `P2` Record a two-minute product video and take screenshots for every feature page, with the demo instance as the source.
- [ ] **WEB-32** `P2` A status page for the site, the demo and later the cloud.

---

## Phase 10: Cloud edition (open core)

**Goal:** A paid, hosted Gami.Fied that funds the project, while the self-hosted Community edition stays complete and free.

**Principle:** Cloud sells running it, scale and enterprise needs. It never wins by removing engine features from Community. Everything released under AGPL stays available, and new engine features ship to Community at the same time.

**Shape:** the cloud runs the same API, worker and dashboard as Community, configured per customer. Cloud-only code lives in a separate private repository:

```text
gami-cloud/                 # private
├─ apps/
│  ├─ control-plane/        # sign-up, plans, customer admin for the team
│  └─ billing/              # Stripe checkout, customer portal and webhooks
├─ packages/
│  ├─ entitlements/         # plan -> feature switches and organization policies
│  └─ metering/             # events and active users per organization
└─ infra/                   # Terraform and deployment for production
```

Enterprise features that self-hosting companies can also buy (SSO, SCIM) live in this repository under `ee/` with a commercial licence, and are left out of Community builds.

### 10.1 Editions and licensing

- [ ] **CLOUD-01** `P1` Write `docs/editions.md`: what Community, Cloud and Enterprise each include, the rule that the engine is never cut down in Community, and a table of features by edition. Publish it on the website (WEB-09).
- [ ] **CLOUD-02** `P1` Add a contributor licence agreement bot before taking outside contributions, so contributed code can be used in every edition (see DEC-6).
- [ ] **CLOUD-03** `P2` Create `ee/` with its own `LICENSE`, and make Community builds and images leave it out. CI checks that nothing outside `ee/` imports from it.
- [ ] **CLOUD-04** `P2` Edition detection: `product.edition` becomes `community`, `cloud` or `enterprise`. Self-hosted Enterprise uses a signed licence key checked offline, so it never has to call home.

### 10.2 Plans, billing and usage

- [ ] **CLOUD-05** `P1` Set up the private `gami-cloud` repository. It consumes this repository's packages and images by version, never by copying code, so a Community release can be deployed to Cloud unchanged.
- [ ] **CLOUD-06** `P1` Sign-up and onboarding for the cloud: create an account, an organization and a first project, verify email, and land in the existing onboarding checklist.
- [ ] **CLOUD-07** `P1` Plans and entitlements: each plan is a set of feature switches and organization policies (projects, members, events per minute and so on), applied through the admin controls added in 1.1.0. Changing plan rewrites those settings in one step and records it in the audit log.
- [ ] **CLOUD-08** `P1` Usage metering: count events and monthly active users per organization, store daily totals, and show usage against the plan in the dashboard.
- [ ] **CLOUD-09** `P1` Billing with Stripe: checkout, the customer portal, invoices, failed-payment retries, upgrades and downgrades with proration, and tax collection.
- [ ] **CLOUD-10** `P1` Limits when a plan runs out: warnings at 80% and 100%, a grace period, then events beyond the plan answer `429` with a clear code. Data is never deleted for being over the limit.
- [ ] **CLOUD-11** `P2` Free trials and a free tier, with the trial length and limits set in one place.

### 10.3 Running the cloud

- [ ] **CLOUD-12** `P1` Infrastructure as code (for example Terraform): managed PostgreSQL with point-in-time recovery, Redis, object storage for backups and exports, and separate staging and production.
- [ ] **CLOUD-13** `P1` Shared multi-tenant hosting by default, on the existing organization isolation. Before launch, run a focused review of cross-tenant access and per-tenant rate limits, and add a test suite that tries to reach another tenant's data.
- [ ] **CLOUD-14** `P1` Backups, restore drills and disaster recovery, building on `docs/disaster-recovery.md`, with a target recovery time and data loss stated on the pricing page.
- [ ] **CLOUD-15** `P1` Monitoring, alerting and on-call with the Prometheus metrics added in 1.1.0, plus the status page (WEB-32).
- [ ] **CLOUD-16** `P2` Dedicated instances for Enterprise customers who need them, deployed from the same images.
- [ ] **CLOUD-17** `P2` Regions for data residency, starting with the EU and the US.
- [ ] **CLOUD-18** `P2` Compliance groundwork: a data processing agreement, a list of sub-processors, GDPR export and deletion (the erase routes exist), a penetration test, and SOC 2 readiness.

### 10.4 What paid plans add

- [ ] **CLOUD-19** `P2` SSO with SAML and OIDC, and SCIM provisioning (FEAT-25), as Enterprise features in `ee/`.
- [ ] **CLOUD-20** `P2` Impact analytics and A/B tests of mechanics (FEAT-24) and the balance dashboard (FEAT-23), offered in Cloud and Enterprise.
- [ ] **CLOUD-21** `P2` Longer data and audit-log retention, and audit-log export, set per plan.
- [ ] **CLOUD-22** `P2` Support tiers and uptime commitments, with response times per plan.

### 10.5 Keep Community healthy

- [ ] **CLOUD-23** `P1` Moving both ways: import a self-hosted install into Cloud, and export a Cloud organization to run it yourself, using the existing data export and import. Nobody is locked in.
- [ ] **CLOUD-24** `P2` A release check that every engine feature in Cloud is also in the Community build, with any exception listed in `docs/editions.md`.

---

## Suggested order for the first milestones

1. **M1, Trustworthy repo:** Phase 0.
2. **M2, Safe:** All `P0` items in Phases 1 and 2, then SEC-05, SEC-10, SEC-17 and SEC-21.
3. **M3, Correct:** The rest of Phase 2, built on one shared `awardXp` service.
4. **M4, Honest RC2:** Phase 3.
5. **M5, Integrable:** DX-01 to DX-04, DX-07, DX-10, FEAT-01 and FEAT-02, then UX-01 to UX-04.
6. **M6, Public 1.0:** Remaining `P1` items, LAUNCH-01 to LAUNCH-07.
7. **M7, Website and playground:** WEB-01 to WEB-15 and WEB-20 to WEB-21. Static, cheap and safe, and it gives people a reason to try Gami.Fied before Cloud exists.
8. **M8, Live demo:** WEB-25 to WEB-29, then the rest of Phase 9.
9. **M9, Cloud beta:** Settle DEC-5, DEC-6, DEC-7 and DEC-9, then CLOUD-01, CLOUD-02, CLOUD-05 to CLOUD-10 and CLOUD-12 to CLOUD-15, with a waitlist of design partners.
10. **M10, Cloud launch:** The rest of Phase 10, starting with CLOUD-23 so moving both ways works on day one.
