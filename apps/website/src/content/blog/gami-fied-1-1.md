---
title: 'Gami.Fied 1.1: streaks, a reward store, leagues and more'
description: The biggest release so far adds streaks, a points economy, leagues and social play, inbound connectors, staging environments, plugins and controls for running an instance.
date: 2026-11-08
tags: [release]
---

Gami.Fied 1.1 is out. It is the largest release since 1.0, and everything in it is additive: the `/v1` API works as before, and nothing has to change in your app.

## Progression

**Streaks** are now built in, not a rule preset. They count daily or weekly in each player's own time zone, freezes save a missed day, and reminder emails go out before a streak breaks.

**Achievements earn themselves** from a count, a total, unique values or a streak, with tiers, bonus XP and secret badges. **Challenges** gained ordered steps, conditions on the events that count, and daily or weekly repeats.

Rules got safer to change: save a **draft**, **publish** it when ready, see the **history**, and **roll back**. A **backtest** replays a rule over your past events and shows how much XP it would have given before it goes live. **Boosts** run promotions like double XP weekends, and **limits** keep rewards from being farmed.

## A points economy

**Currencies** are points people can save and spend, separate from XP. They can expire, the soonest-to-expire are spent first, and people are warned three days ahead.

The **reward store** sells rewards with stock and a limit per person. Deliver them yourself, hand out codes from a list, or generate a unique coupon for each purchase. Buying is exact: the points, stock and code change together, so nothing is ever oversold.

## Competition and community

**Segments** save groups of players by anything you know about them, and any leaderboard can be narrowed to one, to a player's friends, or to the people who share their country. **Team and country boards** rank groups against each other. **Leagues** put players in small groups at their own level, with promotion and relegation each season.

Players can add **friends**, give **kudos**, follow an **activity feed**, share **cards** of their achievements, and bring people in with **invite codes** that reward both sides.

## Connecting and running it

**Connectors** take events straight from Segment, RudderStack, Stripe and GitHub. **Plugins** add rule actions of your own. **Staging projects** use test keys, and promotion copies their design to production with references fixed.

Platform administrators can now **turn features on or off** for the whole instance or one organization, with dependencies kept consistent, and set **organization rules** such as project limits, allowed email domains, API key lifetimes and address allowlists.

## Upgrading

Set `GAMI_VERSION` to the new version and run `docker compose up -d`. The migration step adds the new tables before the API starts; no data changes. Every feature is on after the upgrade.

The full notes are in the [changelog](/changelog/).
