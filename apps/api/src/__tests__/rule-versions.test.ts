import { randomUUID } from 'crypto';
import { db, member, organizations, projects, runMigrations } from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('rule drafts and versions', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let userId: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_rv_${suffix}`;
  const projectId = `prj_rv_${suffix}`;
  const base = `/api/projects/${projectId}/rules`;

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: `${base}${url}`, headers: { cookie }, payload: payload as object });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
  };
  const award = (amount: number) => [{ type: 'award_xp', params: { amount } }];

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'RV', slug: `rv-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'RV', slug: 'rv' });
    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `rv_${randomUUID()}@example.com`, password: 'Password123!', name: 'RV' } });
    cookie = res.headers['set-cookie'] as string;
    userId = JSON.parse(res.payload).user.id;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId, role: 'owner', createdAt: new Date() });
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('keeps a history of every live change, with who made it', async () => {
    const created = await call('POST', '', { name: 'Lesson XP', trigger: 'lesson', actions: award(10) });
    const id = created.body.id as string;
    await call('PATCH', `/${id}`, { actions: award(20) });
    await call('PATCH', `/${id}`, { enabled: false });

    const { body } = await call('GET', `/${id}/versions`);
    expect(body.data.map((v: { version: number; note: string }) => [v.version, v.note])).toEqual([[3, 'Turned off'], [2, 'Edited'], [1, 'Created']]);
    expect(body.data[0].actor).toBe(userId);
    expect(body.data[1].snapshot.actions).toEqual(award(20));
    expect(body.data[2].snapshot.actions).toEqual(award(10));
  }, 120_000);

  it('saves a draft without changing what runs, then publishes it', async () => {
    const id = (await call('POST', '', { name: 'Draft me', trigger: 'lesson', actions: award(10) })).body.id as string;

    const draft = await call('PUT', `/${id}/draft`, { name: 'Draft me', trigger: 'lesson', actions: award(99) });
    expect(draft.status).toBe(200);
    expect(draft.body.actions).toEqual(award(10)); // still live as before
    expect(draft.body.draft.actions).toEqual(award(99));
    expect((await call('GET', `/${id}/versions`)).body.data).toHaveLength(1);

    const published = await call('POST', `/${id}/publish`, { note: 'Bigger reward' });
    expect(published.status).toBe(200);
    expect(published.body.rule).toMatchObject({ actions: award(99), draft: null });
    expect(published.body.version).toBe(2);
    expect((await call('GET', `/${id}/versions`)).body.data[0]).toMatchObject({ version: 2, note: 'Bigger reward' });
  }, 120_000);

  it('drops a waiting draft when the live rule is edited, but not when it is only switched off', async () => {
    const id = (await call('POST', '', { name: 'Both', trigger: 'lesson', actions: award(1) })).body.id as string;
    await call('PUT', `/${id}/draft`, { name: 'Both', trigger: 'lesson', actions: award(2) });
    expect((await call('PATCH', `/${id}`, { enabled: false })).body.draft).not.toBeNull();
    expect((await call('PATCH', `/${id}`, { actions: award(3) })).body.draft).toBeNull();
  }, 120_000);

  it('can discard a draft, and refuses to publish when there is none', async () => {
    const id = (await call('POST', '', { name: 'Discard', trigger: 'lesson', actions: award(5) })).body.id as string;
    await call('PUT', `/${id}/draft`, { name: 'Discard', trigger: 'lesson', actions: award(6) });
    expect((await call('DELETE', `/${id}/draft`)).body.draft).toBeNull();
    expect((await call('POST', `/${id}/publish`, {})).status).toBe(409);
  }, 120_000);

  it('rejects an invalid draft', async () => {
    const id = (await call('POST', '', { name: 'Invalid', trigger: 'lesson', actions: award(5) })).body.id as string;
    expect((await call('PUT', `/${id}/draft`, { name: 'x', trigger: 'lesson', actions: [{ type: 'send_pigeon' }] })).status).toBe(400);
    expect((await call('PUT', `/${id}/draft`, { name: '', trigger: 'lesson', actions: award(1) })).status).toBe(400);
  }, 120_000);

  it('restores an earlier version as a new one, keeping the history', async () => {
    const id = (await call('POST', '', { name: 'Roll back', trigger: 'lesson', actions: award(10) })).body.id as string;
    await call('PATCH', `/${id}`, { actions: award(500) }); // a mistake
    const restored = await call('POST', `/${id}/rollback`, { version: 1 });

    expect(restored.status).toBe(200);
    expect(restored.body.rule.actions).toEqual(award(10));
    expect(restored.body.version).toBe(3);
    const list = (await call('GET', `/${id}/versions`)).body.data as { version: number; note: string }[];
    expect(list.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(list[0]!.note).toBe('Restored version 1');

    expect((await call('POST', `/${id}/rollback`, { version: 42 })).status).toBe(404);
    expect((await call('POST', `/${id}/rollback`, {})).status).toBe(400);
  }, 120_000);

  it('returns 404 for a rule that is not in the project', async () => {
    expect((await call('GET', '/nope/versions')).status).toBe(404);
    expect((await call('PUT', '/nope/draft', { name: 'x', trigger: 'y', actions: award(1) })).status).toBe(404);
  });
});
