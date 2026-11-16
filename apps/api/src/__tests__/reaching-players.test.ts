/**
 * Reaching players: the notification inbox, translations, and web push for browsers. Each is
 * tried through the API a player or a dashboard would use.
 */
import { createECDH, randomUUID } from 'crypto';
import {
  achievements,
  db,
  endUsers,
  member,
  notifications,
  organizations,
  projects,
  pushDevices,
  runMigrations,
  translations,
  userAchievements,
} from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('reaching players', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_rp_${suffix}`;
  const projectId = `prj_rp_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const parse = (res: { statusCode: number; payload: string }) => ({ status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null });
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    parse(await app.inject({ method, url: `${base}${url}`, headers: { cookie }, payload: payload as object }));
  const makeUser = async (label: string, extra: Partial<typeof endUsers.$inferInsert> = {}) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}`, ...extra });
    return id;
  };
  const tokenFor = async (userId: string, access: 'read' | 'write' = 'read') =>
    JSON.parse((await app.inject({ method: 'POST', url: '/v1/end-user-tokens', headers: { 'x-api-key': apiKey }, payload: { userId, access } })).payload).token as string;
  const me = async (token: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    parse(await app.inject({ method, url: `/v1/me${url}`, headers: { authorization: `Bearer ${token}`, ...headers }, payload: payload as object }));
  const notify = (userId: string, sourceId: string, at?: Date) =>
    db.insert(notifications).values({ id: `ntf_${randomUUID()}`, projectId, userId, type: 'level_up', title: `Level ${sourceId}`, message: 'You levelled up.', data: {}, sourceType: 'test', sourceId, ...(at ? { createdAt: at } : {}) });

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'RP', slug: `rp-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'RP', slug: 'rp' });
    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `rp_${randomUUID()}@example.com`, password: 'Password123!', name: 'RP' } });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId: JSON.parse(res.payload).user.id, role: 'owner', createdAt: new Date() });
    apiKey = (await createApiKey(projectId, 'Server', ['*'])).rawSecret;
    await db.insert(achievements).values({ id: `ach_rp_${suffix}`, projectId, key: 'first_lesson', name: 'First lesson', description: 'Finish a lesson.' });
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('the inbox', () => {
    it('shows what is unread, and lets a read-only token mark it read', async () => {
      const user = await makeUser('inbox');
      const other = await makeUser('inboxother');
      const now = Date.now();
      for (let i = 1; i <= 3; i++) await notify(user, String(i), new Date(now - (4 - i) * 60_000));
      await notify(other, 'theirs');
      const token = await tokenFor(user, 'read');

      const first = (await me(token, 'GET', '/notifications')).body;
      expect(first.unreadCount).toBe(3);
      expect(first.hasMore).toBe(false);
      expect(first.data.map((item: { title: string }) => item.title)).toEqual(['Level 3', 'Level 2', 'Level 1']);
      expect(first.data.every((item: { read: boolean; readAt: string | null }) => item.read === false && item.readAt === null)).toBe(true);
      expect((await me(token, 'GET', '/notifications/unread-count')).body).toEqual({ unreadCount: 3 });

      const one = await me(token, 'POST', `/notifications/${first.data[0].id}/read`);
      expect(one.status).toBe(200);
      expect(one.body).toEqual({ marked: 1, unreadCount: 2 });
      // Doing it again changes nothing.
      expect((await me(token, 'POST', `/notifications/${first.data[0].id}/read`)).body).toEqual({ marked: 0, unreadCount: 2 });

      const unread = (await me(token, 'GET', '/notifications?unread=true')).body;
      expect(unread.data.map((item: { title: string }) => item.title)).toEqual(['Level 2', 'Level 1']);
      const all = (await me(token, 'GET', '/notifications')).body.data;
      expect(all[0]).toMatchObject({ title: 'Level 3', read: true });
      expect(typeof all[0].readAt).toBe('string');

      expect((await me(token, 'POST', '/notifications/read-all')).body).toEqual({ marked: 2, unreadCount: 0 });
      expect((await me(token, 'GET', '/notifications/unread-count')).body).toEqual({ unreadCount: 0 });
    });

    it('never touches or shows another player\'s notifications', async () => {
      const user = await makeUser('inboxa');
      const other = await makeUser('inboxb');
      await notify(other, 'private');
      const [theirs] = await db.select().from(notifications).where(eq(notifications.userId, other));
      const token = await tokenFor(user);

      expect((await me(token, 'POST', `/notifications/${theirs!.id}/read`)).status).toBe(404);
      expect((await me(token, 'POST', '/notifications/read-all')).body.marked).toBe(0);
      expect((await db.select().from(notifications).where(eq(notifications.id, theirs!.id)))[0]!.readAt).toBeNull();
      expect((await me(token, 'GET', '/notifications')).body.data).toEqual([]);
    });

    it('pages back through older notifications', async () => {
      const user = await makeUser('inboxpage');
      const now = Date.now();
      for (let i = 1; i <= 5; i++) await notify(user, String(i), new Date(now - (6 - i) * 60_000));
      const token = await tokenFor(user);

      const page = (await me(token, 'GET', '/notifications?limit=2')).body;
      expect(page.data.map((item: { title: string }) => item.title)).toEqual(['Level 5', 'Level 4']);
      expect(page.hasMore).toBe(true);
      const next = (await me(token, 'GET', `/notifications?limit=2&before=${encodeURIComponent(page.data[1].createdAt)}`)).body;
      expect(next.data.map((item: { title: string }) => item.title)).toEqual(['Level 3', 'Level 2']);
      expect((await me(token, 'GET', '/notifications?before=yesterday')).status).toBe(400);
    });
  });

  describe('translations', () => {
    const save = (locale: string, entries: unknown[]) => call('PUT', '/translations', { locale, entries });

    it('saves text by language, tidies the tag, and refuses what cannot be translated', async () => {
      const saved = await save('pt_br', [
        { type: 'achievement', key: 'first_lesson', field: 'name', value: 'Primeira lição' },
        { type: 'achievement', key: 'first_lesson', field: 'description', value: 'Termine uma lição.' },
      ]);
      expect(saved.status).toBe(200);
      expect(saved.body).toEqual({ locale: 'pt-BR', saved: 2, removed: 0 });

      expect((await save('not a language', [{ type: 'achievement', key: 'x', field: 'name', value: 'y' }])).status).toBe(400);
      expect((await save('fr', [{ type: 'user', key: 'x', field: 'name', value: 'y' }])).status).toBe(400);
      expect((await save('fr', [{ type: 'achievement', key: 'x', field: 'secret', value: 'y' }])).status).toBe(400);

      const listed = (await call('GET', '/translations?locale=pt-BR')).body;
      expect(listed.locales).toEqual([{ locale: 'pt-BR', translated: 2 }]);
      expect(listed.data).toHaveLength(2);
      const source = listed.source as { type: string; key: string; field: string; source: string; placeholders?: string[] }[];
      expect(source.find((text) => text.type === 'achievement' && text.field === 'name')).toMatchObject({ key: 'first_lesson', source: 'First lesson' });
      expect(source.find((text) => text.type === 'notification' && text.key === 'achievement_unlocked' && text.field === 'message')?.placeholders).toContain('achievementName');
    });

    it('answers a player in their language, and in the original when there is no translation', async () => {
      const user = await makeUser('lang');
      await db.insert(userAchievements).values({ id: `uach_${randomUUID()}`, projectId, userId: user, achievementId: `ach_rp_${suffix}` });
      const token = await tokenFor(user);
      const name = async (headers: Record<string, string> = {}, query = '') => (await me(token, 'GET', `/achievements${query}`, undefined, headers)).body.data[0];

      expect(await name()).toMatchObject({ key: 'first_lesson', name: 'First lesson' });
      // The browser's own language is enough.
      expect(await name({ 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' })).toMatchObject({ name: 'Primeira lição', description: 'Termine uma lição.' });
      expect(await name({ 'accept-language': 'de-DE' })).toMatchObject({ name: 'First lesson' });
      // The address wins over the header.
      expect(await name({ 'accept-language': 'pt-BR' }, '?locale=fr')).toMatchObject({ name: 'First lesson' });
      expect(await name({}, '?locale=pt-BR')).toMatchObject({ name: 'Primeira lição' });
    });

    it('falls back from a regional language to the plain one', async () => {
      await save('es', [{ type: 'achievement', key: 'first_lesson', field: 'name', value: 'Primera lección' }]);
      const user = await makeUser('fallback');
      await db.insert(userAchievements).values({ id: `uach_${randomUUID()}`, projectId, userId: user, achievementId: `ach_rp_${suffix}` });
      const token = await tokenFor(user);
      const got = (await me(token, 'GET', '/achievements?locale=es-MX')).body.data[0];
      // The name comes from `es`. The description has no Spanish at all, so it stays as written.
      expect(got).toMatchObject({ name: 'Primera lección', description: 'Finish a lesson.' });
    });

    it('lets a player save their language, and writes their notifications in it', async () => {
      const user = await makeUser('saved');
      const token = await tokenFor(user, 'read');
      expect((await me(token, 'POST', '/locale', { locale: 'nonsense!' })).status).toBe(400);
      expect((await me(token, 'POST', '/locale', { locale: 'pt_BR' })).body).toEqual({ locale: 'pt-BR' });
      expect((await me(token, 'GET', '')).body.locale).toBe('pt-BR');

      await save('pt-BR', [
        { type: 'notification', key: 'achievement_unlocked', field: 'title', value: 'Conquista desbloqueada!' },
        { type: 'notification', key: 'achievement_unlocked', field: 'message', value: 'Você ganhou {{achievementName}}.' },
      ]);
      const data = { achievementId: `ach_rp_${suffix}`, achievementKey: 'first_lesson', achievementName: 'First lesson', iconUrl: null };
      await db.transaction((tx) => createNotificationIntent(tx, { projectId, userId: user, type: 'achievement_unlocked', data, sourceType: 'test', sourceId: 'pt' }));
      // Someone with no language gets the project's own wording.
      const plain = await makeUser('plain');
      await db.transaction((tx) => createNotificationIntent(tx, { projectId, userId: plain, type: 'achievement_unlocked', data, sourceType: 'test', sourceId: 'en' }));

      expect((await me(token, 'GET', '/notifications')).body.data[0]).toMatchObject({ title: 'Conquista desbloqueada!', message: 'Você ganhou Primeira lição.' });
      expect((await me(await tokenFor(plain), 'GET', '/notifications')).body.data[0]).toMatchObject({ title: 'Achievement Unlocked!', message: 'Achievement unlocked: First lesson' });

      expect((await me(token, 'POST', '/locale', { locale: null })).body).toEqual({ locale: null });
    });

    it('takes a language on a user from your server, and refuses one that is not a language', async () => {
      const created = parse(await app.inject({ method: 'POST', url: '/v1/users', headers: { 'x-api-key': apiKey }, payload: { externalId: `loc_${suffix}`, locale: 'FR-ca' } }));
      expect(created.status).toBe(201);
      expect(created.body.locale).toBe('fr-CA');
      expect((await call('PATCH', `/users/${created.body.id}`, { locale: 'klingon language' })).status).toBe(400);
      expect((await call('PATCH', `/users/${created.body.id}`, { locale: null })).body.locale).toBeNull();
    });

    it('removes one text with an empty value, and a whole language on request', async () => {
      expect((await save('pt-BR', [{ type: 'achievement', key: 'first_lesson', field: 'description', value: '' }])).body).toMatchObject({ saved: 0, removed: 1 });
      const user = await makeUser('removed');
      await db.insert(userAchievements).values({ id: `uach_${randomUUID()}`, projectId, userId: user, achievementId: `ach_rp_${suffix}` });
      const token = await tokenFor(user);
      expect((await me(token, 'GET', '/achievements?locale=pt-BR')).body.data[0]).toMatchObject({ name: 'Primeira lição', description: 'Finish a lesson.' });

      expect((await call('DELETE', '/translations/pt-BR')).body.removed).toBeGreaterThan(0);
      expect(await db.select().from(translations).where(and(eq(translations.projectId, projectId), eq(translations.locale, 'pt-BR')))).toHaveLength(0);
      expect((await me(token, 'GET', '/achievements?locale=pt-BR')).body.data[0].name).toBe('First lesson');
    });
  });

  describe('web push', () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const subscription = (endpoint: string) => ({ endpoint, keys: { p256dh: browser.getPublicKey().toString('base64url'), auth: Buffer.from('0123456789abcdef').toString('base64url') } });

    it('makes a key pair for the project and hands browsers only the public half', async () => {
      const user = await makeUser('push');
      const token = await tokenFor(user, 'write');
      expect((await me(token, 'GET', '/push/web-key')).body.code).toBe('WEB_PUSH_NOT_SET_UP');

      expect((await call('POST', '/integrations', { name: 'Browsers', provider: 'webpush', credentials: { subject: 'call me' } })).status).toBe(400);
      const created = await call('POST', '/integrations', { name: 'Browsers', provider: 'webpush', credentials: { subject: 'mailto:ops@example.com' } });
      expect(created.status).toBe(201);
      const text = JSON.stringify(created.body);
      expect(text).not.toContain('PRIVATE KEY');
      expect(text).not.toContain('encryptedCredentials');

      const key = (await me(token, 'GET', '/push/web-key')).body.publicKey as string;
      expect(Buffer.from(key, 'base64url')).toHaveLength(65);
      expect(text).toContain(key);
    });

    it('registers a browser, refuses an address that is not a push service, and removes it again', async () => {
      const user = await makeUser('browser');
      const token = await tokenFor(user, 'write');
      const endpoint = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(160)}`;

      // The server will send requests to this address, so it has to be a real push service.
      for (const bad of ['https://10.0.0.5/internal', 'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.evil.example/x']) {
        const refused = await me(token, 'POST', '/devices', { platform: 'web', subscription: subscription(bad) });
        expect(refused.status, bad).toBe(400);
        expect(refused.body.code, bad).toBe('PUSH_ENDPOINT_NOT_ALLOWED');
      }
      expect((await me(token, 'POST', '/devices', { platform: 'web' })).status).toBe(400);
      expect((await me(await tokenFor(user, 'read'), 'POST', '/devices', { platform: 'web', subscription: subscription(endpoint) })).body.code).toBe('TOKEN_READ_ONLY');

      expect((await me(token, 'POST', '/devices', { platform: 'web', subscription: subscription(endpoint) })).status).toBe(201);
      // Registering again keeps one row.
      await me(token, 'POST', '/devices', { platform: 'web', subscription: subscription(endpoint) });
      const rows = await db.select().from(pushDevices).where(eq(pushDevices.userId, user));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ platform: 'web', token: endpoint });
      expect(rows[0]!.keys).toEqual(subscription(endpoint).keys);

      // Another player cannot remove it, and a long address goes in the body, not the path.
      const stranger = await tokenFor(await makeUser('stranger'), 'write');
      await me(stranger, 'POST', '/devices/remove', { token: endpoint });
      expect(await db.select().from(pushDevices).where(eq(pushDevices.userId, user))).toHaveLength(1);
      expect((await me(token, 'POST', '/devices/remove', { token: 'short' })).status).toBe(400);
      expect((await me(token, 'POST', '/devices/remove', { token: endpoint })).body).toEqual({ removed: true });
      expect(await db.select().from(pushDevices).where(eq(pushDevices.userId, user))).toHaveLength(0);
    });

    it('still registers phones as before', async () => {
      const user = await makeUser('phone');
      const token = await tokenFor(user, 'write');
      expect((await me(token, 'POST', '/devices', { token: 'fMyDeviceTokenFromFirebase1234567890', platform: 'android' })).status).toBe(201);
      const [row] = await db.select().from(pushDevices).where(eq(pushDevices.userId, user));
      expect(row).toMatchObject({ platform: 'android', keys: null });
    });
  });
});
