import { randomUUID } from 'crypto';
import { createDemoWorkspace, db, deleteAllDemos, member, organizations, projects, rewards, rules, runMigrations, users } from '@gami/database';
import { eq } from 'drizzle-orm';
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
    await db.insert(member).values({ id: `mem_design_${suffix}`, organizationId: targetOrgId, userId: owner.id, role: 'owner', createdAt: new Date() });
    const plain = await signUp('design_member');
    memberCookie = plain.cookie;
    await db.insert(member).values({ id: `mem_design_m_${suffix}`, organizationId: targetOrgId, userId: plain.id, role: 'member', createdAt: new Date() });
  });

  afterAll(async () => {
    await db.delete(rewards).where(eq(rewards.projectId, targetProjectId));
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

  it('is for owners and admins only', async () => {
    expect((await as(memberCookie)('GET', `/api/projects/${targetProjectId}/design`)).status).toBe(403);
    expect((await as(memberCookie)('POST', `/api/projects/${targetProjectId}/design`, { design: {} })).status).toBe(403);
  });
});
