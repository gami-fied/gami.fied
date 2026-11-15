/**
 * Backups, organization export and import, and erasing a player (FIX-01 to FIX-05).
 *
 * These tests put a row in every table of the schema, so a table added later is covered by them
 * without anyone remembering to add it.
 */
import crypto from 'crypto';
import fs from 'fs';
import {
  achievements,
  currencies,
  db,
  endUsers,
  events,
  member,
  organizationPolicies,
  organizations,
  platformBackups,
  projects,
  redemptions,
  rewardCodes,
  rules,
  schemaTables,
  userXpBalances,
  xpLedger,
  type SchemaTable,
} from '@gami/database';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BACKUP_EXCLUDED_TABLES,
  backupTables,
  computeFileChecksum,
  createPlatformBackup,
  PartialBackupError,
  restorePlatformBackup,
} from '../admin/backups/backup-service.js';
import { buildApp } from '../index.js';
import {
  exportTables,
  ORG_EXPORT_EXCLUDED,
  ORG_EXPORT_TABLES,
} from '../organizations/data-package.js';
import { seedEveryTable, type SeededData } from './helpers/seed-every-table.js';

type Row = Record<string, unknown>;

const suffix = crypto.randomBytes(5).toString('hex');
const allTables = () => schemaTables().map((table) => table.name);

/** The column that identifies a seeded row: `id`, or the primary key where there is no `id`. */
function keyOf(entry: SchemaTable): { property: string; column: PgColumn } {
  const columns = getTableColumns(entry.table);
  const property =
    'id' in columns ? 'id' : Object.keys(columns).find((name) => columns[name]!.primary)!;
  return { property, column: columns[property] as PgColumn };
}

async function exists(entry: SchemaTable, value: unknown): Promise<boolean> {
  const { column } = keyOf(entry);
  const found = await db
    .select({ value: column })
    .from(entry.table)
    .where(eq(column, value))
    .limit(1);
  return found.length > 0;
}

describe('which tables backups and exports cover', () => {
  it('leaves only the listed tables out of a backup', () => {
    for (const name of Object.keys(BACKUP_EXCLUDED_TABLES)) expect(allTables()).toContain(name);
    expect(Object.keys(BACKUP_EXCLUDED_TABLES).sort()).toEqual(
      [
        'emailNotificationOutbox',
        'integrationDeliveries',
        'notificationOutbox',
        'platformBackups',
        'session',
        'verification',
        'webhookOutbox',
      ].sort()
    );
    expect(backupTables().length).toBe(
      allTables().length - Object.keys(BACKUP_EXCLUDED_TABLES).length
    );
  });

  it('has a decision for every table about organization exports', () => {
    const decided = [...ORG_EXPORT_TABLES, ...Object.keys(ORG_EXPORT_EXCLUDED)];
    // A new table must be added to ORG_EXPORT_TABLES, or to ORG_EXPORT_EXCLUDED with the reason.
    expect(decided.sort()).toEqual(allTables().sort());
    expect(new Set(decided).size).toBe(decided.length);
  });

  it('never exports a table whose rows need a table that is not exported', () => {
    const exported = new Set<string>(ORG_EXPORT_TABLES);
    for (const entry of exportTables()) {
      for (const reference of entry.references) {
        if (entry.name === 'projects' && reference.table === 'organizations') continue;
        if (!reference.nullable)
          expect(
            exported.has(reference.table),
            `${entry.name}.${reference.column} needs ${reference.table}`
          ).toBe(true);
      }
    }
  });
});

describe('with a row in every table', () => {
  let app: FastifyInstance;
  let seed: SeededData;
  let cookie: string | null = null;
  const createdOrganizations: string[] = [];

  /** Signs up a staff user once, and makes them an owner of the given organizations. */
  async function ownerOf(...organizationIds: string[]): Promise<string> {
    if (!cookie) {
      const signUp = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: {
          email: `data-safety-${suffix}@example.com`,
          password: 'Password123!',
          name: 'Data Safety',
        },
      });
      expect(signUp.statusCode).toBe(200);
      cookie = signUp.headers['set-cookie'] as string;
      ownerOf.userId = JSON.parse(signUp.payload).user.id as string;
    }
    for (const organizationId of organizationIds) {
      await db
        .insert(member)
        .values({
          id: `mem_${crypto.randomUUID()}`,
          organizationId,
          userId: ownerOf.userId,
          role: 'owner',
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
    return cookie;
  }
  ownerOf.userId = '';

  async function newOrganization(
    label: string,
    values: Partial<typeof organizations.$inferInsert> = {}
  ): Promise<string> {
    const id = `org_${label}_${suffix}`;
    await db
      .insert(organizations)
      .values({ id, name: `Target ${label}`, slug: `target-${label}-${suffix}`, ...values });
    createdOrganizations.push(id);
    return id;
  }

  const exportOf = async (organizationId: string) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${organizationId}/export`,
      headers: { cookie: await ownerOf(organizationId) },
    });
    expect(res.statusCode).toBe(200);
    return res;
  };

  const importInto = async (organizationId: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/organizations/${organizationId}/import`,
      headers: { cookie: await ownerOf(organizationId), 'content-type': 'application/json' },
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    seed = await seedEveryTable(suffix);
  });

  afterAll(async () => {
    for (const id of [...createdOrganizations, seed?.organizationId]) {
      if (id)
        await db
          .delete(organizations)
          .where(eq(organizations.id, id))
          .catch(() => undefined);
    }
    await app?.close();
  });

  // ---------- FIX-01 ----------

  it('restores every table a backup covers, including the ones added after 1.0', async () => {
    const backup = await createPlatformBackup({ actorId: 'data_safety_test' });

    // Deleting the organization takes everything under it along, as a lost database would.
    await db.delete(organizations).where(eq(organizations.id, seed.organizationId));
    expect(
      await exists(
        schemaTables().find((table) => table.name === 'userXpBalances')!,
        seed.rows['userXpBalances']!['id']
      )
    ).toBe(false);

    const result = await restorePlatformBackup({
      backupId: backup.id,
      actorId: 'data_safety_test',
      confirmRestore: true,
    });
    expect(result.restoredTables).toBe(backupTables().length);

    const missing: string[] = [];
    for (const entry of backupTables()) {
      const { property } = keyOf(entry);
      if (!(await exists(entry, seed.rows[entry.name]![property]))) missing.push(entry.name);
    }
    expect(missing).toEqual([]);

    const [balance] = await db
      .select()
      .from(userXpBalances)
      .where(eq(userXpBalances.id, String(seed.rows['userXpBalances']!['id'])));
    expect(balance?.userId).toBe(seed.player.id);
  }, 180_000);

  it('refuses a backup from before these tables existed, instead of emptying them', async () => {
    const backup = await createPlatformBackup({ actorId: 'data_safety_test', encrypt: false });
    const file = JSON.parse(fs.readFileSync(backup.filePath, 'utf8')) as {
      tables: Record<string, unknown>;
    };
    delete file.tables['userStreaks'];
    delete file.tables['walletLots'];
    fs.writeFileSync(backup.filePath, JSON.stringify(file));
    await db
      .update(platformBackups)
      .set({ checksumSha256: computeFileChecksum(backup.filePath) })
      .where(eq(platformBackups.id, backup.id));

    await expect(
      restorePlatformBackup({
        backupId: backup.id,
        actorId: 'data_safety_test',
        confirmRestore: true,
      })
    ).rejects.toBeInstanceOf(PartialBackupError);
    expect(
      await exists(
        schemaTables().find((table) => table.name === 'userStreaks')!,
        seed.rows['userStreaks']!['id']
      )
    ).toBe(true);
  }, 120_000);

  // ---------- FIX-02 ----------

  it('exports every table on the list, and nothing from the tables left out', async () => {
    const res = await exportOf(seed.organizationId);
    const body = res.json() as { version: number; tables: Record<string, Row[]> };
    expect(body.version).toBe(2);

    const missing = exportTables()
      .filter((entry) => {
        const { property } = keyOf(entry);
        return !(body.tables[entry.name] ?? []).some(
          (row) => row[property] === seed.rows[entry.name]![property]
        );
      })
      .map((entry) => entry.name);
    expect(missing).toEqual([]);

    // Webhooks and integrations are listed without their secrets, and the organization by its ID.
    const listed = new Set(['organizations', 'webhookEndpoints', 'integrations']);
    for (const name of Object.keys(ORG_EXPORT_EXCLUDED)) {
      if (listed.has(name)) continue;
      const id = seed.rows[name]?.['id'];
      if (typeof id === 'string')
        expect(res.payload, `${name} must not be exported`).not.toContain(`"${id}"`);
    }
    for (const secret of [
      seed.rows['apiKeys']!['keyHash'],
      seed.rows['connectors']!['secretEncrypted'],
      seed.rows['webhookEndpoints']!['secretEncrypted'],
    ]) {
      if (typeof secret === 'string') expect(res.payload).not.toContain(secret);
    }
  });

  // ---------- FIX-03 ----------

  it('imports every exported table into another organization, keeping keys and player IDs', async () => {
    const target = await newOrganization('b');
    const exported = await exportOf(seed.organizationId);

    const res = await importInto(target, exported.payload);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      importedCount: Record<string, number>;
      skipped: Record<string, number>;
      warnings: string[];
      projectIds: string[];
    };

    expect(body.warnings).toEqual([]);
    expect(body.skipped).toEqual({});
    for (const name of ORG_EXPORT_TABLES)
      expect(body.importedCount[name], name).toBeGreaterThanOrEqual(1);
    expect(body.importedCount['endUsers']).toBe(2);

    const [project] = await db.select().from(projects).where(eq(projects.organizationId, target));
    expect(project?.id).not.toBe(seed.projectId);
    expect(project?.slug).toBe(seed.rows['projects']!['slug']);
    expect(project?.name).toBe(seed.rows['projects']!['name']);

    // The customer's own ID for a player still finds them.
    const players = await db.select().from(endUsers).where(eq(endUsers.projectId, project!.id));
    const player = players.find((row) => row.externalId === seed.player.externalId);
    expect(player).toBeDefined();
    expect(player!.id).not.toBe(seed.player.id);

    // The rule still awards a badge that exists under the same key.
    const [rule] = await db.select().from(rules).where(eq(rules.projectId, project!.id));
    const awarded = (rule!.actions as { type: string; params: { achievementKey?: string } }[]).find(
      (action) => action.type === 'award_achievement'
    );
    const [badge] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.projectId, project!.id));
    expect(badge?.key).toBe(awarded?.params.achievementKey);
    expect(badge?.key).toBe(`badge-${suffix}`);

    // References without a foreign key are rewritten too.
    const [currency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.projectId, project!.id));
    const [redemption] = await db
      .select()
      .from(redemptions)
      .where(eq(redemptions.projectId, project!.id));
    const [code] = await db
      .select()
      .from(rewardCodes)
      .where(eq(rewardCodes.projectId, project!.id));
    expect(redemption?.currencyId).toBe(currency?.id);
    expect(code?.redemptionId).toBe(redemption?.id);

    const [balance] = await db
      .select()
      .from(userXpBalances)
      .where(eq(userXpBalances.projectId, project!.id));
    expect(balance?.userId).toBe(player!.id);

    // The source is untouched.
    expect((await db.select().from(endUsers).where(eq(endUsers.id, seed.player.id))).length).toBe(
      1
    );
  }, 120_000);

  it('still reads a version 1 file, with keys and player IDs kept', async () => {
    const target = await newOrganization('v1');
    const res = await importInto(target, {
      format: 'gami-organization-export',
      version: 1,
      projects: [{ id: 'p1', name: 'Legacy', slug: `legacy-${suffix}` }],
      users: [{ id: 'u1', projectId: 'p1', externalId: 'customer-42', name: 'Ada' }],
      achievements: [{ id: 'a1', projectId: 'p1', key: 'first_lesson', name: 'First lesson' }],
      levels: [{ projectId: 'p1', level: 1, name: 'One', minXp: 0 }],
      xpLedger: [{ projectId: 'p1', userId: 'u1', amount: 40, reason: 'history' }],
      rules: [
        {
          projectId: 'p1',
          name: 'Reward',
          trigger: 'lesson',
          actions: [{ type: 'award_achievement', params: { achievementKey: 'first_lesson' } }],
        },
      ],
    });
    expect(res.statusCode).toBe(200);

    const [project] = await db.select().from(projects).where(eq(projects.organizationId, target));
    const [player] = await db.select().from(endUsers).where(eq(endUsers.projectId, project!.id));
    const [badge] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.projectId, project!.id));
    const [balance] = await db
      .select()
      .from(userXpBalances)
      .where(eq(userXpBalances.projectId, project!.id));
    expect(player?.externalId).toBe('customer-42');
    expect(badge?.key).toBe('first_lesson');
    expect(balance?.totalXp).toBe(40);
  });

  // ---------- FIX-04 ----------

  it('counts imported projects against the organization limit', async () => {
    const target = await newOrganization('limit');
    await db
      .insert(organizationPolicies)
      .values({ id: `pol_${suffix}`, organizationId: target, maxProjects: 1 });
    const file = (n: number) => ({
      format: 'gami-organization-export',
      version: 2,
      tables: {
        projects: Array.from({ length: n }, (_, i) => ({
          id: `p${i}`,
          name: `P${i}`,
          slug: `p${i}-${suffix}`,
        })),
      },
    });

    const tooMany = await importInto(target, file(2));
    expect(tooMany.statusCode).toBe(403);
    expect(tooMany.json().code).toBe('PROJECT_LIMIT');
    expect(
      (await db.select().from(projects).where(eq(projects.organizationId, target))).length
    ).toBe(0);

    const check = await app.inject({
      method: 'POST',
      url: `/api/organizations/${target}/import/validate`,
      headers: { cookie: await ownerOf(target), 'content-type': 'application/json' },
      payload: JSON.stringify(file(2)),
    });
    expect(check.json().valid).toBe(false);

    expect((await importInto(target, file(1))).statusCode).toBe(200);
    expect((await importInto(target, file(1))).statusCode).toBe(403);
  });

  it('does not let a demo import anything', async () => {
    const demo = await newOrganization('demo', { demoExpiresAt: new Date(Date.now() + 3_600_000) });
    const res = await importInto(demo, {
      format: 'gami-organization-export',
      version: 2,
      tables: { projects: [{ id: 'p1', name: 'P', slug: `demo-${suffix}` }] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('DEMO_IMPORT_DISABLED');
  });

  it('leaves out rules that could not be saved, and says so', async () => {
    const target = await newOrganization('rules');
    const res = await importInto(target, {
      format: 'gami-organization-export',
      version: 2,
      tables: {
        projects: [{ id: 'p1', name: 'P', slug: `rules-${suffix}` }],
        rules: [
          {
            id: 'r1',
            projectId: 'p1',
            name: 'Good',
            trigger: 'lesson',
            actions: [{ type: 'award_xp', params: { amount: 5 } }],
          },
          {
            id: 'r2',
            projectId: 'p1',
            name: 'Bad',
            trigger: 'lesson',
            actions: [{ type: 'no_such_action', params: {} }],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { importedCount: Record<string, number>; warnings: string[] };
    expect(body.importedCount['rules']).toBe(1);
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0]).toContain('Bad');
  });

  it("cannot attach imported rows to another organization's data", async () => {
    const target = await newOrganization('tenant');
    const res = await importInto(target, {
      format: 'gami-organization-export',
      version: 2,
      tables: {
        projects: [
          { id: 'p1', name: 'P', slug: `tenant-${suffix}`, organizationId: seed.organizationId },
        ],
        // Both name a real player of the seeded organization, who is not in this file.
        events: [{ id: 'e1', projectId: 'p1', userId: seed.player.id, type: 'probe', payload: {} }],
        xpLedger: [
          { id: 'x1', projectId: 'p1', userId: seed.player.id, amount: 999, reason: 'probe' },
        ],
        // And this one names the other organization's project outright.
        achievements: [{ id: 'a1', projectId: seed.projectId, key: 'probe', name: 'Probe' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { skipped: Record<string, number>; projectIds: string[] };
    expect(body.skipped).toEqual({ xpLedger: 1, achievements: 1 });

    const [project] = await db.select().from(projects).where(eq(projects.id, body.projectIds[0]!));
    expect(project?.organizationId).toBe(target);
    const [event] = await db.select().from(events).where(eq(events.projectId, project!.id));
    expect(event?.userId).toBeNull();
    expect((await db.select().from(xpLedger).where(eq(xpLedger.reason, 'probe'))).length).toBe(0);
    expect((await db.select().from(achievements).where(eq(achievements.key, 'probe'))).length).toBe(
      0
    );
  });

  // ---------- FIX-05 ----------

  it('erases a player from every table', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${seed.projectId}/users/${seed.player.id}/erase`,
      headers: { cookie: await ownerOf(seed.organizationId), 'content-type': 'application/json' },
      payload: JSON.stringify({ confirm: true }),
    });
    expect(res.statusCode).toBe(200);

    // The imports above made copies of this player in other organizations, which are not being erased.
    for (const id of createdOrganizations)
      await db.delete(organizations).where(eq(organizations.id, id));

    const left: string[] = [];
    for (const entry of schemaTables()) {
      // The whole row as text, so the search also reaches into JSON columns.
      const text = sql`to_jsonb(t)::text`;
      const found = async (marker: string) => {
        const result = await db.execute<{ total: number }>(
          sql`SELECT count(*)::int AS total FROM ${sql.identifier(entry.sqlName)} t WHERE ${text} LIKE ${`%${marker}%`}`
        );
        const rows = (
          Array.isArray(result)
            ? result
            : ((result as unknown as { rows: { total: number }[] }).rows ?? [])
        ) as { total: number }[];
        return (rows[0]?.total ?? 0) > 0;
      };

      // The audit log keeps the fact that an erasure happened, under the internal ID alone.
      if (entry.name !== 'auditLogs' && (await found(`"${seed.player.id}"`)))
        left.push(`${entry.name}: id`);
      if (await found(seed.player.externalId)) left.push(`${entry.name}: external ID`);
      if (await found(seed.player.email)) left.push(`${entry.name}: email`);
      if (await found(seed.player.name)) left.push(`${entry.name}: name`);
    }
    expect(left).toEqual([]);

    // The other player is still there.
    expect(
      (
        await db
          .select()
          .from(endUsers)
          .where(eq(endUsers.id, String(seed.friend['id'])))
      ).length
    ).toBe(1);
  }, 120_000);
});
