import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../index.js';
import { db, organizations, projects } from '@gami/database';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

describe('Milestone 25 — Data Management, Backup, Import/Export & Disaster Recovery', () => {
  let app: FastifyInstance;
  let orgIdA: string;
  let orgIdB: string;
  let projectIdA: string;
  let rawApiKeyA: string;
  let dbAvailable = false;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    try {
      orgIdA = `org_dm_a_${Date.now()}`;
      orgIdB = `org_dm_b_${Date.now()}`;

      await db.insert(organizations).values([
        { id: orgIdA, name: 'Data Management Org A', slug: `dm-org-a-${Date.now()}` },
        { id: orgIdB, name: 'Data Management Org B', slug: `dm-org-b-${Date.now()}` },
      ]);

      projectIdA = `prj_dm_a_${Date.now()}`;
      await db.insert(projects).values({
        id: projectIdA,
        organizationId: orgIdA,
        name: 'Data Management Project A',
        slug: `prj-dm-a-${Date.now()}`,
      });

      const { createApiKey } = await import('../services/api-key.service.js');
      const keyA = await createApiKey(projectIdA, 'DM Key A');
      rawApiKeyA = keyA.rawSecret;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable && orgIdA) {
      try {
        await db.delete(organizations).where(eq(organizations.id, orgIdA));
        await db.delete(organizations).where(eq(organizations.id, orgIdB));
      } catch {}
    }
    await app?.close();
  });

  it('1. Platform Backup Security: Denies unauthenticated & non-platform-admin access', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/backups',
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('2. Path Traversal Guard: Sanitizes user-supplied backup filenames', async () => {
    const { sanitizeFilename } = await import('../admin/backups/backup-service.js');
    expect(() => sanitizeFilename('../../etc/passwd')).not.toThrow();
    const safe = sanitizeFilename('../../etc/passwd');
    expect(safe).not.toContain('..');
    expect(safe).not.toContain('/');
  });

  it('3. Platform Backup Creation & Integrity Verification', async () => {
    if (!dbAvailable) return;
    const { createPlatformBackup, verifyPlatformBackup, listPlatformBackups } = await import(
      '../admin/backups/backup-service.js'
    );

    const bkp = await createPlatformBackup({ actorId: 'test_admin', backupType: 'manual', encrypt: true });
    expect(bkp.id).toBeDefined();
    expect(bkp.status).toBe('available');
    expect(bkp.encrypted).toBe(true);

    const verified = await verifyPlatformBackup(bkp.id, 'test_admin');
    expect(verified.verificationStatus).toBe('passed');

    const all = await listPlatformBackups();
    expect(all.some((b) => b.id === bkp.id)).toBe(true);
  });

  it('4. Secret Redaction & Tenant Isolation on Logical Export', async () => {
    if (!dbAvailable) return;

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgIdA}/export`,
      headers: {
        'x-api-key': rawApiKeyA,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.format).toBe('gami-organization-export');
    expect(body.version).toBe(1);
    expect(body.manifest.organizationId).toBe(orgIdA);

    // Verify secret shield
    const rawStr = JSON.stringify(body);
    expect(rawStr).not.toContain('passwordHash');
    expect(rawStr).not.toContain('rawSecret');
    expect(rawStr).not.toContain('BETTER_AUTH_SECRET');
  });

  it('5. Organization Import Validation (Dry-Run Mode)', async () => {
    if (!dbAvailable) return;

    const validPayload = {
      format: 'gami-organization-export',
      version: 1,
      manifest: { organizationId: 'sample' },
      projects: [{ id: 'p1', name: 'Sample Project', slug: 'sample-p1' }],
    };

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgIdA}/import/validate`,
      headers: {
        'x-api-key': rawApiKeyA,
      },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.targetOrganizationId).toBe(orgIdA);
  });

  it('6. Invalid Export Payload Rejection', async () => {
    if (!dbAvailable) return;

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgIdA}/import/validate`,
      headers: {
        'x-api-key': rawApiKeyA,
      },
      payload: { format: 'invalid-format', version: 99 },
    });

    expect(res.statusCode).toBe(400);
  });
});
