import { describe, expect, it } from 'vitest';
import { encryptSecret } from '@gami/webhooks';
import '../index.js'; // Imports auto-registration side-effect
import { DiscordIntegrationProvider } from '../providers/discord/index.js';
import { buildDiscordEmbed, sanitizeDiscordContent } from '../providers/discord/templates.js';
import { registry } from '../registry.js';

describe('Shared @gami/integrations Package & Discord Provider Test Suite', () => {
  const provider = new DiscordIntegrationProvider();

  it('1. Provider Registry: Auto-registers Discord provider', () => {
    const registered = registry.get('discord');
    expect(registered).toBeDefined();
    expect(registered?.type).toBe('discord');
    expect(registry.listRegisteredTypes()).toContain('discord');
  });

  it('2. Content Sanitization: Neutralizes Discord mention injections', () => {
    const raw = 'Hello @everyone and @here! Contact <@123456789> for details.';
    const sanitized = sanitizeDiscordContent(raw);
    expect(sanitized).not.toContain('@everyone');
    expect(sanitized).not.toContain('@here');
    expect(sanitized).not.toContain('<@');
    expect(sanitized).toContain('@\u200beveryone');
    expect(sanitized).toContain('@\u200bhere');
    expect(sanitized).toContain('<\\@');
  });

  it('3. Embed Templates: Formats gamification notification payloads', () => {
    const xpPayload = buildDiscordEmbed({
      eventType: 'xp_awarded',
      userId: 'usr_1',
      userName: 'Ronak',
      title: 'XP Awarded',
      body: 'Completed Daily Quest',
      metadata: { xp: 50 },
    });
    expect(xpPayload.embeds[0].title).toContain('XP Awarded');
    expect(xpPayload.embeds[0].description).toContain('Ronak');
    expect(xpPayload.embeds[0].description).toContain('50 XP');

    const achPayload = buildDiscordEmbed({
      eventType: 'achievement_unlocked',
      userId: 'usr_2',
      userName: 'Sarah',
      title: 'First Victory',
      body: 'Unlocked badge',
      metadata: { achievementName: 'First Victory' },
    });
    expect(achPayload.embeds[0].title).toContain('Achievement Unlocked!');
    expect(achPayload.embeds[0].description).toContain('First Victory');
  });

  it('4. Encrypted Config Resolution: Decrypts encrypted credentials safely', async () => {
    const rawUrl = 'https://discord.com/api/webhooks/123456/abcdef';
    const encrypted = encryptSecret(rawUrl);

    const valid = await provider.validateConfig({ encryptedWebhookUrl: encrypted });
    expect(valid).toBe(true);

    const status = await provider.getStatus({
      encryptedWebhookUrl: encrypted,
      guildId: 'guild_123',
      channelId: 'channel_456',
    });
    expect(status.connected).toBe(true);
    expect(status.details?.guildId).toBe('guild_123');
    expect(JSON.stringify(status.details)).not.toContain(rawUrl);
  });
});
