---
title: 'Gami.Fied 1.2: we got a home on the internet'
description: Gami.Fied now has its own website, with friendly docs, a playground in your browser and a live demo you can try without signing up.
date: 2026-11-13
tags: [release]
---

Every good game needs a lobby. Ours just opened. 🏠

Gami.Fied now lives at **[gami.fied.cc](https://gami.fied.cc)**. Before, you had to dig through a code repository to learn about it. Now there is a proper front door.

## What is on the new website

- **[Docs](/docs/)** with search, so you can find "how do I add a badge?" in seconds. Docs for older versions are still there if you need them.
- **An API reference** that lists everything the API can do, with examples.
- **A [playground](/playground/)** right in your browser. Write a rule, send a pretend event, and see what happens. Nothing to install.
- **Feature pages** that explain each part of Gami.Fied without the jargon.
- **This blog** (hello! 👋) and a [changelog](/changelog/) for the full list of changes.

## A live demo, no strings attached

Want to poke around the dashboard before you install anything? You can now start a **live demo** in one click. It comes filled with example data, so it already looks alive. It cleans itself up after a day, so feel free to break things.

If you want to run a public demo of your own, there is a **demo mode** for that too. It locks things down, stops sign-up spam, and sends no emails. The [live demo guide](/docs/live-demo/) explains how.

## Copy your setup in a file

You can now **download your project's whole design** as one file: your currencies, badges, levels, streaks, leagues, rules, challenges and shop rewards. Then load it into another project.

Before anything changes, Gami.Fied shows you a preview of what will be added or updated. You can bring in all of it or just the parts you want. It is great for sharing a setup between projects, or keeping a copy safe.

## One-click deploys (in beta)

We added ready-made files for **Render**, **DigitalOcean** and **Coolify**, so you can launch Gami.Fied there in a few clicks. We have not tested them on those platforms ourselves yet, so tell us how it goes!

## Small fixes that make a big difference

- Rules made in the visual editor that give out a badge can be saved again. Oops. 🙈
- "Is one of" and "is not one of" conditions now save properly.
- The dashboard finds the API even if its address is written without `http://`.
- The dashboard and docs now wear our shiny new logo.

## Upgrading

Change the version to 1.2 and restart. One tiny database change happens by itself, and your data stays as it is. The demo features stay off unless you turn them on.

See you on [the new website](https://gami.fied.cc)! Come say hi. 👋
