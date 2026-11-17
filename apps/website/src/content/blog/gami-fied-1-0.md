---
title: 'Gami.Fied 1.0: level up your app, on your own server'
description: Our very first release is here. Add XP, levels, badges, challenges and leaderboards to any app, and keep every bit of your players' data at home.
date: 2026-11-06
tags: [release]
---

Ding! Gami.Fied just reached **level 1.0**. 🎉

After two test releases and a lot of late nights, the first proper version is out. If you have ever wanted your app to feel a bit more like a game, with points, badges and a leaderboard people fight over, this is for you.

## So what is Gami.Fied, exactly?

Think of it as a scorekeeper that lives next to your app.

Your app tells Gami.Fied what people do: *"Priya finished a lesson"*, *"Sam ran 5 km"*, *"Alex closed a support ticket"*. Gami.Fied decides what that is worth, keeps score, and hands out the rewards. You decide the rules. It does the counting.

And it runs **on your own server**. Your players' data never leaves your hands, and there is no bill that grows every time you get a new user.

## What you get on day one

### The fun stuff for your players

- **XP and levels.** Every action can earn points, and points add up to levels.
- **Achievements.** Badges for the things you want to celebrate, like a first purchase or a 100th workout.
- **Challenges.** Goals with a finish line, such as "complete 5 lessons this week".
- **Leaderboards.** All-time, daily, weekly and monthly, so there is always a race worth joining.
- **Notifications.** A little "you just earned a badge!" inside your app, or by email.

### The handy stuff for you

- **Rules without code.** Set up "a finished lesson is worth 10 XP" in the dashboard. If a rule does something odd, Gami.Fied shows you exactly why it fired.
- **A friendly dashboard.** See what is happening at a glance, search everything with **Ctrl + K**, and go from zero to your first XP in a few clicks. It works in light or dark mode, and on your phone too.
- **Teamwork built in.** Invite your teammates as owners, admins or members, and see who changed what in the audit log.
- **Stats you can download.** Charts for how people use your app, with CSV exports when you want to dig deeper.

### The safe stuff for your developers

- A **stable API** that will not break under them, plus an official **TypeScript SDK**.
- **Keys with limits**, so each key can only do what it needs to.
- **Short-lived player tokens**, so player pages can show progress without ever seeing a secret key.
- **Signed webhooks** and a **Discord integration**, to tell your other tools when something happens.

### The peace-of-mind stuff for whoever runs the server

- **One command to start.** Ready-made Docker images, so there is nothing to build.
- **Backups, exports and imports** from an admin area.
- **Privacy tools**, so you can erase a player completely when they ask.

## Open source, for real

The server is open source under the AGPL-3.0 licence. The SDK is MIT licensed, so you can use it in a closed-source app without worrying about it.

## A couple of honest notes

This is a 1.0, not a finished game. Leaderboards are worked out fresh each time someone looks, and we have not published load tests yet. If you have a very large crowd, try it out first. We will keep improving this.

## Try it

Grab the files from the [install guide](/docs/install/docker-compose/), fill in a few secrets, and start it with one command. Then send your first event and watch the XP roll in.

Welcome to Gami.Fied. Let's make some apps more fun. 🕹️
