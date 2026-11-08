import { dependentsOf, featureDefinition, FEATURES, requirementsOf, resolveFeatures, type FeatureKey } from '@gami/database';

export interface FeatureChange {
  feature: FeatureKey;
  enabled: boolean;
}

export type PlanResult =
  | { ok: true; changes: FeatureChange[]; alsoOff: FeatureKey[]; alsoOn: FeatureKey[] }
  | { ok: false; status: number; code: 'BASE_FEATURE' | 'UNKNOWN_FEATURE' | 'INSTANCE_OFF'; message: string; blockedBy?: FeatureKey[] };

const nameOf = (key: string) => featureDefinition(key)?.name ?? key;

/**
 * Works out every setting that has to change for one feature to be turned on or off, so the
 * result is always a set of features that can actually run:
 *
 * - Turning a feature off turns off everything that needs it.
 * - Turning one on turns on everything it needs.
 * - Base features can never be turned off.
 * - At organization level a feature can only be on if the instance allows it.
 *
 * `instance` and `org` are the stored settings; `org` is absent when planning for the instance.
 */
export function planFeatureChange(
  key: string,
  enabled: boolean,
  instance: Map<string, boolean>,
  org?: Map<string, boolean>
): PlanResult {
  const def = featureDefinition(key);
  if (!def) return { ok: false, status: 404, code: 'UNKNOWN_FEATURE', message: `There is no feature "${key}"` };
  if (def.base && !enabled) {
    return { ok: false, status: 400, code: 'BASE_FEATURE', message: `${def.name} is part of the base platform and cannot be turned off` };
  }

  const atInstance = resolveFeatures(instance);
  const current = org ? resolveFeatures(instance, org) : atInstance;
  const changes: FeatureChange[] = [];

  if (!enabled) {
    const alsoOff = dependentsOf(key).filter((dependent) => current[dependent as FeatureKey]) as FeatureKey[];
    for (const feature of [key, ...alsoOff]) changes.push({ feature: feature as FeatureKey, enabled: false });
    return { ok: true, changes, alsoOff, alsoOn: [] };
  }

  const needed = [key, ...requirementsOf(key)];
  if (org) {
    const blockedBy = needed.filter((feature) => !atInstance[feature as FeatureKey]) as FeatureKey[];
    if (blockedBy.length > 0) {
      return {
        ok: false,
        status: 409,
        code: 'INSTANCE_OFF',
        blockedBy,
        message: `${blockedBy.map(nameOf).join(', ')} ${blockedBy.length === 1 ? 'is' : 'are'} off for the whole instance, so it cannot be turned on for one organization`,
      };
    }
  }
  const alsoOn = requirementsOf(key).filter((need) => !current[need as FeatureKey] && !featureDefinition(need)?.base) as FeatureKey[];
  for (const feature of [key, ...alsoOn]) changes.push({ feature: feature as FeatureKey, enabled: true });
  return { ok: true, changes, alsoOff: [], alsoOn };
}

/** The catalogue with each feature's state, for the admin screens. */
export function describeFeatures(instance: Map<string, boolean>, org?: Map<string, boolean>, overrideCounts: Map<string, number> = new Map()) {
  const atInstance = resolveFeatures(instance);
  const effective = org ? resolveFeatures(instance, org) : atInstance;
  return FEATURES.map((feature) => ({
    key: feature.key,
    name: feature.name,
    description: feature.description,
    category: feature.category,
    base: Boolean((feature as { base?: boolean }).base),
    requires: [...feature.requires],
    requiredBy: dependentsOf(feature.key).filter((dependent) => FEATURES.find((item) => item.key === dependent)?.requires.some((need) => need === feature.key)),
    instanceEnabled: atInstance[feature.key],
    enabled: effective[feature.key],
    override: org ? (org.has(feature.key) ? org.get(feature.key)! : null) : null,
    orgOverrides: overrideCounts.get(feature.key) ?? 0,
  }));
}
