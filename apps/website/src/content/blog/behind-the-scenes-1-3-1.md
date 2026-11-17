---
title: 'Behind the scenes: a safer, friendlier Gami.Fied'
description: No shiny new features this time. Just a badge bug squashed, tougher security, and everything you need to join in and help.
date: 2026-11-17
tags: [release, community]
draft: true
---

Not every update is about new toys. Sometimes you tidy your room, fix the squeaky door and put a better lock on the front. 🧹

That is what this one is. Nothing changes in how you use Gami.Fied, but it is a little safer, a little more polished, and a lot easier to get involved with.

## 🐛 A sneaky badge bug, squashed

Badges handed out by a rule, a challenge or a prize did not show up in a player's badge collection. So some players saw "No achievements yet" even though they had earned plenty. Rude! Now every badge a player owns shows up where it should.

## 🔒 Tougher security

- **The dashboard checks every script before it runs.** Each page gets a fresh secret stamp, and only scripts carrying it can run. If someone ever sneaks bad code onto a page, it simply does nothing.
- **Slimmer server images.** We removed tools that were only needed to *build* Gami.Fied, not to run it. Less stuff on the server means fewer places for problems to hide, and security scanners are much happier.
- **Robot guards on duty.** 🤖 Every change is now scanned for known security issues automatically, and our dependencies are checked for updates every week.

## 📦 Safer, smoother releases

- Our npm packages are now published straight from GitHub, with proof of where they were built. There are no secret passwords to leak, and you can check that the package you install is the one we made.
- Our images are now on **Docker Hub** too, not just GitHub.
- A version check makes sure every part of a release agrees on its version number before it goes out. No more mix-ups.

## 🤝 Come build with us

Gami.Fied is open source, and we would love your help. We added everything a good open-source project should have:

- a **[contributing guide](https://github.com/gami-fied/gami.fied/blob/master/CONTRIBUTING.md)** that explains how to set things up and send a change;
- a **[security policy](https://github.com/gami-fied/gami.fied/blob/master/SECURITY.md)** for reporting problems privately;
- a **[code of conduct](https://github.com/gami-fied/gami.fied/blob/master/CODE_OF_CONDUCT.md)**, because being kind is not optional;
- simple forms for **bug reports** and **feature ideas**;
- **[Discussions](https://github.com/gami-fied/gami.fied/discussions)**, for questions, ideas, or just showing off what you built.

Found a bug? Have an idea? Built something fun? Come tell us. Every star, issue and pull request helps. ⭐

## Upgrading

When this release is out, change the version and restart. There are no database changes and nothing to set up. The [changelog](/changelog/) has the full list.
