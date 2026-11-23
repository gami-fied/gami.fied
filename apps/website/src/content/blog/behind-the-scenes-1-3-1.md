---
title: 'Gami.Fied 1.3.1: polish everywhere, and a real app to learn from'
description: A complete example app, mystery boxes and titles in design files, a friendlier Developer Hub, a calmer playground, and more than a dozen dashboard fixes.
date: 2026-11-23
tags: [release, community]
draft: true
---

1.3.1 started as a tidy-up release. Then people started trying Gami.Fied, and told us what felt clunky. So this one is mostly polish: the small things you trip over in the first ten minutes. 🧹

Nothing changes in how your app talks to Gami.Fied. Upgrade, and things just feel smoother.

## 🔥 A real app to learn from

Docs are great, but sometimes you want to see the whole thing working. So we built **[Habit Quest](/docs/example-habit-tracker/)**, a small habit tracker in about 250 lines.

Tick off a habit and you earn XP and coins, keep a daily streak, unlock badges and climb a weekly leaderboard. Then you spend your coins on a mystery box, or on a title to wear on the leaderboard. The app has no game logic in it at all: the whole game lives in Gami.Fied, so you change it from the dashboard.

It starts with Gami.Fied in one `docker compose up`. Read it, copy it, or pull it apart.

## 🎁 Mystery boxes and titles travel too

Design files let you copy a whole setup from one project to another, or from staging to production. Now they carry **mystery boxes and wheels** and **cosmetics** (titles and frames) as well. If a box's prize names something the other project doesn't have, the import preview tells you before anything changes.

## 🧑‍💻 A friendlier Developer Hub

The dashboard used to have its own copy of the API docs. It was big, it drifted from the real ones, and one of its examples only worked on `localhost`. 🙈

Now **Developer Hub** shows what only your install knows: its API address, your project ID and the server version. It has four starter snippets with your address already filled in:

- send an event with curl;
- set up the TypeScript SDK;
- make a player token;
- show a player's progress in React.

A test sends those same requests to a real server, so the snippets can't quietly break again. For everything else, it links to the docs on this website.

## 🏅 "How is it earned?"

When you make a badge, the form now asks a clear question: is it given **by a rule or challenge**, or earned **by progress toward a target**? Each choice says what your players will see. A badge given by a rule lists the rules that give it, with a button to make another. And if a rule hands out a badge that is already earned by progress, the rule builder warns you.

## 🎮 A calmer playground

The [playground](/playground/) was doing a lot at once. Now the "Send an event" box, the player and the results stay in view while you edit rules, so you change a rule, click Send, and see the XP arrive without scrolling. What you earned comes first. There is far less orange, fewer boxes inside boxes, and the extra settings fold away until you need them.

## 🐛 Fixed

- **Saving a rule you were editing** left the editor open as "Create Rule", and saving again made a copy. Fixed.
- **Rules with no conditions** could not be saved from the dashboard at all. Fixed, on the server too.
- **"Award achievement"** in the rule builder showed no badges until you had opened the Achievements page. Fixed.
- **Previous and Next on tables** could not be clicked in the bottom-right corner, because an empty notification area was in the way. Fixed.
- **Badges given by a rule, challenge or prize** did not show in a player's badge collection. They do now, in the React components and web components too.
- **A worn title** now shows on a player's own leaderboard row, even outside the top places.
- **Organization and project slugs** in the first-run setup kept only the first letter of the name. Fixed.
- Lots of smaller things: fields, dropdowns and buttons on the same row are now the same height, scrollbars match the theme, the collapsed sidebar no longer hides the logo, and cards on a player's page no longer stretch to fill space.

## 🔒 Tougher security

- **The dashboard checks every script before it runs.** Each page gets a fresh secret stamp, and only scripts carrying it can run. If someone ever sneaks bad code onto a page, it simply does nothing.
- **Slimmer server images.** We removed tools that were only needed to *build* Gami.Fied, not to run it. Less stuff on the server means fewer places for problems to hide.
- **Robot guards on duty.** 🤖 Every change is scanned for known security issues, and our dependencies are checked for updates every week.

## 📦 Safer releases

- Our npm packages are published straight from GitHub, with proof of where they were built. There are no secret passwords to leak.
- Our images are on **Docker Hub** too, not just GitHub.
- A version check makes sure every part of a release agrees on its version number before it goes out.

## 🤝 Come build with us

Gami.Fied is open source, and we would love your help. There is a **[contributing guide](https://github.com/gami-fied/gami.fied/blob/master/CONTRIBUTING.md)**, a **[security policy](https://github.com/gami-fied/gami.fied/blob/master/SECURITY.md)**, a **[code of conduct](https://github.com/gami-fied/gami.fied/blob/master/CODE_OF_CONDUCT.md)**, simple forms for bug reports and feature ideas, and **[Discussions](https://github.com/gami-fied/gami.fied/discussions)** for questions or showing off what you built.

Found a bug? Have an idea? Come tell us. Every star, issue and pull request helps. ⭐

## Upgrading

Change the version to `1.3.1` and restart. There are no database changes and nothing new to set up. The [changelog](/changelog/) has the full list.
