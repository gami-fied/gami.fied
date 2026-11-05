import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  account,
  achievements,
  apiKeys,
  auditLogs,
  challenges,
  db,
  endUsers,
  events,
  integrations,
  invitation,
  levels,
  member,
  notifications,
  notificationPreferences,
  organizations,
  platformBackups,
  projects,
  ruleExecutions,
  rules,
  serverConfigs,
  session,
  userAchievements,
  userChallengeProgress,
  users,
  webhookEndpoints,
  xpLedger,
  type PlatformBackupRecord,
} from '@gami/database';
import { desc, eq } from 'drizzle-orm';
import { createAuditLog } from '../../audit-logs/index.js';

const BACKUP_DIR = path.resolve(process.cwd(), process.env.BACKUP_STORAGE_PATH || 'storage/backups');

export function getBackupStorageDir(): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  return BACKUP_DIR;
}

export function sanitizeFilename(filename: string): string {
  const safeBase = path.basename(filename).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const resolved = path.resolve(getBackupStorageDir(), safeBase);
  if (!resolved.startsWith(getBackupStorageDir())) {
    throw new Error('Security Error: Path traversal attempt detected');
  }
  return safeBase;
}

/** The first key encrypts. The others only decrypt, for rotated keys and older backups. */
function backupKeys(): Buffer[] {
  const secrets = [
    process.env.ENCRYPTION_MASTER_KEY,
    process.env.ENCRYPTION_MASTER_KEY_PREVIOUS,
    process.env.BETTER_AUTH_SECRET,
  ].filter(Boolean) as string[];

  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_MASTER_KEY is required to encrypt backups');
    }
    secrets.push('local-development-only-backup-key');
  }
  return secrets.map((secret) => crypto.createHash('sha256').update(secret).digest());
}

function encryptBackup(content: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKeys()[0]!, iv);
  const encrypted = Buffer.concat([cipher.update(content, 'utf-8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function decryptBackup(file: Buffer): Buffer {
  const iv = file.subarray(0, 12);
  const authTag = file.subarray(12, 28);
  const encrypted = file.subarray(28);

  for (const key of backupKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch {
      // Try the next key
    }
  }
  throw new Error('Backup could not be decrypted with the configured keys');
}

export function computeFileChecksum(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export async function createPlatformBackup(params: {
  actorId: string;
  backupType?: 'manual' | 'scheduled' | 'safety';
  encrypt?: boolean;
}): Promise<PlatformBackupRecord> {
  const storageDir = getBackupStorageDir();
  const timestamp = Date.now();
  const backupId = `bkp_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;
  const filename = `${backupId}.json`;
  const filePath = path.join(storageDir, filename);

  const startTime = Date.now();
  // Backups hold password hashes and API key hashes, so plain files are an explicit choice.
  const encrypt = params.encrypt ?? true;

  // 1. Insert database record with status 'creating'
  await db
    .insert(platformBackups)
    .values({
      id: backupId,
      filename,
      filePath,
      sizeBytes: 0,
      backupType: params.backupType || 'manual',
      status: 'creating',
      verificationStatus: 'unverified',
      encrypted: encrypt,
      encryptionAlgorithm: encrypt ? 'aes-256-gcm' : null,
      appVersion: '0.1.0',
      schemaVersion: 1,
      createdByActorId: params.actorId,
    })
    .returning();

  try {
    // 2. Perform Database Snapshot Dump
    const [
      orgsList,
      projectsList,
      usersList,
      accountList,
      memberList,
      invitationList,
      apiKeysList,
      endUsersList,
      eventsList,
      xpLedgerList,
      levelsList,
      achievementsList,
      userAchievementsList,
      challengesList,
      userChallengeProgressList,
      rulesList,
      ruleExecutionsList,
      webhookEndpointsList,
      integrationsList,
      auditLogsList,
      serverConfigsList,
      notificationPreferencesList,
    ] = await Promise.all([
      db.select().from(organizations),
      db.select().from(projects),
      db.select().from(users),
      db.select().from(account),
      db.select().from(member),
      db.select().from(invitation),
      db.select().from(apiKeys),
      db.select().from(endUsers),
      db.select().from(events),
      db.select().from(xpLedger),
      db.select().from(levels),
      db.select().from(achievements),
      db.select().from(userAchievements),
      db.select().from(challenges),
      db.select().from(userChallengeProgress),
      db.select().from(rules),
      db.select().from(ruleExecutions),
      db.select().from(webhookEndpoints),
      db.select().from(integrations),
      db.select().from(auditLogs),
      db.select().from(serverConfigs),
      db.select().from(notificationPreferences),
    ]);

    const dumpPayload = {
      manifest: {
        backupId,
        backupType: params.backupType || 'manual',
        appVersion: '0.1.0',
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
      },
      tables: {
        organizations: orgsList,
        projects: projectsList,
        users: usersList,
        account: accountList,
        member: memberList,
        invitation: invitationList,
        apiKeys: apiKeysList,
        endUsers: endUsersList,
        events: eventsList,
        xpLedger: xpLedgerList,
        levels: levelsList,
        achievements: achievementsList,
        userAchievements: userAchievementsList,
        challenges: challengesList,
        userChallengeProgress: userChallengeProgressList,
        rules: rulesList,
        ruleExecutions: ruleExecutionsList,
        webhookEndpoints: webhookEndpointsList,
        integrations: integrationsList,
        auditLogs: auditLogsList,
        serverConfigs: serverConfigsList,
        notificationPreferences: notificationPreferencesList,
      },
    };

    let fileData: string | Buffer = JSON.stringify(dumpPayload, null, 2);

    if (encrypt) {
      fileData = encryptBackup(fileData);
    }

    fs.writeFileSync(filePath, fileData);

    const stats = fs.statSync(filePath);
    const checksum = computeFileChecksum(filePath);
    const durationMs = Date.now() - startTime;

    // 3. Update database record to 'available' and 'verified'
    const [updatedRecord] = await db
      .update(platformBackups)
      .set({
        sizeBytes: stats.size,
        status: 'available',
        verificationStatus: 'passed',
        checksumSha256: checksum,
        durationMs,
        updatedAt: new Date(),
      })
      .where(eq(platformBackups.id, backupId))
      .returning();

    // 4. Audit Log Event
    await createAuditLog(db, {
      actorType: 'user',
      actorId: params.actorId,
      action: 'backup.created',
      severity: 'info',
      resourceType: 'platform_backup',
      resourceId: backupId,
      metadata: {
        backupType: params.backupType || 'manual',
        sizeBytes: stats.size,
        encrypted: encrypt,
        durationMs,
      },
    });

    return updatedRecord!;
  } catch (err: unknown) {
    await db
      .update(platformBackups)
      .set({
        status: 'failed',
        verificationStatus: 'corrupted',
        updatedAt: new Date(),
      })
      .where(eq(platformBackups.id, backupId));

    throw new Error(`Backup creation failed: ${(err as Error)?.message || 'Storage write error'}`, {
      cause: err,
    });
  }
}

export async function listPlatformBackups(): Promise<PlatformBackupRecord[]> {
  return db.select().from(platformBackups).orderBy(desc(platformBackups.createdAt));
}

export async function verifyPlatformBackup(backupId: string, actorId: string): Promise<PlatformBackupRecord> {
  const [record] = await db.select().from(platformBackups).where(eq(platformBackups.id, backupId));

  if (!record) {
    throw new Error('Platform backup record not found');
  }

  const sanitized = sanitizeFilename(record.filename);
  const targetPath = path.join(getBackupStorageDir(), sanitized);

  let verificationStatus: 'passed' | 'corrupted' | 'missing' = 'passed';

  if (!fs.existsSync(targetPath)) {
    verificationStatus = 'missing';
  } else {
    const currentChecksum = computeFileChecksum(targetPath);
    if (record.checksumSha256 && currentChecksum !== record.checksumSha256) {
      verificationStatus = 'corrupted';
    }
  }

  const [updatedRecord] = await db
    .update(platformBackups)
    .set({
      verificationStatus,
      status: verificationStatus === 'passed' ? 'verified' : 'failed',
      updatedAt: new Date(),
    })
    .where(eq(platformBackups.id, backupId))
    .returning();

  await createAuditLog(db, {
    actorType: 'user',
    actorId,
    action: 'backup.verified',
    severity: verificationStatus === 'passed' ? 'info' : 'critical',
    resourceType: 'platform_backup',
    resourceId: backupId,
    metadata: { verificationStatus },
  });

  return updatedRecord!;
}

export async function deletePlatformBackup(backupId: string, actorId: string): Promise<void> {
  const [record] = await db.select().from(platformBackups).where(eq(platformBackups.id, backupId));

  if (record) {
    const sanitized = sanitizeFilename(record.filename);
    const targetPath = path.join(getBackupStorageDir(), sanitized);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    await db
      .update(platformBackups)
      .set({
        status: 'deleted',
        verificationStatus: 'missing',
        updatedAt: new Date(),
      })
      .where(eq(platformBackups.id, backupId));

    await createAuditLog(db, {
      actorType: 'user',
      actorId,
      action: 'backup.deleted',
      severity: 'warning',
      resourceType: 'platform_backup',
      resourceId: backupId,
    });
  }
}

export async function restorePlatformBackup(params: {
  backupId: string;
  actorId: string;
  confirmRestore: boolean;
}): Promise<{ safetyBackupId: string; restoredBackupId: string }> {
  if (!params.confirmRestore) {
    throw new Error('Restoration rejected: confirmRestore flag must be explicitly set to true');
  }

  const [record] = await db.select().from(platformBackups).where(eq(platformBackups.id, params.backupId));
  if (!record) {
    throw new Error('Requested restore backup record does not exist');
  }

  if (record.status === 'failed' || record.status === 'deleted' || record.status === 'creating') {
    throw new Error(`Cannot restore backup in '${record.status}' state`);
  }

  // 1. Verify file existence & checksum integrity first
  const verifiedRecord = await verifyPlatformBackup(params.backupId, params.actorId);
  if (verifiedRecord.verificationStatus !== 'passed') {
    throw new Error(`Restoration aborted: backup verification status is '${verifiedRecord.verificationStatus}'`);
  }

  // 2. Create Pre-Restore Safety Backup
  const safetyBackup = await createPlatformBackup({
    actorId: params.actorId,
    backupType: 'safety',
    encrypt: true,
  });

  // 3. Decrypt and Parse Backup File Data
  const sanitized = sanitizeFilename(record.filename);
  const targetPath = path.join(getBackupStorageDir(), sanitized);
  let fileBuffer: Buffer = fs.readFileSync(targetPath);

  if (record.encrypted) {
    fileBuffer = decryptBackup(fileBuffer);
  }

  const dumpPayload = JSON.parse(fileBuffer.toString('utf-8'));

  // 4. Mark state as restoring
  await db
    .update(platformBackups)
    .set({ status: 'restoring', updatedAt: new Date() })
    .where(eq(platformBackups.id, params.backupId));

  // 5. Restore Database Tables in Dependency Order
  if (dumpPayload && dumpPayload.tables) {
    const deletionOrder = [
      xpLedger, userAchievements, userChallengeProgress, ruleExecutions, events,
      endUsers, rules, achievements, challenges, levels, webhookEndpoints, integrations,
      notifications, notificationPreferences, member, invitation, apiKeys, projects,
      organizations, session, account, users, serverConfigs
    ];

    const insertionOrder = [
      { name: 'users', table: users },
      { name: 'account', table: account },
      { name: 'session', table: session },
      { name: 'organizations', table: organizations },
      { name: 'projects', table: projects },
      { name: 'member', table: member },
      { name: 'invitation', table: invitation },
      { name: 'apiKeys', table: apiKeys },
      { name: 'endUsers', table: endUsers },
      { name: 'rules', table: rules },
      { name: 'events', table: events },
      { name: 'ruleExecutions', table: ruleExecutions },
      { name: 'xpLedger', table: xpLedger },
      { name: 'levels', table: levels },
      { name: 'achievements', table: achievements },
      { name: 'userAchievements', table: userAchievements },
      { name: 'challenges', table: challenges },
      { name: 'userChallengeProgress', table: userChallengeProgress },
      { name: 'webhookEndpoints', table: webhookEndpoints },
      { name: 'integrations', table: integrations },
      { name: 'notifications', table: notifications },
      { name: 'serverConfigs', table: serverConfigs },
      { name: 'notificationPreferences', table: notificationPreferences },
    ];

    await db.transaction(async (tx) => {
      for (const t of deletionOrder) {
        await tx.delete(t);
      }

      for (const { name, table } of insertionOrder) {
        const rows = dumpPayload.tables[name];
        if (Array.isArray(rows) && rows.length > 0) {
          const formattedRows = rows.map((r: Record<string, unknown>) => {
            const copy = { ...r };
            for (const key of Object.keys(copy)) {
              if (key.endsWith('At') && typeof copy[key] === 'string') {
                copy[key] = new Date(copy[key] as string);
              }
            }
            return copy;
          });
          for (let i = 0; i < formattedRows.length; i += 100) {
            const batch = formattedRows.slice(i, i + 100);
            await tx.insert(table).values(batch);
          }
        }
      }
    });
  }

  await db
    .update(platformBackups)
    .set({ status: 'restored', updatedAt: new Date() })
    .where(eq(platformBackups.id, params.backupId));

  // 6. Audit Log Event
  await createAuditLog(db, {
    actorType: 'user',
    actorId: params.actorId,
    action: 'backup.restored',
    severity: 'critical',
    resourceType: 'platform_backup',
    resourceId: params.backupId,
    metadata: {
      safetyBackupId: safetyBackup.id,
      restoredBackupId: params.backupId,
    },
  });

  return {
    safetyBackupId: safetyBackup.id,
    restoredBackupId: params.backupId,
  };
}
