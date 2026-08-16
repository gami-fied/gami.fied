import type { IntegrationMessage } from '../../types.js';

export function sanitizeDiscordContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@/g, '<\\@');
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedTemplate {
  title?: string;
  description?: string;
  url?: string;
  color?: number | string;
  authorName?: string;
  footerText?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  fields?: DiscordEmbedField[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name: string };
  footer?: { text: string };
  thumbnail?: { url: string };
  image?: { url: string };
  fields?: DiscordEmbedField[];
  timestamp?: string;
}

export interface DiscordPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

export const EVENT_PLACEHOLDERS: Record<string, Array<{ key: string; description: string }>> = {
  xp_awarded: [
    { key: '{{xp}}', description: 'Amount of XP awarded' },
    { key: '{{currentXp}}', description: 'User total XP balance' },
    { key: '{{currentLevel}}', description: 'User current level number' },
    { key: '{{levelName}}', description: 'Title of current level' },
    { key: '{{xpToNextLevel}}', description: 'XP needed for next level' },
    { key: '{{progressPercent}}', description: 'Level progress percentage' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  achievement_unlocked: [
    { key: '{{achievementName}}', description: 'Name of unlocked achievement' },
    { key: '{{achievementId}}', description: 'ID of achievement' },
    { key: '{{achievementDescription}}', description: 'Achievement description' },
    { key: '{{badgeIconUrl}}', description: 'Badge icon image URL' },
    { key: '{{unlockedAt}}', description: 'Unlock timestamp' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  level_up: [
    { key: '{{newLevel}}', description: 'New level number reached' },
    { key: '{{levelName}}', description: 'Title of new level' },
    { key: '{{previousLevel}}', description: 'Previous level number' },
    { key: '{{requiredXp}}', description: 'XP required for level' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  challenge_completed: [
    { key: '{{challengeName}}', description: 'Name of completed challenge' },
    { key: '{{challengeId}}', description: 'ID of challenge' },
    { key: '{{challengeDescription}}', description: 'Challenge description' },
    { key: '{{rewardXp}}', description: 'Bonus XP reward' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
};

export const DEFAULT_DISCORD_TEMPLATES: Record<string, DiscordEmbedTemplate> = {
  xp_awarded: {
    title: '⚡ XP Awarded',
    description: '**{{userName}}** earned **{{xp}} XP**!',
    color: '#F59E0B',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Current Level', value: 'Level {{currentLevel}} ({{levelName}})', inline: true },
      { name: 'Progress', value: '{{progressPercent}} ({{xpToNextLevel}} XP needed)', inline: true },
    ],
  },
  achievement_unlocked: {
    title: '🏆 Achievement Unlocked!',
    description: '🎉 **{{userName}}** unlocked **{{achievementName}}**!',
    color: '#10B981',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Details', value: '{{achievementDescription}}', inline: false },
    ],
  },
  level_up: {
    title: '🎉 Level Up!',
    description: '🚀 **{{userName}}** reached **Level {{newLevel}}**!',
    color: '#06B6D4',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Title', value: '{{levelName}}', inline: true },
      { name: 'Previous Level', value: 'Level {{previousLevel}}', inline: true },
    ],
  },
  challenge_completed: {
    title: '⚔️ Challenge Completed!',
    description: '⚔️ **{{userName}}** completed **{{challengeName}}**!',
    color: '#8B5CF6',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Reward', value: '+{{rewardXp}} Bonus XP', inline: true },
    ],
  },
};

/**
 * Safely replaces {{key}} tokens in a template string with values from context.
 * Unknown placeholders remain unchanged in the output string (e.g. {{unknownKey}}).
 */
export function renderTemplateString(template: string, context: Record<string, unknown>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key) && context[key] !== undefined && context[key] !== null) {
      return sanitizeDiscordContent(String(context[key]));
    }
    return match; // Unknown placeholders remain unchanged
  });
}

/**
 * Parses color strings (e.g. "#10B981" or "0x10B981") or numbers to a valid 24-bit integer color code.
 */
export function parseColor(color: string | number | undefined, defaultColor = 0x6366f1): number {
  if (color === undefined || color === null) return defaultColor;
  if (typeof color === 'number') return color;
  if (typeof color === 'string') {
    const cleaned = color.trim().replace(/^#/, '').replace(/^0x/i, '');
    const parsed = parseInt(cleaned, 16);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 0xffffff) {
      return parsed;
    }
  }
  return defaultColor;
}

/**
 * Validates a Discord Embed Template against Discord platform character and structure limits.
 */
export function validateDiscordEmbedTemplate(template: DiscordEmbedTemplate): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let totalLength = 0;

  if (template.title) {
    if (template.title.length > 256) {
      errors.push('Embed title exceeds Discord maximum limit of 256 characters');
    }
    totalLength += template.title.length;
  }

  if (template.description) {
    if (template.description.length > 4000) {
      errors.push('Embed description exceeds Discord maximum limit of 4000 characters');
    }
    totalLength += template.description.length;
  }

  if (template.authorName) {
    if (template.authorName.length > 256) {
      errors.push('Embed author name exceeds Discord maximum limit of 256 characters');
    }
    totalLength += template.authorName.length;
  }

  if (template.footerText) {
    if (template.footerText.length > 2048) {
      errors.push('Embed footer text exceeds Discord maximum limit of 2048 characters');
    }
    totalLength += template.footerText.length;
  }

  if (template.fields) {
    if (template.fields.length > 25) {
      errors.push('Embed fields count exceeds Discord maximum limit of 25 fields');
    }
    template.fields.forEach((f, idx) => {
      if (!f.name || f.name.length > 256) {
        errors.push(`Field #${idx + 1} name must be non-empty and max 256 characters`);
      } else {
        totalLength += f.name.length;
      }
      if (!f.value || f.value.length > 1024) {
        errors.push(`Field #${idx + 1} value must be non-empty and max 1024 characters`);
      } else {
        totalLength += f.value.length;
      }
    });
  }

  if (totalLength > 6000) {
    errors.push('Total combined character count across embed exceeds Discord limit of 6000 characters');
  }

  const validateUrl = (urlStr?: string, fieldName?: string) => {
    if (!urlStr) return;
    try {
      const parsed = new URL(urlStr);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push(`${fieldName} must use http or https protocol`);
      }
    } catch {
      errors.push(`${fieldName} contains an invalid URL format`);
    }
  };

  validateUrl(template.url, 'Embed URL');
  validateUrl(template.thumbnailUrl, 'Thumbnail URL');
  validateUrl(template.imageUrl, 'Image URL');

  return { valid: errors.length === 0, errors };
}

/**
 * Returns a mock context dictionary with realistic sample values for live preview rendering.
 */
export function getSampleContext(eventType: string): Record<string, unknown> {
  switch (eventType) {
    case 'xp_awarded':
      return {
        xp: 150,
        currentXp: 1250,
        currentLevel: 5,
        levelName: 'Veteran Adventurer',
        xpToNextLevel: 250,
        progressPercent: '83%',
        userId: 'usr_123',
        userName: 'Ronak',
        externalId: 'ext_ronak_99',
      };
    case 'achievement_unlocked':
      return {
        achievementName: 'First Victory',
        achievementId: 'ach_first_victory',
        achievementDescription: 'Awarded for completing your first campaign mission with distinction.',
        badgeIconUrl: 'https://example.com/badge.png',
        unlockedAt: 'Just Now',
        userId: 'usr_123',
        userName: 'Ronak',
        externalId: 'ext_ronak_99',
      };
    case 'level_up':
      return {
        newLevel: 6,
        levelName: 'Master Champion',
        previousLevel: 5,
        requiredXp: 1500,
        userId: 'usr_123',
        userName: 'Ronak',
        externalId: 'ext_ronak_99',
      };
    case 'challenge_completed':
      return {
        challengeName: 'Weekly Warrior',
        challengeId: 'chl_weekly_warrior',
        challengeDescription: 'Complete 10 daily quests in a single week.',
        rewardXp: 500,
        userId: 'usr_123',
        userName: 'Ronak',
        externalId: 'ext_ronak_99',
      };
    default:
      return {
        userId: 'usr_123',
        userName: 'Ronak',
        externalId: 'ext_ronak_99',
      };
  }
}

/**
 * Builds context object from an IntegrationMessage.
 */
export function getContextFromMessage(message: IntegrationMessage): Record<string, unknown> {
  const meta = message.metadata || {};
  const xpVal = meta.amount !== undefined ? meta.amount : (meta.xp !== undefined ? meta.xp : '');
  const currentXpVal = meta.currentXp !== undefined ? meta.currentXp : (meta.totalXp !== undefined ? meta.totalXp : (meta.newBalance !== undefined ? meta.newBalance : ''));
  const currentLevelVal = meta.currentLevel !== undefined ? meta.currentLevel : (meta.level !== undefined ? meta.level : '');
  const levelNameVal = meta.levelName !== undefined ? meta.levelName : '';
  const xpToNextLevelVal = meta.xpToNextLevel !== undefined ? meta.xpToNextLevel : '';
  const progressPercentVal = meta.progressPercent !== undefined ? (String(meta.progressPercent).endsWith('%') ? meta.progressPercent : `${meta.progressPercent}%`) : '';

  return {
    ...meta,
    userId: message.userId,
    userName: message.userName || (meta.userName as string) || message.userId || 'User',
    externalId: (meta.externalId as string) || message.userId,
    xp: xpVal,
    currentXp: currentXpVal,
    currentLevel: currentLevelVal,
    levelName: levelNameVal,
    xpToNextLevel: xpToNextLevelVal,
    progressPercent: progressPercentVal,
    achievementName: meta.achievementName || meta.name || message.title,
    achievementId: meta.achievementId || '',
    achievementDescription: meta.achievementDescription || meta.description || message.body || '',
    badgeIconUrl: meta.badgeIconUrl || meta.iconUrl || '',
    unlockedAt: meta.unlockedAt || new Date().toLocaleTimeString(),
    newLevel: meta.newLevel !== undefined ? meta.newLevel : (meta.level !== undefined ? meta.level : ''),
    previousLevel: meta.previousLevel !== undefined ? meta.previousLevel : '',
    requiredXp: meta.requiredXp !== undefined ? meta.requiredXp : '',
    challengeName: meta.challengeName || meta.name || message.title,
    challengeId: meta.challengeId || '',
    challengeDescription: meta.challengeDescription || meta.description || message.body || '',
    rewardXp: meta.rewardXp !== undefined ? meta.rewardXp : (meta.xpReward !== undefined ? meta.xpReward : ''),
  };
}

/**
 * Renders a Discord Payload given custom template or falls back to default template.
 */
export function buildDiscordEmbedFromTemplate(
  eventType: string,
  customTemplate?: DiscordEmbedTemplate | null,
  context?: Record<string, unknown>
): DiscordPayload {
  const sampleCtx = context || getSampleContext(eventType);
  const template = customTemplate || DEFAULT_DISCORD_TEMPLATES[eventType] || DEFAULT_DISCORD_TEMPLATES.xp_awarded;

  const title = template.title ? renderTemplateString(template.title, sampleCtx) : undefined;
  const description = template.description ? renderTemplateString(template.description, sampleCtx) : undefined;
  const url = template.url ? renderTemplateString(template.url, sampleCtx) : undefined;
  const footerText = template.footerText ? renderTemplateString(template.footerText, sampleCtx) : undefined;
  const authorName = template.authorName ? renderTemplateString(template.authorName, sampleCtx) : undefined;
  const thumbnailUrl = template.thumbnailUrl ? renderTemplateString(template.thumbnailUrl, sampleCtx) : undefined;
  const imageUrl = template.imageUrl ? renderTemplateString(template.imageUrl, sampleCtx) : undefined;

  const fields = template.fields?.map((f) => ({
    name: renderTemplateString(f.name, sampleCtx),
    value: renderTemplateString(f.value, sampleCtx),
    inline: f.inline,
  }));

  const embed: DiscordEmbed = {
    title,
    description,
    url,
    color: parseColor(template.color),
    author: authorName ? { name: authorName } : undefined,
    footer: footerText ? { text: footerText } : undefined,
    thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
    image: imageUrl ? { url: imageUrl } : undefined,
    fields: fields && fields.length > 0 ? fields : undefined,
    timestamp: new Date().toISOString(),
  };

  return { embeds: [embed] };
}

export function buildDiscordEmbed(message: IntegrationMessage, customTemplates?: Record<string, DiscordEmbedTemplate>): DiscordPayload {
  const context = getContextFromMessage(message);
  const customTemplate = customTemplates ? customTemplates[message.eventType] : null;
  return buildDiscordEmbedFromTemplate(message.eventType, customTemplate, context);
}

export function buildDiscordTestEmbed(projectName: string): DiscordPayload {
  return {
    embeds: [
      {
        title: '✅ Gami Discord Integration Test',
        description: `Successfully connected Discord notification channel for **${sanitizeDiscordContent(
          projectName
        )}**!`,
        color: 0x10b981,
        fields: [
          { name: 'Status', value: 'Active & Verified', inline: true },
          { name: 'Timestamp', value: new Date().toLocaleTimeString(), inline: true },
        ],
        footer: { text: 'Gami Gamification Engine' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
