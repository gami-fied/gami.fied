import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const platformBackups = pgTable(
  'platform_backups',
  {
    id: text('id').primaryKey(),
    filename: text('filename').notNull(),
    filePath: text('file_path').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).default(0).notNull(),
    backupType: text('backup_type').default('manual').notNull(), // manual | scheduled | safety
    status: text('status').default('creating').notNull(), // creating | available | verifying | verified | failed | restoring | restored | deleted
    verificationStatus: text('verification_status').default('unverified').notNull(), // unverified | passed | corrupted | missing
    checksumSha256: text('checksum_sha256'),
    encrypted: boolean('encrypted').default(false).notNull(),
    encryptionAlgorithm: text('encryption_algorithm'), // aes-256-gcm
    appVersion: text('app_version').default('0.1.0').notNull(),
    schemaVersion: integer('schema_version').default(1).notNull(),
    durationMs: integer('duration_ms'),
    createdByActorId: text('created_by_actor_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_platform_backups_status').on(table.status),
    index('idx_platform_backups_created_at').on(table.createdAt),
    index('idx_platform_backups_type').on(table.backupType),
  ]
);

export type PlatformBackupRecord = typeof platformBackups.$inferSelect;
export type NewPlatformBackupRecord = typeof platformBackups.$inferInsert;
