# Gami.Fied: Audit and Improvement Plan

This file tracks everything that needs fixing, improving or building. Tick items as they land and update the progress table.

- **Audit date:** 2026-11-05
- **Audited commit:** `5749e78` on `master`
- **Current version:** `1.2.0`, released on 2026-11-13
- **Second audit:** 2026-11-13, commit `e178fe8` on `ops/phase-6`. It covers the code added since the first audit and both interfaces, and its findings are Phases 11 to 15.

## How to use this file

- `[ ]` not started, `[~]` in progress, `[x]` done, `[-]` dropped (add a one-line reason).
- Work the phases in order. Phases 0 to 2 block any public 1.0. Phases 3 to 5 can overlap. Phases 6 to 8 follow. Phase 9 can start now; Phase 10 waits for DEC-5 and DEC-6.
- Phases 11 to 15 come from the second audit and are split by kind: **Fixes** (11), **Suggestions** (12), **Additions** (13), **Dashboard** (14) and **Website** (15). Phase 11 comes before any new feature work, and its `P0` and `P1` items block the next release. Phases 14 and 15 can run alongside it. Phase 13 is a backlog to pick from.
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
| 9 | Website, docs and sandbox | 33 / 44 | In progress, 10 partly done |
| 10 | Cloud edition (open core) | 0 / 24 | Not started |
| 11 | Fixes: security and correctness (second audit) | 20 / 20 | Done |
| 12 | Suggestions: hardening, speed and quality | 11 / 12 | In progress, 1 partly done |
| 13 | Additions: new features | 6 / 19 | 13.1 done; 13.2 and 13.3 not started |
| 14 | Dashboard interface (second pass) | 13 / 19 | In progress, 4 partly done, 2 dropped |
| 15 | Website interface (second pass) | 14 / 14 | Done; needs a check on a real phone |

## Decisions needed from the maintainer

These change the work in later phases, so settle them early.

- [x] **DEC-1: SDK licence.** The SDK is AGPL-3.0-only. Many companies will not put an AGPL client library in a proprietary app, and that blocks adoption. Recommendation: MIT or Apache-2.0 for the SDK and any UI packages, keep AGPL on the server. Needs the rights of every contributor. Decided: **MIT** for the SDK from 1.0.0, with AGPL-3.0 kept on the server.
- [x] **DEC-2: Product name.** The repo mixes "Gami", "Gami.Fied", "Gami Engine" and "gami.fied". Pick one and do a trademark check. Decided: **Gami.Fied**, on `gami.fied.cc`. Left: replace the other spellings.
- [ ] **DEC-3: Default branch.** Local work is on `master`, the main branch is `main`, and both exist on `origin`. Keep one.
- [ ] **DEC-4: Target customer.** Recommendation: developers of consumer, edtech, fitness and community apps who want to own their data. This decides whether streaks, rewards and React components come before enterprise work such as SSO.
- [ ] **DEC-5: Business model.** Community only, open core, or a hosted cloud. The `edition: 'community'` field implies more editions are planned. Recommendation: **open core**. A paid Cloud and Enterprise edition sells running it, scale and enterprise features, while the Community engine stays complete (Phase 10).
- [ ] **DEC-6: Contributor licence agreement.** Without one, outside contributions are AGPL-only, which blocks using them in Cloud or `ee/` code. Recommendation: adopt a CLA (for example through CLA Assistant) before accepting outside pull requests.
- [ ] **DEC-7: Enterprise licence.** How `ee/` is licensed: a commercial licence with source available, or the Business Source License, which turns into open source after a few years. Recommendation: a commercial source-available licence, as GitLab and PostHog use.
- [x] **DEC-8: Website stack and docs tool.** Decided: **Astro** with the **Starlight** docs theme for `apps/website`, because it sends almost no JavaScript on content pages, with React islands for the playground and demo, Pagefind for search and Scalar for the API reference. Animation uses GSAP, Motion and Astro's View Transitions (9.7). The dashboard stays on Next.js.
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

**Goal:** Anyone can understand Gami.Fied, try it without an account, and install it, from one fast, polished site at `gami.fied.cc`.

**Stack (DEC-8, decided):** [Astro](https://astro.build) with the [Starlight](https://starlight.astro.build) docs theme, in a new `apps/website` in this repository. Astro sends plain HTML and CSS by default and adds JavaScript only to the parts of a page that need it, which suits a content site far better than the dashboard's Next.js. Interactive parts are React "islands", so they can use `packages/rules` and reuse dashboard components. Animation uses GSAP, Motion and Astro's View Transitions, chosen per element in 9.7.

```text
apps/website/
├─ astro.config.mjs            # Starlight, React, sitemap, View Transitions
├─ src/
│  ├─ pages/
│  │  ├─ index.astro           # home
│  │  ├─ features/[slug].astro # one page per feature area
│  │  ├─ compare.astro
│  │  ├─ pricing.astro
│  │  ├─ blog/[...slug].astro
│  │  ├─ changelog.astro       # built from CHANGELOG.md
│  │  ├─ playground.astro      # hosts the playground island
│  │  ├─ demo.astro            # starts a live demo
│  │  └─ 404.astro
│  ├─ content/
│  │  ├─ config.ts             # docs (the repository's docs/ folder) and blog collections
│  │  └─ blog/                 # posts in MDX
│  ├─ components/              # static .astro components: header, footer, cards, tables
│  ├─ islands/                 # React: Playground, DemoLauncher, PricingToggle, CodeTabs
│  ├─ motion/
│  │  ├─ tokens.ts             # durations, easings, distances, shared by CSS, GSAP and Motion
│  │  ├─ lifecycle.ts          # start and clean up animations around page transitions
│  │  ├─ reveal.ts             # the standard scroll reveal (Motion)
│  │  └─ scenes/               # GSAP scenes: hero engine, how it works, feature demos
│  ├─ layouts/
│  └─ styles/                  # Tailwind and the shared design tokens
└─ public/                     # fonts, Open Graph images, static media
```

The docs live at `/docs` through Starlight, reading the repository's own `docs/` folder, so `docs/` stays the only source and `pnpm docs:check` keeps covering it.

**Hosting:** the site is static and can sit on any CDN. The live demo is a separate, isolated Gami.Fied instance at `demo.gami.fied.cc` that never holds customer data.

### 9.1 Foundation

- [x] **WEB-01** `P1` Create `apps/website` with Astro, the Starlight, React, Tailwind and sitemap integrations, and View Transitions, wired into Turbo, lint, typecheck and CI. The build is a static export; only the demo start uses a server endpoint, or calls the demo instance directly.
 `[ran]` Done: Astro 7 with Starlight, React, Tailwind 4 and View Transitions, installed through the CLI at their latest versions, building statically and covered by the root lint, typecheck and build. The sitemap comes from Starlight.
- [x] **WEB-02** `P1` Share the brand between the dashboard and the website: move colours, type and spacing into design tokens in `packages/ui` that both Tailwind setups read, so the two look like one product. Components shared with the dashboard are used as React islands.
 `[ran]` Done: `@gami/ui/tokens.css` holds the colours and fonts, and both the dashboard and the website import it. Starlight's accent and greys are mapped onto the same tokens.
- [~] **WEB-03** `P1` Set up hosting and domains: `gami.fied.cc` for the site, `demo.gami.fied.cc` for the live demo, HTTPS, and a preview deployment for every pull request.
 `[code]` Done: `.github/workflows/website.yml` builds every change, deploys to Cloudflare Pages once the secrets are set, keeps previews out of search, and links each pull request's preview. Left: create the Cloudflare Pages project, add the secrets, and point `gami.fied.cc` at it.
- [x] **WEB-04** `P2` SEO basics: titles and descriptions per page, Open Graph images generated at build time, `sitemap.xml`, `robots.txt`, and canonical links for versioned docs.
 `[ran]` Done: titles, descriptions, canonical links and social cards on every page, Open Graph images drawn at build time in the brand font, `sitemap-index.xml` and `robots.txt`, with previews set to noindex.
- [~] **WEB-05** `P2` Privacy-friendly analytics without cookies (for example Plausible or Umami, self-hosted), so the site needs no consent banner. Track installs started, playground runs and demo starts.
 `[code]` Done: Plausible or Umami, loaded only when configured and never on previews, with `data-track` click counting and the event names in one place. Left: run the analytics instance and set its variables, `playground_run` is sent for each event sent in the playground, and `demo_started` when a "Try the dashboard" button is clicked.

### 9.2 Marketing pages

- [x] **WEB-06** `P1` Home page: the one-line pitch ("the self-hosted, open-source gamification engine"), the animated engine diagram (WEB-37), "how it works" (WEB-38), a five-line code sample, and calls to action for the playground, the demo and installing. `[ran]` Done: the pitch, a static engine diagram and three-step "how it works" (each with hooks for their animations), Node.js, cURL and React code tabs, why self-hosted, the install commands from the latest release, and calls to action for the playground, the docs, installing and GitHub. A "Try the dashboard" button appears when `PUBLIC_DEMO_URL` is set, and the diagram and "how it works" are animated (WEB-37, WEB-38).
- [x] **WEB-07** `P1` Feature pages for each area (progression, economy, competition, community, integrations, administration), each with its own small live animation (WEB-40), a screenshot and a link to its guide. `[ran]` Done: an overview and one page per area from `src/lib/features.ts`, each with its capabilities, links to its guides, a static preview of the feature, a dashboard screenshot from the live demo (WEB-31), a live demo of the feature (WEB-40), a link to the next area, and its own social card.
- [x] **WEB-08** `P1` An honest comparison page against hosted APIs and other open-source engines, built from the table in this plan's assessment. Include where Gami.Fied is weaker. `[ran]` Done: a table against hosted APIs, loyalty engines, open-source libraries and building it yourself, plus a list of where Gami.Fied is weaker today.
- [x] **WEB-09** `P2` Pricing page: Community is free forever; Cloud and Enterprise show "coming soon" with a waitlist until Phase 10 ships. State plainly that the engine is never cut down in Community (see CLOUD-01). `[ran]` Done: three plans and a FAQ. The waitlist button appears once `PUBLIC_WAITLIST_URL` is set, and links to GitHub until then.
- [x] **WEB-10** `P2` Blog, plus a changelog page built from `CHANGELOG.md`, so each release is announced without copying text. `[ran]` Done: a Markdown or MDX blog with drafts, an RSS feed and a social card per post, the 1.1 release post, and a changelog page that reads `CHANGELOG.md` at build time.
- [~] **WEB-11** `P2` Legal pages: privacy policy, terms for the demo and the site, and a plain explanation of the AGPL server and MIT SDK licences. `[code]` Done: privacy, terms and licences pages in plain language. Left: the owner reviews them (they are not legal advice), and a contact address is set with `PUBLIC_CONTACT_EMAIL`.

### 9.3 Docs

- [x] **WEB-12** `P1` Serve the repository's `docs/` folder through Starlight at `/docs`, with a sidebar grouped by task (install, concepts, guides, reference, operations), "edit this page" links, and headings that can be linked to. `[ran]` Done: `src/integrations/repo-docs.mjs` copies `docs/` in at build time and on every change in development, taking each title from the first heading and the description from the first paragraph, pointing links between docs at their pages, turning GitHub callouts into asides, and linking "edit this page" to the source file. `CHANGELOG.md` gets the same link rewriting.
- [x] **WEB-13** `P1` Search across the docs with Starlight's built-in Pagefind, which is built at compile time and needs no search service. `[ran]` Done: every docs page and API endpoint page is indexed.
- [~] **WEB-14** `P1` API reference rendered from `docs/openapi.json` (for example Scalar, through its Starlight integration), with a "try it" panel that calls the demo instance with a demo key. `[ran]` Done: one searchable page per endpoint at `/docs/api/` (starlight-openapi), and a Scalar explorer at `/docs/api-explorer/` with a "try it" panel, served from the site itself with telemetry off. Left: set `PUBLIC_DEMO_API_URL` and `PUBLIC_DEMO_API_KEY` once the demo instance exists (WEB-25), and add the site to its `TRUSTED_ORIGINS`.
- [x] **WEB-15** `P1` Installation guides as their own section: Docker Compose (the release files), upgrading, reverse proxies, backups, and a one-page "production checklist". Link each to the matching GitHub release. `[ran]` Done: `docs/install/` has Docker Compose, upgrading (with going back), reverse proxy with Caddy and nginx, and a production checklist, next to the existing backups guide. The guides link to the latest release; WEB-18 pins them per version.
- [~] **WEB-16** `P2` One-click deploy guides for common self-hosting platforms (for example Coolify, Railway, Render, DigitalOcean), each tested on a real account before it is published. `[code]` Done: `render.yaml` (a Render Blueprint), `.do/deploy.template.yaml` (a DigitalOcean App Platform spec), `deploy/coolify/docker-compose.yml` (using Coolify's generated secrets and domain) and Railway steps, with a guide in `docs/install/one-click.md` that says plainly they are untested. The dashboard is the only public service on each, and it now accepts an API address without `http://`. Left: deploy each on a real account, fix what that finds, then remove the warning and publish a Railway template.
- [ ] **WEB-17** `P2` SDK and React component docs with live examples, generated where possible from the SDK's types. Note: the hand-written SDK and React guides are served. TypeDoc 0.28 fails with minimatch 11, which the workspace pins for a security fix, so a generated reference waits for a TypeDoc release that supports it. Live examples come with the playground (9.4).
- [x] **WEB-18** `P2` Versioned docs: the latest release by default, with older versions kept at `/docs/v1.0/...`, built from each release tag. `[ran]` Done: the docs sync step reads the newest stable tag of each earlier minor version from git (1.0 from `v1.0.0` now) and builds it at `/docs/v1.0/`, with its links kept inside that version, a banner pointing at the latest docs, no edit link, and no search entries. The sidebar lists them under "Older versions", and the website workflow fetches tags so CI builds them too.
- [x] **WEB-19** `P2` A link checker in CI for the built site, covering internal links and anchors. `[ran]` Done: `pnpm --filter @gami/website check:links` checks every internal link and anchor on every built page, and runs in the website workflow after the build.

### 9.4 In-browser playground

Runs the real rules engine in the browser. It needs no server, holds no data, and cannot be abused. It is one React island on `/playground`.

- [x] **WEB-20** `P1` Make `packages/rules` run in a browser. `validator.ts` uses `Buffer.byteLength` (use `TextEncoder` instead), and `plugins.ts` imports Node's `path` and `url` for `loadPlugins` (move the loader to a Node-only entry such as `@gami/rules/node`). Add a test that bundles the package for the browser. `[ran]` Done: `TextEncoder` in the validator, `loadPlugins` in `@gami/rules/node` (used by the API and worker), and `browser-bundle.test.ts` bundles the main entry with esbuild for the browser, checks it has no Node built-ins, and evaluates a rule from the bundle.
- [x] **WEB-21** `P1` Playground island: a rule editor (the dashboard's visual builder and a JSON view), an event composer with presets, and a results panel showing whether the rule matched, which actions ran, and the XP, badges and currency a user would get. It loads with `client:load`, because it is the whole page. `[ran]` Done at `/playground/`. The dashboard's condition and action builders, and the controls they use, moved to `packages/ui` (`@gami/ui` and `@gami/ui/rules`), so the dashboard and the playground share one builder. Rules are checked as a real save would check them, and the results show each rule, the totals its conditions looked at, and what it awarded.
- [x] **WEB-22** `P2` Simulate a user over time in the browser: streaks, levels and totals over past events, using `packages/progression` and the aggregate logic, with a timeline of what happened. `[ran]` Done: `src/lib/playground/simulate.ts` follows the worker's order (rules, then streaks, then rules on `streak_updated`), measures totals from the player's past events like the database does, and shows a timeline with what each event did. Boosts, limits, challenges and leagues are not simulated, and the page says so.
- [x] **WEB-23** `P2` Ready-made scenarios to load with one click, such as a learning app with daily streaks, a shop with a points store, or a fitness app with weekly leagues. `[ran]` Done: a learning app (daily streak, a seven-day bonus one lesson away), a shop (points, a monthly spend badge) and a fitness app (weekly streak with freezes, distance and variety badges). Leagues are not simulated, so the fitness app uses a weekly streak instead.
- [x] **WEB-24** `P2` Share a playground setup as a link, with the state kept in the URL, and export it as rule JSON ready to paste into a real install. `[ran]` Done: the setup and events are compressed into the link's hash, which is never sent to a server, and the rules export as the bodies for `POST /api/projects/:id/rules`, to copy or download.

### 9.5 Live demo without an account

A real dashboard to click around, created on demand and thrown away.

- [x] **WEB-25** `P1` "Try the dashboard" creates a temporary organization and project on the demo instance and signs the visitor in to it without an account. It expires after 24 hours, and the worker deletes it and everything in it. `[ran]` Done: the dashboard's `/demo` page calls `POST /api/demo/start`, which creates a visitor account (`@demo.invalid`, verified, unknown password), a demo organization with `demo_expires_at`, and signs the visitor in with the usual session cookie. The worker deletes expired demos and their visitors' accounts every ten minutes. Only on an instance with `GAMI_DEMO_MODE=true`. Guide: `docs/live-demo.md`.
- [x] **WEB-26** `P1` Seed every demo with a realistic dataset: users, events over the last month, rules, achievements, streaks, a store and a league. Add a "send traffic" button that generates events live, so boards and toasts move. `[ran]` Done: a language app with 36 generated players and a month of lessons, six rules, five badges, a daily streak, gems with a store, a weekly league and a challenge. Events are queued for the worker, so XP, levels, badges, wallets and league places come from the real engine; streaks are written directly with the real streak maths. The demo banner has a **Send traffic** button with a cooldown.
- [x] **WEB-27** `P1` Lock demos down with the admin controls from 1.1.0. Turn off webhooks, integrations, connectors, campaigns and push for demo organizations, and set policies of one project, one member and a low events-per-minute limit. Send no email at all from the demo instance. `[ran]` Done: each demo organization has webhooks, integrations, connectors, campaigns, push and plugins off, one project, one member, 120 events a minute and day-long API keys, and a demo instance sends no email at all (checked in `getSmtpProviderFromConfig`).
- [x] **WEB-28** `P1` Abuse protection for starting demos: a rate limit per address and a privacy-friendly challenge (for example Cloudflare Turnstile), a cap on live demos, and alerts when it is reached. `[ran]` Done: starts per address per hour (hashed in Redis, refused if Redis is down), a live cap, Cloudflare Turnstile when its keys are set, `gami_demo_*` metrics, and `GamiDemoNearlyFull` and `GamiDemoRefusingStarts` alerts.
- [~] **WEB-29** `P2` Run the demo instance apart from everything else: its own servers, database and Redis, no customer data, a daily reset of anything left over, and its version updated with each release. `[code]` Done: the settings in `docker-compose.yml` and `.env.production.example`, the cleanup pass catches leftovers, and the guide covers running it apart and upgrading it. Left: the servers, database and Redis for `demo.gami.fied.cc`, Turnstile keys, and `PUBLIC_DEMO_URL` on the website.
- [x] **WEB-30** `P3` "Keep this setup": export a demo's design (rules, achievements, store and so on) as a file that a self-hosted install can import, and later into a Cloud account. `[ran]` Done: promotion now works through a design document, so `GET /api/projects/:id/design` saves a project's design as a file and `POST .../design/preview` and `POST .../design` check and import one (rules, challenges and levels are validated like a save; missing badges are warned about). The demo banner has **Keep this setup**, and the **Promote changes** page has download and import. `design-files.test.ts` covers export, preview, import, validation, warnings and admin-only access, and `docs/permissions.md` lists the routes. Importing into a Cloud account comes with Phase 10.

### 9.6 Launch the site

- [x] **WEB-31** `P2` Record a two-minute product video and take screenshots for every feature page, with the demo instance as the source. `[ran]` Done: `pnpm --filter @gami/website capture` starts a demo, takes a dark-theme screenshot for each feature page, and records a captioned 2½-minute tour (MP4 with a poster when ffmpeg is there), driving an installed Chrome with `playwright-core`. Feature pages show their screenshot, and the home page shows the tour. These were made from a local demo instance; run it against `demo.gami.fied.cc` for each release.
- [~] **WEB-32** `P2` A status page for the site, the demo and later the cloud. `[code]` Done: an Upptime setup in `deploy/status` checking the site, docs, search, the demo page and the demo API (down when demos are off), with Cloud checks ready to turn on, and a footer link once `PUBLIC_STATUS_URL` is set. Left: create the `gami-fied/status` repository from the Upptime template, add its token, and point `status.gami.fied.cc` at it (steps in `deploy/status/README.md`).

### 9.7 Motion design

Animation should explain the product, not decorate it. The site's story is "events go in, rewards come out", so the big moments show exactly that, and everything else stays quiet and quick.

**Principles**

1. **One hero moment per page.** Each page gets at most one large animation. Everything else is small: reveals, hovers and state changes.
2. **Explain, don't decorate.** Every large animation shows how Gami.Fied works: an event moving through a rule, XP filling, a player moving up a league.
3. **Never delay reading.** Body text and headings are visible on first paint. Animations start after content is readable, and docs pages have no entrance animations at all.
4. **Only `transform` and `opacity`** for anything that moves, so it stays at 60 frames a second. Nothing animates layout properties, and nothing causes layout shift.
5. **Respect reduced motion everywhere.** With `prefers-reduced-motion`, every animation has a still or instant version, and looping animations are paused.
6. **Pay only for what is on screen.** Animation code loads with the component that uses it, heavy scenes load when they scroll near (`client:visible` or `inView`), and anything off screen or in a background tab pauses.

**Which tool does what**

| Tool | Used for | Why |
| :--- | :--- | :--- |
| CSS (including scroll-driven animations) | Hovers, focus states, the header on scroll, the reading progress bar, marquees | Costs no JavaScript. Where scroll-driven CSS is not supported, the effect is simply skipped |
| Astro View Transitions | Moving between pages, and a feature card growing into its feature page | Built in, smooth, and close to free |
| Motion, plain JavaScript (`animate`, `inView`, `scroll`) | Scroll reveals, number changes, tabs, small interactive touches | Very small, and enough for most of the site |
| Motion for React (`motion/react`) | Everything inside the playground and demo islands | They are React already, and it matches the dashboard |
| GSAP with ScrollTrigger, SplitText, Flip, MotionPath and DrawSVG | The hero engine diagram, "how it works", feature demos, headline reveals | Timelines and scroll-scrubbed scenes are where GSAP is unmatched. Every plugin is free |

**Shared timing** (`src/motion/tokens.ts`, used by CSS variables, GSAP and Motion alike):

| Token | Value | Used for |
| :--- | :--- | :--- |
| `instant` | 120 ms | Hovers, presses, toggles |
| `quick` | 200 ms | Page transitions, menus, tooltips |
| `enter` | 450 ms | Scroll reveals |
| `scene` | 700 ms | Headline reveals, scene steps |
| `stagger` | 60 ms | Between items in a group |
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` (expo out) | Things arriving |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Things moving from place to place |
| `spring` | stiffness 260, damping 24 | Interactive things that follow the pointer or a value |
| `rise` | 16 px | How far a revealed item travels |

**Items**

- [x] **WEB-33** `P1` Motion foundation in `src/motion/`: the tokens above; `lifecycle.ts`, which starts each page's animations on `astro:page-load` and kills GSAP timelines, ScrollTriggers and Motion animations on `astro:before-swap`, so nothing runs twice or leaks after a page transition; GSAP and its plugins registered once and loaded only on pages that use them; and a single reduced-motion switch (GSAP `matchMedia` plus Motion's reduced-motion setting). `[ran]` Done in `apps/website/src/motion`: `tokens.ts` (also CSS variables), `lifecycle.ts` (scenes start on `astro:page-load`, are cleaned up on `astro:before-swap`, and restart when reduced motion changes), `gsap.ts` (plugins registered once and loaded only by the scenes that use them), and one reduced-motion switch.
- [x] **WEB-34** `P1` Site-wide motion: `[ran]` Done: a 200 ms cross-fade between marketing pages (docs load normally), the feature card morphing into its page, a header that firms up on scroll with CSS only, one reveal style for the site (hidden only while its script runs, never on page-top headings), and 120 ms buttons.
  - **Page transitions:** a 200 ms cross-fade between marketing pages with View Transitions. Docs pages swap instantly, with no fade, because readers jump around.
  - **Feature card to feature page:** the card's icon and title morph into the page header (`transition:name`), so moving between pages feels like zooming in.
  - **Header:** after 80 px of scrolling it shrinks a little and gains a blurred background, with a CSS scroll-driven animation (static where unsupported).
  - **Scroll reveal:** sections and cards fade in while rising 16 px, over 450 ms, with a 60 ms stagger in groups, once only, with Motion's `inView`. This is the only reveal style on the site, used everywhere for consistency.
  - **Buttons and links:** primary buttons lift 1 px and brighten on hover, and press down to 98% on click, over 120 ms in CSS. No magnetic or wobbly buttons; they feel slow and cheap.
- [x] **WEB-35** `P1` Performance budget for animation, checked in CI: no more than 60 KB compressed of animation code on the home page and 0 KB on docs pages; Lighthouse performance of at least 95 on mobile for the home page; no layout shift caused by animation; and the largest content visible within 2 seconds on a mid-range phone. `[ran]` Done: `check:motion` follows every script a page can load and allows 60 KB of animation code on the home page (54 KB now, with Motion's mini build, no MotionPath or SplitText, and DrawSVG loaded on hover) and 0 KB on docs; `check:lighthouse` needs performance 95+, the largest content within 2 s and layout shift under 0.01 on a simulated mid-range phone (100, 0.91 s and 0 now). Both run in the website workflow.
- [x] **WEB-36** `P1` Hero headline: the headline is in the page from the first paint and readable straight away. Once fonts load, SplitText lifts each word from behind a mask, 40 ms apart, over 700 ms with expo out. The subheading and buttons fade in 150 ms later. With reduced motion, everything simply appears. `[ran]` Done: the headline is readable on first paint; when the fonts arrive within 0.7 s, its words lift from masks 40 ms apart and the text under it fades in, with the full text kept as its accessible name.
- [x] **WEB-37** `P1` Hero "live engine" diagram, the home page's one big moment, built in SVG with a looping GSAP timeline: `[ran]` Done: events follow the curved paths into the engine, a rule lights up, and the XP bar fills, the badge pops in and the player climbs, on a 6-second loop that pauses off screen, in a background tab and with its pause button.
  - Small event dots (`lesson_completed`, `order_paid`) leave an app icon on the left and travel along curved paths (MotionPath) into the Gami.Fied engine in the middle.
  - The engine pulses as each one passes through a rule.
  - On the right, rewards come out: an XP bar fills, a badge pops in with a spring, and a leaderboard row slides up a place (Flip).
  - It loops every 6 seconds with varied events, pauses when off screen or in a background tab, and has a pause button, since it runs longer than 5 seconds (WCAG 2.2.2).
  - With reduced motion it is a still diagram with labels.
- [x] **WEB-38** `P1` "How it works" as a scroll story, with GSAP ScrollTrigger: `[ran]` Done: on wide screens with motion the section pins and the scroll scrubs through the steps, with the key code line highlighted and a phone showing each result; stacked with the standard reveal otherwise.
  - On wide screens the section pins while you scroll through three steps: **Send an event**, **A rule matches**, **The player is rewarded**.
  - On the left, a code sample highlights the line for each step.
  - On the right, a phone mock-up shows the result as it happens: the event arriving, the rule card lighting up, then a reward toast and the XP bar filling.
  - The scroll scrubs the timeline, so readers control the pace.
  - On phones and with reduced motion there is no pinning: the steps stack, each with the standard reveal.
- [~] **WEB-39** `P2` Smaller home page touches: `[ran]` Done: the staggered feature grid with a 3-degree tilt and an icon that draws itself on hover (pointer devices only), sliding code-tab underline and cross-fade, the tour tilting flat as it scrolls in, a numbers strip counted from the source at build time, and the pointer glow on the final call to action. Left: the logo or quote marquee, once there are real logos or quotes to show.
  - **Feature grid:** the standard staggered reveal. On hover (pointer devices only), a card tilts up to 3 degrees towards the cursor on a spring, and its icon plays a one-second line animation (DrawSVG).
  - **Code tabs** (SDK, cURL, React): the underline slides between tabs, and the code cross-fades over 200 ms (Motion).
  - **Dashboard screenshot:** tilted back 12 degrees, it flattens to face the reader as it scrolls into view (GSAP scrub). The screenshot is still with reduced motion.
  - **Numbers strip** ("events a second", "features"): each number counts up once when it comes into view, over 1.2 seconds (Motion).
  - **Logos or quotes:** a slow CSS marquee that pauses on hover, and stops with reduced motion.
  - **Final call to action:** a soft glow follows the pointer, using CSS variables set on pointer move, with no library.
- [x] **WEB-40** `P2` One small live demo per feature page, each a GSAP timeline that plays when in view and pauses when not: `[ran]` Done for all six areas: a week filling with a freeze (progression), coins in and a purchase out (economy), you overtaking Maya (competition), the feed taking new activity (community), pulses through the engine (integrations), and a switch turning off what depends on it (administration). Each plays only on screen.
  - **Streaks:** a week of calendar days fills in one by one, and the flame grows with the count; a missed day is saved by a freeze, which glows blue.
  - **Leaderboards and leagues:** rows reorder smoothly as scores change (Flip), and the top player moves up into the next tier.
  - **Store and wallets:** a coin drops into a wallet, the balance ticks up, then a reward is bought and the balance ticks down.
  - **Achievements:** a locked badge fills with progress, then unlocks with a spring and a short burst of particles.
  - **Connectors:** Segment, Stripe and GitHub logos connect to the engine with lines that draw themselves (DrawSVG), then send a pulse along each line.
  - **Administration:** a feature switch is turned off, and the features that depend on it switch off in sequence, as in the real admin screen.
- [x] **WEB-41** `P2` Playground motion, with Motion for React inside the island: `[ran]` Done with Motion for React: the results panel animates its height, rules and rewards appear 60 ms apart, the XP bar fills on a spring, a badge unlock shows a toast, the open rule flashes when it matches or not, and new timeline entries slide in. `MotionConfig` makes all of it instant with reduced motion.
  - **Results:** the results panel animates its height changes with layout animation; matched actions appear one by one, 60 ms apart; the XP bar fills on a spring; a badge unlock uses the same toast as the product.
  - **Rule editor:** the rule being tested shows a short highlight when it matches or does not.
  - **Simulation:** each new day on the timeline slides in, and streak and level changes are marked as they happen.
  - With reduced motion, results appear at once.
- [x] **WEB-42** `P2` Live demo start: while the demo is being set up, a checklist ("Creating your project", "Adding players", "Sending events") ticks off step by step with Motion, and finishes by turning into an "Open the dashboard" button. If setup takes longer than expected, a calm message appears instead of a spinner running forever. `[ran]` Done on the `/demo` page: the checklist ticks off with Motion, finishes as "Open the dashboard", and shows a calm note if setup takes longer than 12 seconds. Reduced motion skips the springs.
- [~] **WEB-43** `P2` Quiet pages: `[ran]` Done: docs keep Starlight's own quiet touches with no entrance animations, the recommended plan has a slow gradient border, blog posts have a CSS reading progress bar, and post images fade in as they load. The 404 page has a small character searching with a magnifying glass and shrugging: inline SVG and CSS only, about 2 KB, playing once in under 5 seconds, and still with reduced motion. Left: the price morph, once Cloud has prices to switch between.
  - **Docs:** no entrance animations; Starlight's own search dialog fade, copy buttons that turn into a tick, and a theme switch.
  - **Pricing:** switching monthly to yearly morphs the prices (Motion number animation), and the recommended plan has a slow gradient border.
  - **Blog:** a reading progress bar along the top (CSS scroll-driven), and images that fade in as they load.
  - **404:** a small animated character "looking for" the page, as a Lottie or Rive file under 30 KB, shown still with reduced motion. Optional.
- [~] **WEB-44** `P2` Motion quality checks before launch: every animated page tested in Chrome, Safari and Firefox, on a mid-range Android phone and an iPhone, with reduced motion on and off, and with keyboard-only navigation. Keep short screen recordings of each scene in the pull request, so changes to them can be reviewed. `[ran]` Done: `check:motion-browsers` runs every animated page in Chrome, Firefox and WebKit, at desktop and phone sizes (an emulated Pixel and iPhone), with reduced motion on and off, checking for errors, hidden content, layout shift, the pause control and the scroll story; all 12 combinations pass, and it runs in CI. Keyboard-only use passes, and `record:scenes` records each scene for pull requests. Left: a real Safari, a mid-range Android phone and an iPhone.

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

## Second audit: what was and was not checked

Done on 13 November 2026 at commit `e178fe8`.

| Area | How it was checked |
| :--- | :--- |
| API routes added since the first audit (player tokens, store, social, referrals, connectors, demo, realtime, backups, import and export) | Read in full `[code]`. Nothing was run against a database |
| Authentication, authorization, rate limits, SSRF guard, dashboard proxy | Read in full `[code]` |
| Worker | Not read again. Phase 2 covered it, and only the integration dispatcher was looked at |
| Dependencies | `pnpm audit --prod` reports no known vulnerabilities `[ran]` |
| Website | Opened from the built site at 1280 px and 375 px: home, pricing, compare, playground, a feature page, docs and the 404 page `[ran]`. This was an emulated browser pane, not a real phone |
| Dashboard | Only the sign-in page was opened `[ran]`, because the API was not running. Everything else comes from the code, so DASH-10 asks for a full walk-through |

Reproduce every `[code]` item with a failing test before fixing it, as in the first audit.

---

## Phase 11: Fixes, security and correctness (second audit)

**Goal:** The features added since 1.0 are as safe as the core. **Exit:** every `P0` and `P1` here has a regression test.

### 11.1 Backups, export, import and erasure

- [x] **FIX-01** `P0` Restoring a platform backup destroys most data added since 1.0. [backup-service.ts](apps/api/src/admin/backups/backup-service.ts) saves 22 of the 67 tables. Restore then deletes users, projects and end users, and the database cascades that delete into every table the backup never held: XP balances, streaks, wallets, the store and redemptions, leagues, segments, friends, kudos, referrals, connectors, campaigns, push devices, boosts and limits, rule versions, project members, feature switches and organization policies. Notifications are deleted too, and are not in the backup. After a restore every player's XP total reads 0. Build the table list from the schema, keep an explicit list of tables left out on purpose (sessions, outboxes), and rebuild or save balances. `pg_dump` (TRUTH-19) would solve this in one step. `[code]` Done: a backup now holds every table except seven listed with their reasons in `BACKUP_EXCLUDED_TABLES`, built from the schema (`schemaTables` in `@gami/database`). A restore runs in one transaction, changes nothing if it fails, and refuses a backup that is missing tables unless `--partial` is passed. The audit log is added to, never replaced. `data-safety.test.ts` puts a row in every table, deletes the organization, restores, and finds every row again. Backups made by 1.2.0 and earlier are still incomplete, so make a new one after upgrading. Still open: the backup is built in memory in the API process (TRUTH-19).
- [x] **FIX-02** `P1` Organization export has the same gap. [data.ts](apps/api/src/organizations/data.ts) reads 14 tables, so streaks, wallets, the store, leagues, segments, referrals, campaigns, boosts and achievement criteria never leave. This is the path CLOUD-23 depends on for moving between self-hosted and Cloud. `[code]` Done: export format version 2 holds 43 tables under `tables`, with every table either on `ORG_EXPORT_TABLES` or on `ORG_EXPORT_EXCLUDED` with its reason. Secrets, staff accounts, queues, device tokens and server settings stay out. Tested by exporting an organization with a row in every table.
- [x] **FIX-03** `P1` Organization import renames what it should keep. Each player's `externalId` becomes `<id>_imp_<n>`, so the customer's own ID no longer finds anyone. Achievement and challenge keys get the same suffix, while rule actions still name the old keys, so imported rules award badges that do not exist. Keep IDs and keys as they are inside the new project, which cannot clash because the project is new. `[code]` Done: imports give each row a new internal ID and rewrite every reference from the schema, and keep external IDs and all keys. A project keeps its name and slug unless the organization already has that slug. Version 1 files are still read. Tested by a round trip into another organization with nothing skipped.
- [x] **FIX-04** `P1` Organization import skips the organization's limits and all validation. It creates any number of projects without the `maxProjects` check, and inserts rules without the checks a normal save runs. On a demo instance a visitor owns their demo organization, so they can post a 100 MB import and get past the one-project lock (WEB-27). Apply the policy checks, validate rules like a save, and turn import off for demo organizations. `[code]` Done: an import counts against the project limit (`403 PROJECT_LIMIT`), is refused for demo organizations, and leaves out rules, challenges, levels and segments that a save would refuse, listing each under `warnings`. It also only follows a reference to a row in the same file, so a file cannot attach rows to another organization's players or projects. The dashboard dialog shows the errors and warnings.
- [x] **FIX-05** `P2` Prove that erasing a player removes everything. The erase route relies on cascades plus two manual deletes. Add a test that creates a player with data in every feature, erases them, and then searches every table for their ID, external ID and email. Kudos messages, audit log metadata and integration deliveries are the ones to watch. `[check]` Checked, and no fix was needed: `data-safety.test.ts` erases a player who has a row in every table, then searches every table, JSON columns included, for their ID, external ID, email and name. Only the audit log's record of the erasure, under the internal ID, remains. `[ran]`

### 11.2 Player tokens and the player API

- [x] **FIX-06** `P1` Browsers cannot call the player routes that change anything. CORS for `/v1/me` at [index.ts:147](apps/api/src/index.ts:147) allows only `GET` and `OPTIONS`, but redeeming a reward, adding a friend, giving kudos, claiming an invite and registering a device are `POST` or `DELETE`. The preflight fails from a customer's site, so the SDK's `me.redeem()` and the React store only work on the same origin. Allow the methods the routes use. `[code]` Done: `GET`, `POST` and `DELETE` are allowed, with a test that sends the preflight a browser would.
- [x] **FIX-07** `P2` Player tokens are documented as read-only and are not. DX-10, the code comment in [end-user.ts](apps/api/src/public/end-user.ts) and the docs say a token only reads one player's data, yet it can spend points, add friends and send kudos. Add a `write` claim that the customer's server asks for when it creates the token, default new tokens to read-only, and correct the docs. `[code]` Done: tokens carry an access claim, `read` by default. Every `/v1/me` request that is not a `GET` needs `access: "write"` and otherwise gets `403 TOKEN_READ_ONLY`. This is a breaking change for apps that used tokens to buy, befriend or register devices, and the changelog says so. The SDK, OpenAPI document and docs are updated.
- [x] **FIX-08** `P2` A player can fetch another player's purchase. [redeem.ts](apps/api/src/store/redeem.ts) looks up an idempotency key by project only, so sending someone else's key returns their redemption, coupon code included. Match on the player as well. `[code]` Done: a key used by another player answers `409 IDEMPOTENCY_KEY_IN_USE` and shows nothing. The key is still unique per project, not per player.
- [x] **FIX-09** `P2` Friendship needs no consent. A player's invite code is meant to be shared in public, and anyone who has it becomes a mutual friend at once, then sees that player's feed, including the kudos messages other people wrote to them. Add a request that the other player accepts, or a separate private friend code. `[code]` Done: `POST /v1/me/friends` now sends a request (new `friend_requests` table, migration 0041). The other player lists requests, accepts or declines by the sender's code, and two players who ask each other become friends at once. At most 100 requests can wait per player, sent or received. Linking players from a server with an API key is unchanged. Not done: the React package has no friends component yet, and the dashboard does not show pending requests.
- [x] **FIX-10** `P2` Player tokens outlive the player and leak into logs. A deactivated player's token keeps working until it expires (up to an hour), because `authenticateEndUser` never checks `active`. `/v1/me/stream` also takes the token as `?access_token=`, which the request logger writes to the log with the address. Check `active` on each request, and redact that parameter in logs. `[code]` Done: every player request checks that the player exists and is active (`403 USER_DEACTIVATED`, or 404 once erased), which costs one more query per request. Tokens in `?access_token=` and `?token=` are replaced in the request log and the error log.
- [x] **FIX-11** `P2` Share links point at the wrong host. `/v1/me/achievements/:key/share` builds the link from the request's `Host` header, which is the internal API address behind the dashboard proxy, and is whatever the caller sends otherwise. Build it from the configured public address. `[code]` Done: links are built from `BETTER_AUTH_URL` and served at `/v1/share/`, which reverse proxies already send to the API. `/share/` still works for old links.
- [x] **FIX-12** `P3` `GET /v1/me/friends` loads every invite code in the project to label a handful of friends. Join the codes for those friends only. `[code]` Done: only the friends' own codes are read.

### 11.3 Access, abuse and deployment

- [x] **FIX-13** `P1` The connector endpoint skips the checks every other way in has. `POST /v1/connectors/:id` in [connectors/index.ts](apps/api/src/connectors/index.ts) does not check that the organization is active, that connectors are still switched on for it, or either event rate limit, so a suspended or over-limit organization keeps taking in events through Segment, Stripe or GitHub. Run the same gate as `/v1/events`. `[code]` Done: the endpoint refuses a suspended organization and one with connectors switched off, and counts each request against the organization's and the instance's event limits, as `/v1/events` does. A batch counts as one request.
- [x] **FIX-14** `P2` Each `/v1` call is counted and authenticated twice. The gateway re-sends the request inside the server, so the per-address limit is used up at double speed and the API key is looked up twice. Skip the limiter and reuse the key lookup on the inner request. `[code]` Done: the gateway marks its inner call with a secret made at start-up, so the limiter skips it and the project route reuses the key that was already checked. A forged marker is ignored.
- [x] **FIX-15** `P2` Anyone can lock anyone out. Failed sign-ins are counted per email address alone in [policy.ts](apps/api/src/auth/policy.ts), so a stranger who sends wrong passwords locks the real owner out for the lockout time. The count also stops working while Redis is down. Count per email and address together, slow attempts down instead of refusing them, and let a password reset clear the lock. `[code]` Done: failures are counted for an email and an address together, so only the guessing address is locked. The account as a whole locks after ten times the limit, or 50, from all addresses. Not done: slowing attempts down instead of refusing, and clearing the lock on a password reset, which the per-address count makes less needed. Without Redis there is still no lockout, and a warning is logged.
- [x] **FIX-16** `P2` The bootstrap secret is compared with `!==` and can be guessed without a limit other than the general one per address. Compare in constant time and allow a few attempts per hour. `[code]` Done: constant-time comparison, and five attempts an hour per address and per account.
- [x] **FIX-17** `P2` Connector changes leave no trace. Creating, editing, rotating and deleting a connector write no audit log, unlike API keys and webhooks. `[code]` Done: `connector.created`, `connector.updated`, `connector.secret_rotated` and `connector.deleted`.
- [x] **FIX-18** `P2` The production compose file publishes the API and dashboard on every network interface (`3001` and `3000`). With a reverse proxy on the same host, people can reach the API around it, and with `TRUST_PROXY=true` they can then forge `X-Forwarded-For`, which defeats the per-address limits and the API key address allowlist. Bind both to `127.0.0.1` by default. `[code]` Done: both ports are published on `BIND_ADDRESS`, which defaults to `127.0.0.1`. This changes behaviour for anyone who opens the dashboard at the server's address without a proxy, and the changelog and install guides say to set `BIND_ADDRESS=0.0.0.0` for that. Not run: the compose file was not started here, so the CI smoke test is the check.
- [x] **FIX-19** `P3` Rate-limit counters are set in two steps (`INCR`, then `EXPIRE`). If the second fails, the key never expires. For `demo:starts:<address>`, which has no time bucket in its name, that address is blocked for good. Set the expiry in the same command. `[code]` Done: one `countWithExpiry` helper sets the expiry and the count in one Redis transaction, used by every limiter and the demo start limit.
- [x] **FIX-20** `P3` Opening an unsubscribe link unsubscribes. Mail scanners that preload links will unsubscribe people who never clicked. Make `GET` show a page with a confirm button, and keep `POST` for one-click clients. `[code]` Done: `GET` shows a page with an Unsubscribe button and changes nothing, and `POST` unsubscribes. Found on the way: mail clients' one-click request is a form post, which the API refused with `415`, so one-click unsubscribe had never worked. It does now.

---

## Phase 12: Suggestions, hardening, speed and quality

**Goal:** Make what exists harder to break and cheaper to run. None of these is a bug today. **Exit:** each item is done or dropped with a reason.

### 12.1 Hardening

- [x] **SUG-01** `P2` Let `TRUST_PROXY` take a number of proxies or a list of proxy addresses, not only `true`. Today `true` trusts every hop, so safety depends on the proxy overwriting headers. Done: `TRUST_PROXY` takes `true`, `false`, a number of proxies, or a list of addresses and ranges. Anything else trusts nobody and logs a warning. Tested with forged headers.
- [x] **SUG-02** `P2` Tighten the supply chain and containers: pin GitHub Actions to commit hashes, stop the compose file defaulting to the `latest` image tag, and run containers with a read-only file system, no added capabilities and `no-new-privileges`. Done: every action in the three workflows is pinned to a commit. The API, worker, dashboard and migration containers run read-only with no capabilities and `no-new-privileges`, checked by starting the stack from locally built images and running the smoke test against it. The release's `env.example` now names the release, because its `GAMI_VERSION=latest` had been overriding the pinned compose file. Not done: the compose file in the repository still defaults to `latest`, since release files are pinned by the workflow, and images are not pinned by digest.
- [x] **SUG-03** `P2` Add limits per API key and per player token for reads. Only event ingestion has a per-project limit; everything else has only the limit per address. Done: 600 requests a minute per API key outside event ingestion, and 300 per player across their tokens, both settable (`RATE_LIMIT_KEY_MAX`, `RATE_LIMIT_PLAYER_MAX`, or saved settings). Not done: the admin settings page has no fields for the two new limits yet.
- [x] **SUG-04** `P2` Let a customer cancel player tokens early: a per-player token version that their server can bump on sign-out, checked with the `active` flag from FIX-10. Done: each player has a token version (migration 0042). `POST /v1/users/:userId/tokens/revoke` and `gami.endUserTokens.revoke(userId)` raise it, which ends every earlier token at once.
- [x] **SUG-05** `P3` Re-check access on open staff streams. A dashboard stream stays open after the session is revoked or the member is removed from the project. Done: an open staff stream checks its session and project access every minute and closes when either is gone. Not tested, because the check runs on a one-minute timer.
- [x] **SUG-06** `P1` A test that fails when a new table is missing from the backup, the organization export or the erase path, and is not on an explicit "left out on purpose" list. This is what stops FIX-01, FIX-02 and FIX-05 from coming back with the next feature. Done with FIX-01 to FIX-05: `data-safety.test.ts` and its `seedEveryTable` helper cover every table in the schema, and a new table fails the export test until it is put on one of the two lists.

### 12.2 Speed

- [~] **SUG-07** `P2` Player streams poll the database. Each open stream runs two queries every 15 seconds and on every nudge, which is about 670 queries a second with the 5,000 streams one process allows and nobody doing anything. Carry the notification in the Redis message, and keep the poll only as a slow fallback. Catch-up polling went from every 15 seconds to every two minutes, and a quiet catch-up reads only notifications, so 5,000 idle streams cost about 40 queries a second instead of about 670. Left: carrying the notification in the Redis message, which would remove the query after each nudge too.
- [x] **SUG-08** `P3` `resolveUserId` runs a database query before authentication on every `/users/:userId` route, so unauthenticated requests cost a query. Run it after the access check. Done differently: the lookup runs before the route, where the access check lives, so it cannot simply move after it. It is now skipped for requests that carry no credentials at all. A request with a made-up key still costs the lookup, as it costs the key check.
- [x] **SUG-09** `P3` `/v1/me/wallets` and `/v1/me/rewards` read one balance per currency in a loop. Read them in one query. Done: one grouped query.
- [x] **SUG-10** `P3` A connector batch is ingested one event at a time, each in its own transaction. Use the batch path that `POST /v1/events/batch` has. Done: `ingestEvents` writes a batch in one transaction and falls back to one event at a time if anything in it fails. `POST /v1/events/batch` uses it too.

### 12.3 Quality

- [x] **SUG-11** `P2` A contract test for the player API: every `/v1/me` route's method is allowed by CORS, appears in the OpenAPI document and has an SDK method. It would have caught FIX-06. Done: `player-api-contract.test.ts` reads the player routes from the server and checks each one for CORS, the OpenAPI document and an SDK call. It found seven undocumented routes, which are now documented.
- [x] **SUG-12** `P2` Write a short threat model for player tokens and the social features (what a token holder can do to themselves, to others and to the project), and review the routes against it before FEAT-02 is published to npm. Done: `docs/player-token-security.md`, with every `/v1/me` route checked against it. It records one thing to know: a player who guesses a segment's key can see that segment's leaderboard.

---

## Phase 13: Additions, new features

**Goal:** Ideas that are not in Phases 7 or 10. This is a backlog: pick by DEC-4, not in order.

### 13.1 Mechanics

- [x] **ADD-01** `P2` Random rewards: mystery boxes and spin-to-win with weighted odds, a published drop table, and a guaranteed reward after a set number of tries. Done on 15 November 2026: boxes and wheels with weighted items, a drop table that players can read (`GET /v1/me/boxes`), an optional cost, a daily limit, and a guarantee of a rare item after a set number of tries without one. A try is one transaction, and a player's tries at one box take turns, so the limit and the guarantee hold under load. The dashboard shows what each item really gave next to its published chance. `[ran]` Not done: a draw that a player can verify afterwards. The docs and the dashboard warn that paid boxes can count as gambling.
- [x] **ADD-02** `P2` Season pass: a track of tiered rewards that players climb during a season, with free and premium lanes. It builds on league seasons, wallets and the store. Done on 15 November 2026: a pass runs between two dates, tiers unlock by XP earned in that window, and each tier has a free and a premium reward. The premium lane is bought with a currency or given by your server. Rewards are claimed one at a time or all at once, each once, for a week after the end. `[ran]` It builds on wallets and XP. It does not use league seasons, and a pass does not renew itself: make a new one per season.
- [x] **ADD-03** `P2` Teams and shared goals: players in a team working towards one target, and community goals where everyone contributes ("one million lessons this month"). Done on 15 November 2026: teams with a size limit that players join or your server assigns, a team board by XP, and shared goals for everyone or per team that count events (or add up a field of them) once each, stop at the target, and pay every contributor once. `[ran]` A player who changes team in the middle of a team goal is paid with their first team.
- [x] **ADD-04** `P3` Cosmetics: titles, avatar frames and profile items that are unlocked by achievements or bought in the store, and shown by the React components. Done on 15 November 2026: titles, avatar frames and profile items, owned through an achievement, a purchase, a prize or a gift, with one title and one frame worn at a time. `/v1/me` and leaderboard rows carry what a player wears, `LevelProgress` and `Leaderboard` show the title, and `CosmeticLocker` lets a player buy and wear them. `[ran]` Cosmetics are bought directly with a currency, not through the reward store.
- [x] **ADD-05** `P2` Leaderboard prizes: pay the top places of a daily, weekly or monthly board in XP, currency or a badge when the period closes. Leagues promote and relegate, but confirm that plain boards pay nothing. `[check]` Done on 15 November 2026. Checked first: plain boards paid nothing when a period closed, and a test now records that. A prize covers a range of places on the daily, weekly or monthly board and is paid by the worker within about ten minutes of the period ending, once per place and period, with a webhook and a notification. A prize does not reach back into periods that ended before it was made. `[ran]` Prizes reach down to place 100, and cover the whole-project board, not segment boards.
- [x] **ADD-06** `P3` Journeys: a chain of challenges where finishing one unlocks the next, for onboarding flows and story-style quests. Done on 15 November 2026: a journey is an ordered list of challenges that run once. A step does not count events until the steps before it are finished, finishing the last one pays the journey's prizes once, and `/v1/me/challenges` marks locked steps. `[ran]` An event that arrives while its step is locked is not saved up.

All six pay out in one shared prize format (XP, a currency, a badge or a cosmetic, named by key), are behind their own feature switches, and have dashboard pages, `/v1` and `/v1/me` routes, SDK calls, React components, API docs and tests (`mechanics.test.ts`, 18 tests). See [the guide](docs/boxes-passes-teams-and-journeys.md). Left for later, and listed there: Promote changes does not copy these six yet (export and import does), and the React components for them are tested by rendering on the server, not in a browser.

### 13.2 Reaching players

- [ ] **ADD-07** `P1` Web components or an embeddable widget for apps that do not use React (Vue, Svelte, plain HTML), from the same styles as `@gami.fied/react`.
- [ ] **ADD-08** `P2` Mobile SDKs: React Native and Flutter first, then Swift and Kotlin. DX-14 only plans server languages.
- [ ] **ADD-09** `P2` A real notification inbox: read and unread state, mark as read, and an unread count. `/v1/me/notifications` returns the last 50 with no state. `[code]`
- [ ] **ADD-10** `P2` Translations for player-facing text: achievement, challenge and reward names, and notification and email templates, per locale with a fallback.
- [ ] **ADD-11** `P3` Web push for browsers, next to the Apple and Google push that exists.

### 13.3 Operators and developers

- [ ] **ADD-12** `P2` Shadow mode for rules: a rule records what it would have awarded on live events without awarding it, so a change can be watched for a day before it is switched on. The backtest (FEAT-16) only covers the past.
- [ ] **ADD-13** `P2` A migration importer: upload players, XP totals, badges and past events from a CSV or from another product, with a dry run. Today the only way in is to replay events.
- [ ] **ADD-14** `P2` Export one player's data as a file, for access requests. Erasure exists (TRUTH-21); the matching export does not. `[check]`
- [ ] **ADD-15** `P2` Merge players: join an anonymous ID to a signed-in one, or two accounts into one, moving XP, badges, wallets and streaks. Segment and RudderStack send anonymous IDs first, so this follows from the connectors.
- [ ] **ADD-16** `P3` More roles: a read-only viewer and an editor who cannot touch keys or webhooks, set per project. Today there are owner, admin and member.
- [ ] **ADD-17** `P3` A usage page per API key: calls, errors and last use by day, with an optional limit per key (SUG-03).
- [ ] **ADD-18** `P3` `gami listen`: a CLI command that forwards webhooks to a local port, plus a page listing every webhook event with a sample body and a "send a sample" button. It fits into the CLI planned in DX-15.
- [ ] **ADD-19** `P3` Apps for Zapier, n8n and Make, so non-developers can send events and react to rewards.

---

## Phase 14: Dashboard interface (second pass)

**Goal:** The pages added since Phase 5 meet the same standard as the ones it fixed. **Exit:** DASH-10 is done, and every screen it covers passes in both themes and at phone width. All items are from the code unless marked `[ran]`.

### 14.1 Fixes

- [x] **DASH-01** `P1` The sidebar has grown back. UX-43 cut it to 18 items; [navigation.ts](apps/dashboard/src/lib/navigation.ts) now lists 30, and Build alone has 10 (Rules, Achievements, Streaks, Boosts & limits, Store, Levels, Leagues, Invites, Challenges, Campaigns). Regroup by what people are doing, for example Progression (Rules, Levels, Achievements, Challenges, Streaks), Economy (Store, Boosts & limits), Social (Leaderboard, Leagues, Segments, Invites) and Messaging (Campaigns), make groups collapsible and remember which are open. `[code]` Done: the groups are Progression, Economy, Players, Activity, Connect and Manage. Each folds, the choice is remembered, and the group holding the current page always stays open. Connect and Manage start folded, so the menu fits at 800 px tall. `[ran]`
- [x] **DASH-02** `P2` Every browser tab says "Gami.Fied Dashboard". Only 6 pages set a title. Give each page one, such as "Rules · Project name · Gami.Fied", so tabs and history can be told apart. `[code]` Done: the shell sets one title from the navigation list, such as "Store · Lingo Leap · Gami.Fied", and admin pages get "Backups · Platform admin · Gami.Fied". The six hand-written titles are removed. `[ran]` Titles are kept through in-app navigation, where the framework would otherwise put its default back.
- [x] **DASH-03** `P2` Two fields with the same label share an ID. `Input` in [input.tsx](packages/ui/src/input.tsx) builds its `id` from the label text, so a "Name" field in a dialog over a page with another "Name" field breaks label clicks and screen readers. Use `useId`, and link error and helper text with `aria-describedby` and `aria-invalid`. `[code]` Done: `Input` and `Textarea` use `useId`, link their error or help text with `aria-describedby`, set `aria-invalid`, and a field with no visible label takes its placeholder as its name, which covers the search and user ID fields the walk-through found.
- [x] **DASH-04** `P2` The collapsed sidebar has no way to log out, and its labels are `title` tooltips. There are 119 `title`-only tooltips across the dashboard, which keyboard and touch users never see. Add one `Tooltip` component, and keep log out reachable when collapsed. `[code]` A `Tooltip` component shows on hover and keyboard focus and is placed against the window, so a scrolling container cannot cut it off. The sidebar uses it, and Log out stays in the collapsed rail. Left: the other `title`-only tooltips across the views. Finished: one listener now turns every `title` on the page into a tooltip that also shows on keyboard focus, and gives an icon-only control its name, so the 119 existing ones are covered without editing each. `[ran]`
- [x] **DASH-05** `P2` The sign-in page repeats itself and stays silent when the API is down. "Sign in to Gami.Fied" sits above a card titled "Dashboard Sign In" that says the same thing, and with the API unreachable the page shows nothing until the form is sent (a 503 in the console). Keep one heading, and show the "cannot reach the server" notice on the sign-in, sign-up and reset pages. `[ran]` Done: one heading, a plain "Sign in" button, and a notice with a retry on the sign-in, sign-up, forgot-password and reset-password pages when the server cannot be reached. `[ran]`
- [x] **DASH-06** `P2` Text is too small in many places: 104 uses of 10 or 11 px text, and sidebar links at 12 px. Set 12 px as the smallest size for anything people read, 13 to 14 px for navigation, and add the sizes to the tokens so they stop being typed by hand. `[code]` Done: 107 uses of 9, 10 and 11 px text are now 12 px, and sidebar links are 13 px. The walk-through finds no text under 12 px. Not done: named size tokens.
- [~] **DASH-07** `P2` Tables are built five different ways. Paging is written out in 5 views, no column has `aria-sort`, and only Users keeps its state in the address (UX-51). Build one `DataTable` with sorting, paging, filters, address state and loading, empty and error rows, and move the 22 tables onto it. `[code]` `TablePagination` now takes a page count and a total, and Audit Logs and Team use it instead of their own, so every list pages the same way. Left: one `DataTable` with sorting, filters and address state, and `aria-sort`. Added since: column headers that sort, with `aria-sort`, on Rules, Challenges and API Keys, for rows that are already loaded. Still left: sorting on the tables that page on the server, filters, and address state beyond Users. Added on 14 November: search, filters and page are kept in the address on Leaderboard, Events, Team and Audit Logs through one `useUrlState` hook, as they already were on Users. Left on purpose: sorting for the tables that page on the server needs a sort option on each API route, and Events, XP history and audit logs are in time order by nature. Not done: one `DataTable` component that all 22 tables share.
- [x] **DASH-08** `P3` Tabs and page structure: 15 groups of tab-like buttons but only 5 use `role="tab"`, and there is no "skip to content" link. Add one `Tabs` component with arrow keys, and the skip link. `[code]` A `Tabs` component with arrow, Home and End keys is used on Rules, Challenges, Store, Boosts & limits and the user page, and the shell has a "Skip to content" link. Left: the tabs on the admin organization page and the code samples in API Docs. Finished: the admin organization page uses `Tabs`, and the code-language tabs in API Docs take the arrow keys.
- [x] **DASH-09** `P3` Number and date fields: 47 `type="number"` inputs change value when someone scrolls over them and accept `e` and `-`, and the 6 `datetime-local` fields show the browser's local time with no time zone, while leaderboards and boosts run on UTC. Use a numeric text field with validation, and label the zone next to every date and time. `[check]` Number fields no longer change when the page is scrolled over them. Left: validation of `e` and `-`, and a time zone label next to date and time fields. Finished: number fields refuse `e` and `+`, and `-` where the smallest value is 0, and every date and time field says which time zone it is in. This found a bug: editing a challenge or a boost filled the field with UTC but read it back as local time, so each save moved the start and end by the time-zone offset. Both now use local time both ways.

### 14.2 Improvements

- [~] **DASH-10** `P1` Walk every page in a browser, signed in as a platform admin, an organization admin and a plain member, in both themes and at phone width, and record a screenshot of each in CI with Playwright (BASE-15). The pages added since BASE-13 have never been opened this way: Streaks, Boosts & limits, Store, Leagues, Invites, Segments, Campaigns, Connectors, Promote changes, and admin Features and Policies. Expect this to add items to 14.1. Walked 23 pages in a browser as the owner of a demo workspace, at 1366 px in the dark theme: no page errors and no sideways scrolling. It confirmed DASH-01, 02, 03 and 06, which are fixed above. `api-demo` and `worker-demo` in `.claude/launch.json` start a local demo server against the test database for this. Left: the same walk as a plain member and as a platform admin, in the light theme and at phone width, the pages a demo hides (Campaigns, Webhooks, Connectors, Integrations) and the admin area, and screenshots in CI. Added since: `pnpm --filter @gami/dashboard walk` opens all 30 project pages in a real browser in the dark and light themes at desktop width and at phone width, 90 page views, and fails on a script error, a failed load, a missing heading or title, sideways scrolling or text under 12 px. It passes locally. It runs in the CI smoke job, which also claims platform admin and walks the admin area, and keeps the screenshots. Still left: the walk as a plain member, and the CI step and the admin walk have not run yet. Added on 14 November: the walk now invites a second person as a plain member, walks the 18 pages they can open, and checks that three admin pages turn them away. 111 page views pass locally. Left, and only possible after a push: the CI step and the admin-area walk have never run.
- [x] **DASH-11** `P2` Run automated accessibility checks (axe) on those same pages in CI. UX-18 still has no screen-reader audit. Done in the same walk: axe checks every page view against WCAG 2 A and AA. A critical finding fails the walk, and it found two, both fixed: an unnamed refresh button on Team and an unlabelled email field on Profile. Serious findings are listed in the report without failing it; see DASH-18.
- [-] **DASH-12** `P2` Finish the colour tokens. Components use 1,915 raw palette classes such as `bg-zinc-900` against 1,168 token classes, so the light theme depends on remapping a grey scale. Add tokens for surface, raised surface, border and muted text, and move to them as files are touched. `[check]` Dropped after checking: the light theme is made by reversing the colour scales in `globals.css`, on purpose, and the walk shows it working on all 30 pages. Moving 1,900 classes to new tokens would change nothing a user can see.
- [~] **DASH-13** `P2` Give every newer page the same first-run state: what the feature is in one line, one primary action, and a ready-made example to start from. `EmptyState` is used in 14 of 31 views. Checked: the eight newer pages (Streaks, Boosts & limits, Store, Leagues, Invites, Segments, Campaigns, Connectors) already use `EmptyState`. Left: 19 older views have their own empty text, and no page offers a ready-made example to start from. Added on 14 November: API Keys, Events, Levels, Invitations, Team, Webhooks and XP History now use `EmptyState` too. Left: a ready-made example to start from on each page, and the remaining views (Achievements, Challenges and Users have their own designed empty states; Integrations, Leaderboard and the settings pages have plain text).
- [x] **DASH-14** `P2` Let search do things, not only go to pages: "Create rule", "Send test event", "New API key", "Invite teammate", and jump straight to a rule, achievement or reward by name. Search now offers actions: Create rule, Create achievement, Send test event, New API key and Invite teammate, each opening its page with the dialog ready (`?new=1`). Left: jumping to a rule, achievement or reward by name. Finished on 14 November: search finds rules, achievements and rewards by name. A rule opens ready to edit; an achievement or a reward opens its page.
- [x] **DASH-15** `P2` A player preview: pick a user and see the React components (level, streak, badges, store, leaderboard) exactly as that player would, next to the settings that drive them. Done: a "Player view" tab on each user shows the level, leaderboard, badges, challenges and notifications through the real `@gami.fied/react` components, using a ten-minute read-only token for that one player from a new staff-only route, `POST /api/projects/:projectId/users/:userId/preview-token`. Not shown: the streak calendar and the store, which need a streak or a write token. `[ran]`
- [~] **DASH-16** `P3` Link related things: from a rule to the badge or currency it awards, from an event to the rules that ran, from a redemption to the player and the reward. `[check]` Checked and added to: Store, Leagues, Invites and Streaks already linked to the player. Now a rule's badge and currency actions link to Achievements and the Store, and the user in Events and XP History links to their page. Left: links land on the page, not on the exact badge or reward, and an event does not link to the rules that ran.
- [x] **DASH-17** `P3` Keyboard shortcuts with a `?` help sheet, such as `g r` for Rules and `n` for new. Done: `?` lists the shortcuts, `/` opens search, and `g` then a letter goes to a page, such as `g r` for Rules. They never fire while typing or with a dialog open. There is no `n` for new, because search already does that.
- [-] **DASH-18** `P2` The primary button fails colour contrast. White text on the brand orange (`#ff6900`) is 2.88:1, and WCAG AA needs 4.5:1. It is on every page, 94 times in the walk. Near-black text on the same orange is about 7:1, or a darker orange would keep white text. This changes how the brand looks, so it needs a decision. The walk report also lists smaller cases: white on the green and red buttons (3.6:1), and a few pale greys in both themes. `[ran]` Dropped on 14 November 2026: the maintainer chose to keep white text on the brand orange. The walk lists it without failing.
- [x] **DASH-19** `P3` Five page views have a scrolling area a keyboard cannot reach (axe: `scrollable-region-focusable`). Give those areas `tabindex="0"` and a name. `[ran]` Done: the shared table wrapper, the hand-written table wrappers, code samples and the JSON viewer can be focused and scrolled with the keyboard.

---

## Phase 15: Website interface (second pass)

**Goal:** The site reads well in the first second, on a phone, and sends people somewhere useful. **Exit:** 15.1 is clear on a real phone. Checked on the built site in an emulated browser at 1280 px and 375 px.

### 15.1 Fixes

- [x] **SITE-01** `P1` The hero stays hidden too long. Two to three seconds after loading the home page, at both 1280 px and 375 px, only the small pill was visible: the headline was still behind its masks, and the subheading and both buttons had not appeared, leaving most of a phone screen blank. It settled a few seconds later. This goes against the "never delay reading" rule and WEB-36. Never hide the subheading or buttons, start the headline at once with a short cap on waiting for fonts, and confirm on a throttled real phone, since the preview pane may have slowed it. `[ran]` Done: the entrance is skipped in a background tab, and a timer finishes it at 1.5 seconds whatever else happens, so the subheading and buttons can never stay hidden. Measured again at 375 px: everything is shown two seconds after load. The long wait seen in the audit was the preview pane drawing no frames, which is the same thing a background tab does, so the fix covers a real case. Not checked on a real phone.
- [x] **SITE-02** `P2` The engine diagram cannot be read on a phone. It shrinks as one picture, so its labels come out at about 8 px. Give phones a stacked layout: app, engine, rewards from top to bottom. `[ran]` Done: phones get the same three steps stacked at a readable size, and the wide drawing and its animation are for 640 px and up. `[ran]`
- [x] **SITE-03** `P2` Tap targets are small on phones. 18 of 51 links and buttons on the home page, and 34 of 46 in the playground, are under 32 px tall. Bring controls to at least 44 px on touch screens, starting with the playground's rule chips and row buttons. `[ran]` Done: on touch screens and narrow windows, header links, footer links, buttons and tabs are at least 44 px tall. Nothing on the home page or the playground is under 44 px at 375 px. `[ran]`
- [x] **SITE-04** `P2` The docs home page is the repository's `docs/README.md` shown as it is: a "Documentation Sections" table with emoji and a line about the tech stack. Write a real landing page with four or five cards (Install, Quickstart, Concepts, API reference, Operations) and drop the numbered headings such as "1. Prerequisites" from the guides. `[ran]` The docs home is now a landing page written for the site (`src/docs-home.mdx`), with 16 cards in four groups: start, build, run and understand. `docs/README.md` stays as the index for people browsing the repository. Left: the numbered headings in the guides, because other pages link to those headings by number. Finished on 15 November: the numbers are gone from 67 headings in the guides, and the links that pointed at them by number are updated. The link check passes on all 217 pages.
- [x] **SITE-05** `P2` The docs and the marketing pages feel like two sites. The docs header has only the logo and GitHub, with no way back to Features, Pricing or the Playground, and the docs offer a light theme while the marketing pages are dark only. Add the main links to the docs header, and either give the marketing pages a light theme or carry the reader's choice across. `[ran]` The docs header now links to Features, Playground and Pricing. Left: the docs offer a light theme and the marketing pages do not. Removing it from the docs would take something away from readers, and a light theme for the marketing pages is a design job of its own, so this needs a decision. Finished on 15 November: the marketing pages have a light theme, made by reversing the colour scales as the dashboard does, and a button in the header to switch. The choice is kept under the same key the docs use, so it carries both ways. The pages stay dark unless the reader chose light. Screenshots, the tour and code samples stay dark in both. `[ran]`
- [x] **SITE-06** `P2` Pricing has no way to say "tell me". Without `PUBLIC_WAITLIST_URL` the Cloud and Enterprise buttons both read "Watch on GitHub for news". Ship a default waitlist form (email only, stored by a small function or a form service) so interest is captured from day one. `[ran]` The pricing page can take an email address on the page itself: a form appears on the Cloud and Enterprise plans once `PUBLIC_WAITLIST_ENDPOINT` is set, and `functions/api/waitlist.ts` stores addresses in a Cloudflare KV namespace. Left: a static site cannot keep an address by itself, so until the endpoint is set up the buttons still point to GitHub, and the function has never run on Cloudflare. Finished on 15 November as far as code can go: the function has tests (it keeps one entry per address, files an unknown plan under Cloud, and refuses bad input and other sites), the deploy workflow passes `WAITLIST_ENDPOINT` to the build, and the website README lists the three steps to switch it on. Still for the maintainer: create the KV namespace in Cloudflare, bind it, and set the variable. Until then the buttons point to GitHub.
- [x] **SITE-07** `P3` The comparison table is 820 px wide inside a 325 px scroller on phones, with nothing to show that it scrolls. Keep the first column fixed, add a shadow on the scrolling edge, or switch to one card per product. `[ran]` Done: the first column stays in view while the table scrolls, the edges fade to show there is more, a line says to swipe, and the table can be scrolled with the keyboard. `[ran]`
- [x] **SITE-08** `P3` The playground is about 5,750 px tall on a phone, so the result is far below the event that caused it. Use tabs (Rules, Event, Results) or a sticky result bar on small screens. `[ran]` Done: below 1280 px the playground has two tabs, "Rules and setup" and "Send and results", so sending an event and seeing what it did share one screen. The page went from about 5,750 px tall to about 4,100 on a phone. `[ran]`

### 15.2 Improvements

- [x] **SITE-09** `P2` Structured data and breadcrumbs: JSON-LD for the software, the FAQ on pricing, blog posts and breadcrumbs, and a visible breadcrumb on feature pages. None exists today. `[code]` Done: structured data for the software on the home page, the questions on pricing, each blog post, and a breadcrumb trail on feature, use-case and blog pages, which feature and use-case pages also show.
- [x] **SITE-10** `P2` The tour video has captions burned into the picture and no text track or transcript. Add a WebVTT track and a short transcript under it, which also helps search. `[ran]` The tour has a written transcript under it, from the same captions as the recording. `pnpm capture` now also writes `tour.vtt` with the exact time of each caption, and the page adds it as a caption track when the file exists. Left: record the tour again, because the current recording has no timings to build a track from. Finished on 15 November: the tour was recorded again from a local demo, so `tour.vtt` exists with the time of each caption and the page offers it as a caption track. `[ran]`
- [x] **SITE-11** `P2` Pages people search for: one per use case that matches the dashboard templates (learning, fitness, community, SaaS onboarding), and "open-source alternative to" pages for the hosted products in the comparison. Four use-case pages, for learning apps, fitness, communities and SaaS onboarding, each with the events to send, a rule the engine accepts (checked by a test), the mechanics that fit and a word of caution. Left: "alternative to" pages for named products, which need each product checked by hand first. Finished on 15 November: `/alternatives/trophy/` and `/alternatives/open-loyalty/`, each side by side from the product's own public page as read that day, with a link to it, when to choose the other product, and when to choose Gami.Fied. The comparison page links to both. The open-source libraries in the comparison get no page, since they are not hosted products.
- [x] **SITE-12** `P3` Show proof as it arrives: the GitHub star count on the header button, read at build time, and the logo or quote strip from WEB-39 once there is something real to show. The header shows the GitHub star count, read once at build time, from 50 stars up. Below that, or if GitHub does not answer, it shows the icon alone. Left: the logo or quote strip, which waits for something real to show. Closed on 15 November: the star count is done. The logo or quote strip has nothing real to show yet and stays open as WEB-39, where it was first planned.
- [x] **SITE-13** `P2` A component gallery: every `@gami.fied/react` component live on one page, with theme controls and the code to copy. It also closes the "live examples" part of WEB-17. Done: `/components/` shows six components live with made-up data, with controls for theme, accent colour and corner size, and the code and CSS to copy. It needs no server. `[ran]`
- [x] **SITE-14** `P3` A cost comparison on the pricing page: a hosted plan's monthly price against a small server running Gami.Fied, with the assumptions shown. Done as a calculator: the visitor enters a hosted plan's price, their server cost and their time, and sees the two over a year with the sum explained. The starting numbers are examples and name no product. `[ran]`

---

## Suggested order for the first milestones

1. **M1, Trustworthy repo:** Phase 0.
2. **M2, Safe:** All `P0` items in Phases 1 and 2, then SEC-05, SEC-10, SEC-17 and SEC-21.
3. **M3, Correct:** The rest of Phase 2, built on one shared `awardXp` service.
4. **M4, Honest RC2:** Phase 3.
5. **M5, Integrable:** DX-01 to DX-04, DX-07, DX-10, FEAT-01 and FEAT-02, then UX-01 to UX-04.
6. **M6, Public 1.0:** Remaining `P1` items, LAUNCH-01 to LAUNCH-07.
7. **M7, Website and playground:** WEB-01 to WEB-15, WEB-20 and WEB-21, and the `P1` motion items WEB-33 to WEB-38. Static, cheap and safe, and it gives people a reason to try Gami.Fied before Cloud exists.
8. **M8, Live demo:** WEB-25 to WEB-29, then the rest of Phase 9, including the remaining motion work (WEB-39 to WEB-44).
9. **M9, Cloud beta:** Settle DEC-5, DEC-6, DEC-7 and DEC-9, then CLOUD-01, CLOUD-02, CLOUD-05 to CLOUD-10 and CLOUD-12 to CLOUD-15, with a waitlist of design partners.
10. **M10, Cloud launch:** The rest of Phase 10, starting with CLOUD-23 so moving both ways works on day one.

### After the second audit

These slot in ahead of M8, because the site and demo should not go public on top of them.

1. **M7a, Safe data:** FIX-01 to FIX-04 and SUG-06. Done on 13 November 2026.
2. **M7b, Safe player API:** FIX-06 to FIX-10, FIX-13 and SUG-11, before `@gami.fied/react` goes to npm (FEAT-02). Done on 14 November 2026.
3. **M7c, First impressions:** SITE-01 to SITE-06, DASH-01 and DASH-10, before the site and demo are announced.
4. **M7d, The rest of Phase 11** (done on 13 November 2026), then Phases 12, 14 and 15 as files are touched.
5. **Phase 13** is picked from once DEC-4 is settled.
