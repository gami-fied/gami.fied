import { randomUUID } from 'crypto';
import { achievements, cosmetics, createDemoWorkspace, currencies, db, deleteAllDemos, lootBoxes, member, organizations, projectMembers, projects, rewards, rules, runMigrations, users } from '@gami/database';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { checkDesign } from '../environments/design.js';

describe('design files', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let ownerCookie: string;
  let memberCookie: string;
  let sourceProjectId: string;
  const suffix = randomUUID().slice(0, 8);
  const targetOrgId = `org_design_${suffix}`;
  const targetProjectId = `prj_design_${suffix}`;
  const shopProjectId = `prj_design_shop_${suffix}`;

  const signUp = async (label: string) => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `${label}_${randomUUID()}@example.com`, password: 'Password123!', name: label } });
    return { cookie: res.headers['set-cookie'] as string, id: JSON.parse(res.payload).user.id as string };
  };
  const as = (cookie: string) => async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie }, payload: payload as object });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null, headers: res.headers };
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    const owner = await signUp('design_owner');
    ownerCookie = owner.cookie;
    // The source: a seeded demo the owner owns, as "Keep this setup" would export.
    const demo = await createDemoWorkspace({ ownerUserId: owner.id, ttlHours: 1, seed: 11 });
    sourceProjectId = demo.projectId;
    // The target: an empty project in an ordinary organization.
    await db.insert(organizations).values({ id: targetOrgId, name: 'Design target', slug: `design-${suffix}` });
    await db.insert(projects).values({ id: targetProjectId, organizationId: targetOrgId, name: 'Target', slug: 'target' });
    await db.insert(projects).values({ id: shopProjectId, organizationId: targetOrgId, name: 'Shop', slug: 'shop' });
    await db.insert(member).values({ id: `mem_design_${suffix}`, organizationId: targetOrgId, userId: owner.id, role: 'owner', createdAt: new Date() });
    const plain = await signUp('design_member');
    memberCookie = plain.cookie;
    await db.insert(member).values({ id: `mem_design_m_${suffix}`, organizationId: targetOrgId, userId: plain.id, role: 'member', createdAt: new Date() });
    // A member who can see the project, so the test reaches the owner-and-admin check.
    await db.insert(projectMembers).values({ id: `pm_design_${suffix}`, projectId: targetProjectId, userId: plain.id });
  });

  afterAll(async () => {
    // Currencies are kept while anything is priced in them, so what refers to one goes first.
    const ours = [targetProjectId, shopProjectId];
    await db.delete(lootBoxes).where(inArray(lootBoxes.projectId, ours));
    await db.delete(cosmetics).where(inArray(cosmetics.projectId, ours));
    await db.delete(rewards).where(inArray(rewards.projectId, ours));
    await db.delete(organizations).where(eq(organizations.id, targetOrgId));
    await deleteAllDemos();
    await db.delete(users).where(eq(users.name, 'design_member'));
    await app.close();
  });

  it('exports a design with no player data, as a file', async () => {
    const res = await as(ownerCookie)('GET', `/api/projects/${sourceProjectId}/design`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="lingo-leap-design\.json"/);
    expect(res.body.format).toBe('gami.fied/design');
    expect(res.body.items.rules).toHaveLength(6);
    expect(res.body.items.rewards[0]).toHaveProperty('currency', 'gems');
    expect(Object.keys(res.body.items)).not.toContain('users');
    // No project IDs travel with it.
    expect(JSON.stringify(res.body)).not.toContain(sourceProjectId);
  });

  it('previews, imports, and then has nothing left to change', async () => {
    const { body: design } = await as(ownerCookie)('GET', `/api/projects/${sourceProjectId}/design`);
    const preview = await as(ownerCookie)('POST', `/api/projects/${targetProjectId}/design/preview`, { design });
    expect(preview.status).toBe(200);
    expect(preview.body.summary.new).toBeGreaterThan(15);
    expect(preview.body.summary.changed).toBe(0);
    expect(preview.body.warnings).toEqual([]);

    const imported = await as(ownerCookie)('POST', `/api/projects/${targetProjectId}/design`, { design });
    expect(imported.status).toBe(200);
    expect(imported.body.created).toBe(preview.body.summary.new);

    const again = await as(ownerCookie)('POST', `/api/projects/${targetProjectId}/design/preview`, { design });
    expect(again.body.summary.new).toBe(0);
    expect(again.body.summary.changed).toBe(0);

    // The rule's badge points at the target's own achievement, and the reward at its own currency.
    const [badgeRule] = await db.select().from(rules).where(eq(rules.projectId, targetProjectId)).then((rows) => rows.filter((r) => r.name === 'Perfect score bonus'));
    const action = (badgeRule!.actions as { type: string; params: Record<string, unknown> }[]).find((a) => a.type === 'award_achievement')!;
    expect(action.params['achievementKey']).toBe('perfect_score');
    expect(action.params['achievementId']).toMatch(/^ach_/);
    const stocked = (await db.select().from(rewards).where(eq(rewards.projectId, targetProjectId))).find((r) => r.key === 'premium_month');
    expect(stocked?.stock).toBe(10);
  });

  it('refuses files that are not designs, or whose rules would not save', async () => {
    const notDesign = await as(ownerCookie)('POST', `/api/projects/${targetProjectId}/design/preview`, { design: { hello: 'world' } });
    expect(notDesign.status).toBe(400);
    expect(notDesign.body.message).toMatch(/not a Gami\.Fied design file/);

    const badRule = checkDesign({ format: 'gami.fied/design', version: 1, items: { rules: [{ name: 'Broken', trigger: 'x', actions: [{ type: 'award_xp', params: { amount: 0 } }] }] } });
    expect(badRule.design).toBeNull();
    expect(badRule.errors[0]).toMatch(/Rule "Broken": award_xp amount/);

    const noKey = checkDesign({ format: 'gami.fied/design', version: 1, items: { achievements: [{ name: 'No key' }] } });
    expect(noKey.errors).toContain('achievements item 1 has no key.');
  });

  it('warns about badges a rule awards that nothing defines', async () => {
    const design = {
      format: 'gami.fied/design',
      version: 1,
      items: { rules: [{ name: 'Orphan', trigger: 'x', enabled: true, actions: [{ type: 'award_achievement', params: { achievementKey: 'nowhere' } }] }] },
    };
    const preview = await as(ownerCookie)('POST', `/api/projects/${targetProjectId}/design/preview`, { design });
    expect(preview.body.warnings[0]).toMatch(/"nowhere"/);
  });

  it('carries cosmetics and boxes, with their currency and badge pointing at the target', async () => {
    const shop = {
      format: 'gami.fied/design',
      version: 1,
      items: {
        currencies: [{ key: 'coins', name: 'Coins', symbol: '🪙', enabled: true }],
        achievements: [{ key: 'perfect_day', name: 'Perfect day', description: null, iconUrl: null, enabled: true, criteria: null, tiers: null, hidden: false }],
        cosmetics: [
          { key: 'early_bird', name: 'Early Bird', description: null, kind: 'title', imageUrl: null, currency: 'coins', cost: 40, achievement: null, enabled: true },
          { key: 'golden_frame', name: 'Golden frame', description: null, kind: 'frame', imageUrl: null, currency: null, cost: null, achievement: 'perfect_day', enabled: true },
        ],
        boxes: [
          {
            key: 'daily_box',
            name: 'Daily box',
            description: null,
            imageUrl: null,
            kind: 'box',
            currency: 'coins',
            cost: 25,
            guaranteeAfter: 5,
            dailyLimit: 3,
            items: [
              { id: 'itm_coins', name: 'Coins back', weight: 70, rare: false, prizes: [{ type: 'currency', currency: 'coins', amount: 30 }] },
              { id: 'itm_title', name: 'Rare title', weight: 5, rare: true, prizes: [{ type: 'cosmetic', cosmetic: 'early_bird' }] },
            ],
            enabled: true,
          },
        ],
      },
    };
    const preview = await as(ownerCookie)('POST', `/api/projects/${shopProjectId}/design/preview`, { design: shop });
    expect(preview.status).toBe(200);
    expect(preview.body.warnings).toEqual([]);
    expect(preview.body.data.filter((item: { kind: string }) => ['cosmetics', 'boxes'].includes(item.kind))).toHaveLength(3);

    const imported = await as(ownerCookie)('POST', `/api/projects/${shopProjectId}/design`, { design: shop });
    expect(imported.status).toBe(200);
    expect(imported.body.created).toBe(5);

    const [coins] = await db.select().from(currencies).where(eq(currencies.projectId, shopProjectId));
    const [badge] = await db.select().from(achievements).where(eq(achievements.projectId, shopProjectId));
    const saved = await db.select().from(cosmetics).where(eq(cosmetics.projectId, shopProjectId));
    expect(saved.find((c) => c.key === 'early_bird')).toMatchObject({ currencyId: coins!.id, cost: 40, achievementId: null });
    expect(saved.find((c) => c.key === 'golden_frame')).toMatchObject({ currencyId: null, achievementId: badge!.id });
    const [box] = await db.select().from(lootBoxes).where(eq(lootBoxes.projectId, shopProjectId));
    expect(box).toMatchObject({ key: 'daily_box', currencyId: coins!.id, cost: 25, dailyLimit: 3 });

    // Exported again, it reads the same as the file, so a second import has nothing to do.
    const { body: exported } = await as(ownerCookie)('GET', `/api/projects/${shopProjectId}/design`);
    expect(exported.items.boxes[0]).toMatchObject({ key: 'daily_box', currency: 'coins' });
    expect(exported.items.cosmetics.map((c: { key: string }) => c.key).sort()).toEqual(['early_bird', 'golden_frame']);
    const again = await as(ownerCookie)('POST', `/api/projects/${shopProjectId}/design/preview`, { design: exported });
    expect(again.body.summary.new).toBe(0);
    expect(again.body.summary.changed).toBe(0);
  });

  it('refuses broken cosmetics and boxes, and warns about prizes nothing defines', async () => {
    const half = checkDesign({ format: 'gami.fied/design', version: 1, items: { cosmetics: [{ key: 'cheap', name: 'Cheap', currency: 'coins' }] } });
    expect(half.errors[0]).toMatch(/Cosmetic "cheap": a cosmetic for sale needs both a currency and a cost/);
    const noRare = checkDesign({
      format: 'gami.fied/design',
      version: 1,
      items: { boxes: [{ key: 'b', name: 'B', guaranteeAfter: 3, items: [{ name: 'XP', weight: 1, prizes: [{ type: 'xp', amount: 5 }] }] }] },
    });
    expect(noRare.errors[0]).toMatch(/Box "b": a guarantee needs at least one item marked rare/);

    const orphan = {
      format: 'gami.fied/design',
      version: 1,
      items: { boxes: [{ key: 'lonely', name: 'Lonely', items: [{ name: 'Hat', weight: 1, prizes: [{ type: 'cosmetic', cosmetic: 'no_such_hat' }] }] }] },
    };
    const preview = await as(ownerCookie)('POST', `/api/projects/${targetProjectId}/design/preview`, { design: orphan });
    expect(preview.body.warnings).toEqual(['The box "lonely" uses the cosmetic "no_such_hat", which is in neither the file nor this project.']);
  });

  it('is for owners and admins only', async () => {
    expect((await as(memberCookie)('GET', `/api/projects/${targetProjectId}/design`)).status).toBe(403);
    expect((await as(memberCookie)('POST', `/api/projects/${targetProjectId}/design`, { design: {} })).status).toBe(403);
  });
});
