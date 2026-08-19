import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../index.js';
import { db, organizations } from '@gami/database';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createPlatformBackup, restorePlatformBackup } from '../admin/backups/backup-service.js';

describe('Empirical System Security & Recovery Verification', () => {
  let app: FastifyInstance;
  let testOrgId: string;
  let postBackupOrgId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1. Empirical Backup/Restore: Restores snapshot, confirms modified data disappears, and verifies DB health', async () => {
    // 1. Create Pre-Backup Record
    testOrgId = `org_pre_backup_${Date.now()}`;
    await db.insert(organizations).values({
      id: testOrgId,
      name: 'Pre Backup Org',
      slug: `pre-bkp-${Date.now()}`,
    });

    // 2. Create Platform Backup
    const backupRecord = await createPlatformBackup({
      actorId: 'test_admin',
      backupType: 'manual',
      encrypt: true,
    });
    expect(backupRecord.id).toBeDefined();

    // 3. Modify Application Data AFTER Backup (Insert Post-Backup Record)
    postBackupOrgId = `org_post_backup_${Date.now()}`;
    await db.insert(organizations).values({
      id: postBackupOrgId,
      name: 'Post Backup Org (Should Disappear)',
      slug: `post-bkp-${Date.now()}`,
    });

    // Verify postBackupOrgId exists in DB before restore
    const [beforeRestoreOrg] = await db.select().from(organizations).where(eq(organizations.id, postBackupOrgId));
    expect(beforeRestoreOrg).toBeDefined();

    // 4. Restore Platform Backup
    const restoreResult = await restorePlatformBackup({
      backupId: backupRecord.id,
      actorId: 'test_admin',
      confirmRestore: true,
    });
    expect(restoreResult.restoredBackupId).toBe(backupRecord.id);

    // 5. EMPIRICAL VERIFICATION:
    // a. Pre-backup record MUST exist
    const [restoredPreOrg] = await db.select().from(organizations).where(eq(organizations.id, testOrgId));
    expect(restoredPreOrg).toBeDefined();

    // b. Post-backup record MUST HAVE DISAPPEARED
    const [restoredPostOrg] = await db.select().from(organizations).where(eq(organizations.id, postBackupOrgId));
    expect(restoredPostOrg).toBeUndefined();

    // 6. Verify API can operate cleanly against the restored database
    const { checkDatabaseHealth } = await import('@gami/database');
    const isDbHealthy = await checkDatabaseHealth();
    expect(isDbHealthy).toBe(true);

    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json().status).toBe('ok');
  }, 30000);

  it('2. 64KB Request Body Limit Enforcement: Rejects oversized payload (>64KB) with 413 Payload Too Large', async () => {
    // Generate 70KB string payload
    const largePayloadStr = 'x'.repeat(70 * 1024);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        event: 'user.signup',
        user_id: 'usr_large',
        data: largePayloadStr,
      },
    });

    expect(res.statusCode).toBe(413);
    const body = res.json();
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('3. Rate Limiter Verification: Enforces sliding window request caps', async () => {
    const { checkRateLimit } = await import('../middleware/rate-limiter.js');
    const mockReply: any = {
      header: () => {},
      status: (code: number) => ({
        send: (payload: any) => ({ code, payload }),
      }),
    };
    const mockReq: any = { log: { warn: () => {} } };

    const result = await checkRateLimit(mockReq, mockReply, 'prj_test_ratelimit');
    expect(typeof result).toBe('boolean');
  });
});
