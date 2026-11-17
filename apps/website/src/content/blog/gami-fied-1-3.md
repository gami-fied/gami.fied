---
title: 'Gami.Fied 1.3: mystery boxes, season passes and a lot of new toys'
description: Six new ways to play, an inbox for players, translations, browser notifications, components for any website, and a big round of safety fixes.
date: 2026-11-15
tags: [release]
---

Grab a snack, this one is a long scroll. 🍿

Gami.Fied 1.3 brings **six new game mechanics**, ways to reach players in their own language and on their own devices, and a big spring clean under the hood. It also fixes an important backup bug, so please read the upgrade notes at the end.

## Six new ways to play

### 🎁 Mystery boxes and spin wheels

Everybody loves a surprise. Create boxes or wheels with prizes, and decide how rare each one is. Players can always **see the odds**, because fair is fun. You can charge coins to open one, limit how many a day, and promise a rare prize after a long run of bad luck.

### 🎟️ Season pass

A ladder of rewards that players climb with the XP they earn during a season. There is a **free lane** for everyone, and a **premium lane** players can unlock with coins, or that you can give them.

### 👥 Teams and shared goals

Players can join a **team**, and teams race each other up the rankings. Set a **shared goal** like "the whole community runs 10,000 km this month". When it is reached, everyone who helped gets paid.

### 👑 Cosmetics

Titles, avatar frames and profile bling. Players can unlock them with a badge, buy them, win them, or get them as a gift. Then they **show them off** on their profile and on the leaderboard.

### 🥇 Leaderboard prizes

Leaderboards can finally hand out real rewards. Pay the top 3, the top 10, or any range of places when the day, week or month ends.

### 🗺️ Journeys

Chain challenges into a path: finish one and the next one unlocks. Reach the end for a big prize. Perfect for onboarding, or a "30 days of fitness" adventure.

All six share the same kinds of prizes: XP, coins, a badge or a cosmetic. Each one can be switched off if you do not need it. See the [guide](/docs/boxes-passes-teams-and-journeys/) to set them up.

## Reaching players, wherever they are

- **📬 An inbox.** Players get a proper notification inbox with read and unread messages, and a little counter showing how many are new.
- **🌍 Translations.** Badge names, descriptions and messages can now appear in each player's own language. If there is no Brazilian Portuguese version, Gami.Fied falls back to Portuguese, then to the original. [How it works](/docs/translations/).
- **🔔 Browser notifications.** Send push notifications straight to a player's browser. They go directly to that browser, with no other company in between.

## Works on any website now

Not using React? No problem. **Web components** give you every Gami.Fied component as a simple HTML tag:

```html
<gami-leaderboard period="weekly"></gami-leaderboard>
```

Drop it into Vue, Svelte, WordPress or a plain HTML page, and it just works. Browse them all in the [component gallery](/components/). Our React components are now on npm too.

## A dashboard that is nicer to live in

- **Ctrl + K does things.** Not just search, but actions too: create a rule, make a new key, invite a teammate. Press **?** to see all the keyboard shortcuts.
- **Player view.** Click any player and see exactly what *they* see in your app. Great for answering "why don't I have my badge?".
- **A tidier menu**, grouped by what you are trying to do, with sortable tables and filters that stay put when you refresh.
- Times on challenges and boosts no longer slide around because of your time zone. 🕰️

## A big round of safety fixes

We went through Gami.Fied with a magnifying glass. 🔍 The highlights:

- **Player tokens are read-only unless you say otherwise.** A token that only needs to show progress can no longer change anything.
- **Adding a friend now sends a request**, which the other person has to accept. No more surprise friends.
- **The server is more locked down.** It is harder to reach from the outside, and the app cannot change its own files.
- **Fairer sign-in lockouts.** Someone guessing your password now locks out *themselves*, not you.
- **Unsubscribe links ask first**, so email scanners can't unsubscribe people by accident.
- **No more blank dashboard.** Under steady use, the dashboard could go blank for ten seconds. Fixed.

## ⚠️ The important one: backups

We found a serious bug. Backups only saved the tables from version 1.0, so restoring one could **lose newer data** like wallets, streaks and leagues. That is now fixed: backups hold everything, and a restore stops safely if something goes wrong. Exports and imports were also fixed so they keep everything, and your own IDs.

**Please make a fresh backup after you upgrade.**

## Upgrading

Take a backup, then switch to 1.3 and restart. The database updates itself without touching existing data. Then check four things:

1. **Player tokens.** If players buy things, add friends or give kudos from your app, create their token with write access.
2. **Ports.** If you open the dashboard at your server's address without a reverse proxy in front, you now need one setting. It's in the [upgrade guide](/docs/install/upgrading/).
3. **Custom files.** If you added your own folders inside the containers, check they still work.
4. **Friends.** Adding a friend now needs the other player to accept.

All the details are in the [changelog](/changelog/). Now go open a mystery box. You know you want to. 🎁
