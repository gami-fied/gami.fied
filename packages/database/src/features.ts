import { eq, isNull, or } from 'drizzle-orm';
import { db } from './client.js';
import { featureSettings, organizationPolicies } from './schema/platform-controls.js';
import { projects } from './schema/projects.js';

/**
 * Every feature an administrator can turn on or off, for the whole instance or one organization.
 *
 * `base` features are what the platform is built on, so they can never be turned off. `requires`
 * lists the features this one cannot work without: turning one of those off turns this off too,
 * and turning this on turns them on.
 */
export interface FeatureDefinition {
  key: string;
  name: string;
  description: string;
  category: 'Core' | 'Progression' | 'Competition' | 'Economy' | 'Community' | 'Messaging' | 'Integrations' | 'Platform';
  base?: boolean;
  requires: string[];
  /** Off unless an administrator turns it on. */
  defaultOff?: boolean;
}

export const FEATURES = [
  { key: 'events', name: 'Events', category: 'Core', base: true, requires: [], description: 'Receiving events from apps and servers. Everything else runs on them.' },
  { key: 'users', name: 'Players', category: 'Core', base: true, requires: [], description: 'The people who play, with their profiles and history.' },
  { key: 'rules', name: 'Rules', category: 'Core', base: true, requires: ['events'], description: 'Rules that react to events. Drafts, history and backtests come with them.' },
  { key: 'xp', name: 'XP', category: 'Core', base: true, requires: ['users'], description: 'Points that rank players, with a full ledger.' },

  { key: 'levels', name: 'Levels', category: 'Progression', requires: ['xp'], description: 'Levels reached by XP.' },
  { key: 'achievements', name: 'Achievements', category: 'Progression', requires: ['rules'], description: 'Badges, with tiers and progress.' },
  { key: 'streaks', name: 'Streaks', category: 'Progression', requires: ['events'], description: 'Daily and weekly streaks with freezes.' },
  { key: 'challenges', name: 'Challenges', category: 'Progression', requires: ['events', 'xp'], description: 'Quests with steps and repeats.' },
  { key: 'boosts_limits', name: 'Boosts & limits', category: 'Progression', requires: ['rules', 'xp'], description: 'XP multipliers, caps, cooldowns and hiding people from rankings.' },

  { key: 'leaderboards', name: 'Leaderboards', category: 'Competition', requires: ['xp'], description: 'Rankings by period, with search.' },
  { key: 'segments', name: 'Segments', category: 'Competition', requires: ['users'], description: 'Saved groups of players, and boards for them, for teams and for countries.' },
  { key: 'leagues', name: 'Leagues', category: 'Competition', requires: ['leaderboards'], description: 'Tiers of small groups with promotion and relegation.' },

  { key: 'wallets', name: 'Currencies & wallets', category: 'Economy', requires: ['users'], description: 'Points people save and spend, with expiry.' },
  { key: 'store', name: 'Reward store', category: 'Economy', requires: ['wallets'], description: 'Rewards bought with currency, with stock and codes.' },

  { key: 'social', name: 'Friends & kudos', category: 'Community', requires: ['users'], description: 'Friends, kudos, the activity feed and share cards.' },
  { key: 'referrals', name: 'Invites', category: 'Community', requires: ['xp'], description: 'Invite codes with rewards for both sides.' },

  { key: 'campaigns', name: 'Campaigns', category: 'Messaging', requires: ['users'], description: 'Streak reminders, weekly recaps and win-back emails.' },
  { key: 'realtime', name: 'Live updates', category: 'Messaging', requires: ['users'], description: 'Instant toasts and live boards over a stream.' },
  { key: 'push', name: 'Push notifications', category: 'Messaging', requires: ['users'], description: 'Phones registered for Apple and Google push.' },

  { key: 'webhooks', name: 'Webhooks', category: 'Integrations', requires: ['events'], description: 'Signed callbacks to your servers.' },
  { key: 'integrations', name: 'Slack, Teams & HTTP', category: 'Integrations', requires: ['events'], description: 'Messages to chat tools and any HTTP endpoint.' },
  { key: 'connectors', name: 'Connectors', category: 'Integrations', requires: ['events'], description: 'Events from Segment, RudderStack, Stripe and GitHub.' },

  { key: 'analytics', name: 'Analytics', category: 'Platform', requires: ['events'], description: 'Reports on activity and retention.' },
  { key: 'environments', name: 'Environments & promotion', category: 'Platform', requires: ['rules'], description: 'Staging projects and copying their design to production.' },
  { key: 'expressions', name: 'Expression conditions', category: 'Platform', requires: ['rules'], description: 'JSONLogic conditions in rules.' },
  { key: 'plugins', name: 'Plugin actions', category: 'Platform', requires: ['rules'], description: 'Rule actions from server plugins.' },
] as const satisfies readonly FeatureDefinition[];

export type FeatureKey = (typeof FEATURES)[number]['key'];

const BY_KEY = new Map<string, FeatureDefinition>(FEATURES.map((feature) => [feature.key, feature]));

export function isFeatureKey(key: string): key is FeatureKey {
  return BY_KEY.has(key);
}

export function featureDefinition(key: string): FeatureDefinition | undefined {
  return BY_KEY.get(key);
}

/** Everything a feature needs, directly or through what it needs. */
export function requirementsOf(key: string): string[] {
  const found = new Set<string>();
  const walk = (current: string) => {
    for (const need of BY_KEY.get(current)?.requires ?? []) {
      if (!found.has(need)) {
        found.add(need);
        walk(need);
      }
    }
  };
  walk(key);
  return [...found];
}

/** Every feature that needs this one, directly or through another. */
export function dependentsOf(key: string): string[] {
  return FEATURES.filter((feature) => requirementsOf(feature.key).includes(key)).map((feature) => feature.key);
}

/**
 * Applies the stored settings, then turns off anything whose requirements are off, so an
 * inconsistent set of rows (from before a dependency was added, say) can never switch on a feature
 * that cannot work.
 */
export function resolveFeatures(instance: Map<string, boolean>, org: Map<string, boolean> = new Map()): Record<FeatureKey, boolean> {
  const raw = new Map<string, boolean>();
  for (const feature of FEATURES) {
    const def = feature as FeatureDefinition;
    if (def.base) {
      raw.set(feature.key, true);
      continue;
    }
    const atInstance = instance.get(feature.key) ?? !def.defaultOff;
    // An organization can only narrow what the instance allows.
    raw.set(feature.key, atInstance && (org.get(feature.key) ?? true));
  }
  const result = {} as Record<FeatureKey, boolean>;
  for (const feature of FEATURES) {
    result[feature.key] = Boolean(raw.get(feature.key)) && requirementsOf(feature.key).every((need) => raw.get(need));
  }
  return result;
}

// ---------- Reading settings, with a short cache because every request asks ----------

const TTL_MS = 30_000;
const featureCache = new Map<string, { at: number; value: Record<FeatureKey, boolean> }>();
const orgOfProject = new Map<string, { at: number; orgId: string | null }>();

/** Drops cached settings, after an administrator changes them. Other processes catch up within 30 seconds. */
export function clearFeatureCache(): void {
  featureCache.clear();
  orgOfProject.clear();
  policyCache.clear();
}

async function settingRows(orgId: string | null) {
  return db
    .select({ organizationId: featureSettings.organizationId, feature: featureSettings.feature, enabled: featureSettings.enabled })
    .from(featureSettings)
    .where(orgId ? or(isNull(featureSettings.organizationId), eq(featureSettings.organizationId, orgId)) : isNull(featureSettings.organizationId));
}

/** The features on for an organization, or for the instance when no organization is given. */
export async function featuresFor(orgId: string | null): Promise<Record<FeatureKey, boolean>> {
  const cacheKey = orgId ?? '*';
  const hit = featureCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const rows = await settingRows(orgId);
  const instance = new Map(rows.filter((row) => row.organizationId === null).map((row) => [row.feature, row.enabled]));
  const org = new Map(rows.filter((row) => row.organizationId !== null).map((row) => [row.feature, row.enabled]));
  const value = resolveFeatures(instance, org);
  featureCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

async function organizationOf(projectId: string): Promise<string | null> {
  const hit = orgOfProject.get(projectId);
  if (hit && Date.now() - hit.at < TTL_MS * 10) return hit.orgId;
  const [row] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
  const orgId = row?.organizationId ?? null;
  orgOfProject.set(projectId, { at: Date.now(), orgId });
  return orgId;
}

export async function isFeatureEnabled(orgId: string | null, key: FeatureKey): Promise<boolean> {
  return (await featuresFor(orgId))[key];
}

/** For the worker, which knows the project an event belongs to. */
export async function isFeatureEnabledForProject(projectId: string, key: FeatureKey): Promise<boolean> {
  return isFeatureEnabled(await organizationOf(projectId), key);
}

// ---------- Organization policies ----------

export interface EffectivePolicy {
  maxProjects: number | null;
  maxMembers: number | null;
  allowedEmailDomains: string[];
  apiKeyMaxLifetimeDays: number | null;
  apiIpAllowlist: string[];
  requireAllowedOrigins: boolean;
  eventsPerMinute: number | null;
}

export const POLICY_FIELDS = ['maxProjects', 'maxMembers', 'allowedEmailDomains', 'apiKeyMaxLifetimeDays', 'apiIpAllowlist', 'requireAllowedOrigins', 'eventsPerMinute'] as const;

const policyCache = new Map<string, { at: number; value: EffectivePolicy }>();

/** An organization's rules: its own values where set, the instance defaults otherwise. */
export async function policyFor(orgId: string | null): Promise<EffectivePolicy> {
  const cacheKey = orgId ?? '*';
  const hit = policyCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const rows = await db
    .select()
    .from(organizationPolicies)
    .where(orgId ? or(isNull(organizationPolicies.organizationId), eq(organizationPolicies.organizationId, orgId)) : isNull(organizationPolicies.organizationId));
  const instance = rows.find((row) => row.organizationId === null);
  const own = rows.find((row) => row.organizationId !== null);
  const pick = <K extends (typeof POLICY_FIELDS)[number]>(key: K) => own?.[key] ?? instance?.[key] ?? null;
  const value: EffectivePolicy = {
    maxProjects: pick('maxProjects'),
    maxMembers: pick('maxMembers'),
    allowedEmailDomains: (pick('allowedEmailDomains') as string[] | null) ?? [],
    apiKeyMaxLifetimeDays: pick('apiKeyMaxLifetimeDays'),
    apiIpAllowlist: (pick('apiIpAllowlist') as string[] | null) ?? [],
    requireAllowedOrigins: Boolean(pick('requireAllowedOrigins')),
    eventsPerMinute: pick('eventsPerMinute'),
  };
  policyCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
