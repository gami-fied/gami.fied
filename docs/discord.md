# Discord Integration Provider Guide

## Overview
Discord is Gami's initial integration provider, allowing rich gamification notifications to be posted automatically into configured Discord text channels.

---

## Connection Options

1. **Discord OAuth2 & Bot Installation**:
   - Primary flow for installing Gami's Discord bot into a Discord Guild/Server.
   - Generates state token signed via HMAC-SHA256 for CSRF prevention.
   - Requires `bot` and `messages.read` scopes with minimal send messages permission (`2048`).

2. **Custom Webhook URL**:
   - Alternative lightweight connection option allowing project admins to enter a Discord Channel Webhook URL directly.
   - Webhook URL is encrypted at rest using AES-256-GCM.

---

## Notification Embed Templates & Sanitization

Discord messages are formatted as rich embeds customized per event type:
- **`xp_awarded`**: Amber embed (`⚡ Ronak earned 50 XP`).
- **`achievement_unlocked`**: Emerald embed (`🏆 Ronak unlocked First Victory!`).
- **`level_up`**: Cyan embed (`🎉 Ronak reached Level 5!`).
- **`challenge_completed`**: Violet embed (`⚔️ Ronak completed Weekly Warrior!`).

### Security & Sanitization:
All user-provided display names and notification titles pass through `sanitizeDiscordContent()`:
- `@everyone` → `@​everyone` (zero-width space inserted to prevent mention injection)
- `@here` → `@​here`
- `<@` → `<\@`
