import { randomUUID } from 'crypto';
import {
  db,
  endUsers,
  events,
  isTabularExport,
  organizations,
  projects,
  runMigrations,
  streamTabularCsv,
} from '@gami/database';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('streamed CSV exports', () => {
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_exp_${suffix}`;
  const projectId = `prj_exp_${suffix}`;
  const TOTAL = 4500; // more than two batches

  beforeAll(async () => {
    await runMigrations();
    await db.insert(organizations).values({ id: orgId, name: 'Export', slug: `exp-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Export', slug: 'export' });
    await db.insert(endUsers).values({ id: `u_${suffix}`, projectId, externalId: '=cmd()', name: '=HYPERLINK("x")', createdAt: new Date(Date.now() - 3_600_000) });
    await db.execute(sql`
      INSERT INTO events (id, project_id, user_id, type, payload, occurred_at)
      SELECT ${`evt_${suffix}_`} || g, ${projectId}, ${`u_${suffix}`}, 'exported', '{}'::jsonb,
             now() - interval '2 hours' - (g * interval '1 second')
      FROM generate_series(1, ${TOTAL}) g`);
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const collect = async (type: Parameters<typeof streamTabularCsv>[2], maxRows?: number) => {
    const chunks: string[] = [];
    for await (const chunk of streamTabularCsv(db, projectId, type, { range: '24h' }, maxRows)) chunks.push(chunk);
    return { chunks, lines: chunks.join('').trimEnd().split('\n') };
  };

  it('knows which export types are row exports', () => {
    expect(isTabularExport('events')).toBe(true);
    expect(isTabularExport('overview')).toBe(false);
  });

  it('streams every row in batches, once each, newest first', async () => {
    const { chunks, lines } = await collect('events');

    expect(chunks.length).toBeGreaterThan(3); // header plus three batches
    expect(lines).toHaveLength(TOTAL + 1);

    const ids = lines.slice(1).map((line) => line.split(',')[0]!);
    expect(new Set(ids).size).toBe(TOTAL);
    expect(ids[0]).toContain(`_1"`);
  }, 120_000);

  it('stops at the row limit', async () => {
    const { lines } = await collect('events', 2500);
    expect(lines).toHaveLength(2501);
  }, 60_000);

  it('neutralises spreadsheet formulas', async () => {
    const { lines } = await collect('users');
    expect(lines[1]).toContain(`"'=cmd()"`);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
  }, 60_000);

  it('hides email addresses when asked', async () => {
    const out: string[] = [];
    for await (const chunk of streamTabularCsv(db, projectId, 'users', { range: '24h', hideEmail: true })) out.push(chunk);
    expect(out.join('')).not.toContain('@');
  });
});
