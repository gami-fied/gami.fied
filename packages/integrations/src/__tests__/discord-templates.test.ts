import { describe, expect, it } from 'vitest';
import {
  buildDiscordEmbed,
  buildDiscordEmbedFromTemplate,
  DEFAULT_DISCORD_TEMPLATES,
  EVENT_PLACEHOLDERS,
  getSampleContext,
  renderTemplateString,
  sanitizeDiscordContent,
  validateDiscordEmbedTemplate,
} from '../providers/discord/templates.js';

describe('Discord Embed Templates & Placeholder Renderer Test Suite', () => {
  it('1. Placeholder Substitution: Replaces known placeholders correctly', () => {
    const template = 'User {{userName}} (ID: {{userId}}) earned {{xp}} XP!';
    const context = { userName: 'Ronak', userId: 'usr_123', xp: 50 };
    const rendered = renderTemplateString(template, context);
    expect(rendered).toBe('User Ronak (ID: usr_123) earned 50 XP!');
  });

  it('2. Unknown Placeholders: Preserves unknown placeholders unchanged', () => {
    const template = 'User {{userName}} has {{unknownField}} items.';
    const context = { userName: 'Sarah' };
    const rendered = renderTemplateString(template, context);
    expect(rendered).toBe('User Sarah has {{unknownField}} items.');
  });

  it('3. Mention Sanitization: Neutralizes mention injections inside placeholders', () => {
    const template = 'Announcement by {{userName}}!';
    const context = { userName: 'Hacker @everyone and @here <@1234>' };
    const rendered = renderTemplateString(template, context);
    expect(rendered).not.toContain('@everyone');
    expect(rendered).not.toContain('@here');
    expect(rendered).not.toContain('<@');
    expect(rendered).toContain('@\u200beveryone');
  });

  it('4. Default Template Fallback: Uses default embed when no custom template is provided', () => {
    const payload = buildDiscordEmbedFromTemplate('xp_awarded');
    expect(payload.embeds[0].title).toBe('⚡ XP Awarded');
    expect(payload.embeds[0].description).toContain('Ronak');
    expect(payload.embeds[0].description).toContain('150 XP');
  });

  it('5. Custom Template Rendering: Renders customized titles and descriptions', () => {
    const customTemplate = {
      title: '🎯 Custom XP Boost',
      description: 'Congrats {{userName}}! You achieved {{xp}} XP for {{externalId}}.',
      color: '#10B981',
      footerText: 'Custom Gamification Guild',
    };

    const payload = buildDiscordEmbedFromTemplate('xp_awarded', customTemplate);
    expect(payload.embeds[0].title).toBe('🎯 Custom XP Boost');
    expect(payload.embeds[0].description).toBe('Congrats Ronak! You achieved 150 XP for ext_ronak_99.');
    expect(payload.embeds[0].color).toBe(0x10b981);
    expect(payload.embeds[0].footer?.text).toBe('Custom Gamification Guild');
  });

  it('6. Embed Limit Validation: Catches title length and character limit violations', () => {
    const invalidTitleTemplate = {
      title: 'A'.repeat(300), // Exceeds 256
    };
    const valResult1 = validateDiscordEmbedTemplate(invalidTitleTemplate);
    expect(valResult1.valid).toBe(false);
    expect(valResult1.errors[0]).toContain('title exceeds Discord maximum limit of 256');

    const invalidUrlTemplate = {
      url: 'not-a-valid-url',
    };
    const valResult2 = validateDiscordEmbedTemplate(invalidUrlTemplate);
    expect(valResult2.valid).toBe(false);
    expect(valResult2.errors[0]).toContain('contains an invalid URL format');
  });

  it('7. Placeholders Metadata: Exposes documented placeholder lists for all 4 notification types', () => {
    expect(EVENT_PLACEHOLDERS.xp_awarded).toBeDefined();
    expect(EVENT_PLACEHOLDERS.achievement_unlocked).toBeDefined();
    expect(EVENT_PLACEHOLDERS.level_up).toBeDefined();
    expect(EVENT_PLACEHOLDERS.challenge_completed).toBeDefined();
    expect(EVENT_PLACEHOLDERS.xp_awarded.map((p) => p.key)).toContain('{{xp}}');
  });
});
