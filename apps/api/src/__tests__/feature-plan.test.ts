import { dependentsOf, FEATURES, requirementsOf, resolveFeatures } from '@gami/database';
import { describe, expect, it } from 'vitest';
import { featureForPlayerPath, featureForProjectRoute } from '../authorization/features.js';
import { ipAllowed } from '../authorization/index.js';
import { planFeatureChange } from '../admin/controls/plan.js';

const map = (entries: Record<string, boolean> = {}) => new Map(Object.entries(entries));

describe('the feature catalogue', () => {
  it('only depends on features that exist, without cycles', () => {
    const keys = new Set(FEATURES.map((feature) => feature.key));
    for (const feature of FEATURES) {
      for (const need of feature.requires) expect(keys.has(need), `${feature.key} needs ${need}`).toBe(true);
      expect(requirementsOf(feature.key)).not.toContain(feature.key);
    }
  });

  it('follows chains both ways', () => {
    expect(requirementsOf('store')).toEqual(expect.arrayContaining(['wallets', 'users']));
    expect(requirementsOf('leagues')).toEqual(expect.arrayContaining(['leaderboards', 'xp', 'users']));
    expect(dependentsOf('wallets')).toEqual(['store']);
    expect(dependentsOf('leaderboards')).toEqual(['leagues']);
  });

  it('keeps base features on and turns off anything whose needs are off', () => {
    const resolved = resolveFeatures(map({ events: false, leaderboards: false }));
    expect(resolved.events).toBe(true);
    expect(resolved.leaderboards).toBe(false);
    expect(resolved.leagues).toBe(false); // needs leaderboards, even with no row of its own
    expect(resolved.store).toBe(true);
  });

  it('lets an organization narrow, never widen, what the instance allows', () => {
    const instance = map({ store: false });
    expect(resolveFeatures(instance, map({ store: true })).store).toBe(false);
    expect(resolveFeatures(map(), map({ social: false })).social).toBe(false);
    expect(resolveFeatures(map(), map({ wallets: false })).store).toBe(false);
  });
});

describe('planning a change', () => {
  it('refuses to turn off a base feature', () => {
    const plan = planFeatureChange('rules', false, map());
    expect(plan).toMatchObject({ ok: false, code: 'BASE_FEATURE' });
  });

  it('turns off what depends on a feature, and only what is on', () => {
    const plan = planFeatureChange('wallets', false, map());
    expect(plan).toMatchObject({ ok: true, alsoOff: ['store'] });
    const already = planFeatureChange('wallets', false, map({ store: false }));
    expect(already).toMatchObject({ ok: true, alsoOff: [] });
  });

  it('turns on what a feature needs', () => {
    const plan = planFeatureChange('leagues', true, map({ leagues: false, leaderboards: false }));
    expect(plan).toMatchObject({ ok: true, alsoOn: ['leaderboards'] });
    expect(plan.ok && plan.changes.map((change) => change.feature)).toEqual(['leagues', 'leaderboards']);
  });

  it('will not turn something on for one organization that the instance has off', () => {
    const plan = planFeatureChange('store', true, map({ wallets: false, store: false }), map());
    expect(plan).toMatchObject({ ok: false, code: 'INSTANCE_OFF', blockedBy: ['store', 'wallets'] });
  });

  it('rejects unknown features', () => {
    expect(planFeatureChange('teleport', true, map())).toMatchObject({ ok: false, code: 'UNKNOWN_FEATURE' });
  });
});

describe('routes and addresses', () => {
  it('maps routes to the features they belong to', () => {
    expect(featureForProjectRoute('/api/projects/:projectId/rewards/:rewardId')).toBe('store');
    expect(featureForProjectRoute('/api/projects/:projectId/users/:userId/wallets')).toBe('wallets');
    expect(featureForProjectRoute('/api/projects/:projectId/users/:userId/xp')).toBeNull();
    expect(featureForProjectRoute('/api/projects/:projectId/rules')).toBeNull();
    expect(featureForPlayerPath('/v1/me/leagues?x=1')).toBe('leagues');
    expect(featureForPlayerPath('/v1/me/achievements/first/share')).toBe('social');
    expect(featureForPlayerPath('/v1/me/achievements')).toBe('achievements');
    expect(featureForPlayerPath('/v1/me')).toBeNull();
  });

  it('checks addresses against single addresses and ranges', () => {
    expect(ipAllowed('10.1.2.3', [])).toBe(true);
    expect(ipAllowed('203.0.113.7', ['203.0.113.0/24'])).toBe(true);
    expect(ipAllowed('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(ipAllowed('198.51.100.1', ['203.0.113.0/24'])).toBe(false);
    expect(ipAllowed('2001:db8::5', ['2001:db8::/32'])).toBe(true);
    expect(ipAllowed('not-an-ip', ['203.0.113.0/24'])).toBe(false);
  });
});
