import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePlatformAdmin } from '../../authorization/index.js';
import {
  createPlatformBackup,
  deletePlatformBackup,
  listPlatformBackups,
  restorePlatformBackup,
  verifyPlatformBackup,
} from './backup-service.js';

export async function adminBackupRoutes(fastify: FastifyInstance) {
  // 1. Create Platform Backup
  const createBackupHandler = async (request: FastifyRequest<{ Body: { backupType?: 'manual' | 'scheduled' | 'safety'; encrypt?: boolean } }>, reply: FastifyReply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    try {
      const backup = await createPlatformBackup({
        actorId: adminAuth.session.user.id,
        backupType: request.body?.backupType,
        encrypt: request.body?.encrypt,
      });

      return reply.status(201).send(backup);
    } catch (err: any) {
      return reply.status(500).send({
        error: { code: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Failed to create platform backup' },
        message: err?.message || 'Failed to create platform backup',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  };

  // 2. List Platform Backups
  const listBackupsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const backups = await listPlatformBackups();
    return reply.send({ backups });
  };

  // 3. Inspect Platform Backup Metadata
  const getBackupHandler = async (request: FastifyRequest<{ Params: { backupId: string } }>, reply: FastifyReply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const backups = await listPlatformBackups();
    const backup = backups.find((b) => b.id === request.params.backupId);

    if (!backup) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Backup record not found' },
        message: 'Backup record not found',
        code: 'NOT_FOUND',
      });
    }

    return reply.send(backup);
  };

  // 4. Verify Backup Integrity
  const verifyBackupHandler = async (request: FastifyRequest<{ Params: { backupId: string } }>, reply: FastifyReply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const verified = await verifyPlatformBackup(request.params.backupId, adminAuth.session.user.id);
    return reply.send(verified);
  };

  // 5. Delete Platform Backup
  const deleteBackupHandler = async (request: FastifyRequest<{ Params: { backupId: string } }>, reply: FastifyReply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    await deletePlatformBackup(request.params.backupId, adminAuth.session.user.id);
    return reply.send({ success: true, message: 'Platform backup deleted successfully' });
  };

  // 6. Restore Platform Backup
  const restoreBackupHandler = async (request: FastifyRequest<{ Params: { backupId: string }; Body: { confirmRestore?: boolean } }>, reply: FastifyReply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    if (!request.body?.confirmRestore) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Destructive restoration requires confirmRestore: true' },
        message: 'Destructive restoration requires confirmRestore: true',
        code: 'BAD_REQUEST',
      });
    }

    const result = await restorePlatformBackup({
      backupId: request.params.backupId,
      actorId: adminAuth.session.user.id,
      confirmRestore: request.body.confirmRestore,
    });

    return reply.send({
      success: true,
      message: 'Platform database restoration completed successfully',
      safetyBackupId: result.safetyBackupId,
      restoredBackupId: result.restoredBackupId,
    });
  };

  // Register /api/, /v1/, and /api/v1/ route aliases
  ['/api/admin/backups', '/v1/admin/backups', '/api/v1/admin/backups'].forEach((path) => {
    fastify.post(path, createBackupHandler);
    fastify.get(path, listBackupsHandler);
  });

  ['/api/admin/backups/:backupId', '/v1/admin/backups/:backupId', '/api/v1/admin/backups/:backupId'].forEach((path) => {
    fastify.get(path, getBackupHandler);
    fastify.delete(path, deleteBackupHandler);
  });

  ['/api/admin/backups/:backupId/verify', '/v1/admin/backups/:backupId/verify', '/api/v1/admin/backups/:backupId/verify'].forEach((path) => {
    fastify.post(path, verifyBackupHandler);
  });

  ['/api/admin/backups/:backupId/restore', '/v1/admin/backups/:backupId/restore', '/api/v1/admin/backups/:backupId/restore'].forEach((path) => {
    fastify.post(path, restoreBackupHandler);
  });
}
