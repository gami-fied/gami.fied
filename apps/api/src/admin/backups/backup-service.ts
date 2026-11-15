import { product } from '@gami/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  auditLogs,
  db,
  platformBackups,
  reviveRow,
  rowsPerInsert,
  schemaTables,
  type PlatformBackupRecord,
  type SchemaTable,
} from '@gami/database';
import { desc, eq, sql } from 'drizzle-orm';
import { createAuditLog } from '../../audit-logs/index.js';

/** Written into each backup. Version 1 files hold only the 22 tables that existed at 1.0. */
export const BACKUP_SCHEMA_VERSION = 2;

/**
 * Tables a backup leaves out, each with the reason. Every other table in the schema is saved and
 * restored, so a table added later is covered without touching this file.
 */
export const BACKUP_EXCLUDED_TABLES: Record<string, string> = {
  platformBackups: 'The list of backup files has to survive a restore.',
  session: 'Sign-ins. Everyone signs in again after a restore.',
  verification: 'Short-lived codes and password reset links.',
  notificationOutbox: 'Queued deliveries would be sent a second time.',
  emailNotificationOutbox: 'Queued emails would be sent a second time.',
  webhookOutbox: 'Queued webhooks would be sent a second time.',
  integrationDeliveries: 'Queued messages would be sent a second time.',
};

/** Saved in every backup, but a restore adds to it instead of replacing it, so the trail is never cut. */
const APPEND_ONLY_TABLES = new Set(['auditLogs']);

/** The tables a backup holds, parents first. */
export function backupTables(): SchemaTable[] {
  return schemaTables().filter((table) => !(table.name in BACKUP_EXCLUDED_TABLES));
}

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
      appVersion: product.version,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      createdByActorId: params.actorId,
    })
    .returning();

  try {
    // 2. Read every table the backup covers
    const tables = backupTables();
    const dumped: Record<string, unknown[]> = {};
    for (const { name, table } of tables) {
      dumped[name] = await db.select().from(table);
    }

    const dumpPayload = {
      manifest: {
        backupId,
        backupType: params.backupType || 'manual',
        appVersion: product.version,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        tables: tables.map((table) => table.name),
        createdAt: new Date().toISOString(),
      },
      tables: dumped,
    };

    let fileData: string | Buffer = JSON.stringify(dumpPayload);

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

/** The backup was made before some of today's tables existed, so restoring it would empty them. */
export class PartialBackupError extends Error {
  constructor(public readonly missingTables: string[]) {
    super(
      `This backup was made by an older version and is missing ${missingTables.length} of the tables this server has ` +
        `(${missingTables.slice(0, 6).join(', ')}${missingTables.length > 6 ? ', ...' : ''}). ` +
        'Restoring it deletes the data in those tables. To go ahead anyway, run `pnpm backup:restore --id <id> --partial`.'
    );
    this.name = 'PartialBackupError';
  }
}

export async function restorePlatformBackup(params: {
  backupId: string;
  actorId: string;
  confirmRestore: boolean;
  /** Restore a backup that does not hold every table, accepting that the missing ones end up empty. */
  allowPartial?: boolean;
}): Promise<{ safetyBackupId: string; restoredBackupId: string; restoredTables: number; restoredRows: number }> {
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

  // 2. Decrypt and parse the file, and check what it holds, before anything is changed
  const sanitized = sanitizeFilename(record.filename);
  const targetPath = path.join(getBackupStorageDir(), sanitized);
  let fileBuffer: Buffer = fs.readFileSync(targetPath);

  if (record.encrypted) {
    fileBuffer = decryptBackup(fileBuffer);
  }

  const dumpPayload = JSON.parse(fileBuffer.toString('utf-8')) as { tables?: unknown };
  if (!dumpPayload?.tables || typeof dumpPayload.tables !== 'object') {
    throw new Error('Restoration aborted: the backup file holds no tables');
  }
  const saved = dumpPayload.tables as Record<string, Record<string, unknown>[] | undefined>;

  const tables = backupTables();
  const missing = tables.filter((table) => !Array.isArray(saved[table.name])).map((table) => table.name);
  if (missing.length > 0 && !params.allowPartial) {
    throw new PartialBackupError(missing);
  }

  // 3. Create Pre-Restore Safety Backup
  const safetyBackup = await createPlatformBackup({
    actorId: params.actorId,
    backupType: 'safety',
    encrypt: true,
  });

  // 4. Mark state as restoring
  await db
    .update(platformBackups)
    .set({ status: 'restoring', updatedAt: new Date() })
    .where(eq(platformBackups.id, params.backupId));

  // 5. Replace every table in one transaction: children are deleted first, parents inserted first
  let restoredRows = 0;
  try {
    await db.transaction(async (tx) => {
      for (const { name, table } of [...tables].reverse()) {
        if (!APPEND_ONLY_TABLES.has(name)) await tx.delete(table);
      }

      for (const entry of tables) {
        const rows = (saved[entry.name] ?? []).map((row) => reviveRow(entry, row));
        const first = rows[0];
        if (!first) continue;

        const size = rowsPerInsert(first);
        for (let i = 0; i < rows.length; i += size) {
          const batch = rows.slice(i, i + size) as never[];
          if (entry.name === 'auditLogs') {
            // Deleting organizations and projects cleared these links on the rows that stayed.
            await tx
              .insert(auditLogs)
              .values(batch)
              .onConflictDoUpdate({
                target: auditLogs.id,
                set: { organizationId: sql`excluded.organization_id`, projectId: sql`excluded.project_id` },
              });
          } else {
            await tx.insert(entry.table).values(batch);
          }
        }
        restoredRows += rows.length;
      }
    });
  } catch (err) {
    // The transaction rolled back, so the data is as it was and the backup can be tried again.
    await db
      .update(platformBackups)
      .set({ status: 'available', updatedAt: new Date() })
      .where(eq(platformBackups.id, params.backupId));
    throw new Error(`Restore failed and nothing was changed: ${(err as Error)?.message ?? 'unknown error'}`, { cause: err });
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
      restoredRows,
      tablesMissingFromBackup: missing,
    },
  });

  return {
    safetyBackupId: safetyBackup.id,
    restoredBackupId: params.backupId,
    restoredTables: tables.length - missing.length,
    restoredRows,
  };
}
