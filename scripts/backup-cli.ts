import {
  createPlatformBackup,
  deletePlatformBackup,
  listPlatformBackups,
  restorePlatformBackup,
  verifyPlatformBackup,
} from '../apps/api/src/admin/backups/backup-service.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  switch (command) {
    case 'create': {
      console.log('Creating platform database backup...');
      const bkp = await createPlatformBackup({ actorId: 'cli_admin', backupType: 'manual', encrypt: true });
      console.log(`✅ Backup created successfully! ID: ${bkp.id}, File: ${bkp.filename}, Size: ${bkp.sizeBytes} bytes`);
      break;
    }
    case 'list': {
      console.log('Fetching platform backup catalog...');
      const list = await listPlatformBackups();
      console.table(
        list.map((b) => ({
          ID: b.id,
          Filename: b.filename,
          Status: b.status,
          Verification: b.verificationStatus,
          Size: `${b.sizeBytes} bytes`,
          Encrypted: b.encrypted,
          Created: b.createdAt,
        }))
      );
      break;
    }
    case 'verify': {
      const idIdx = args.indexOf('--id');
      const backupId = idIdx !== -1 ? args[idIdx + 1] : null;
      if (!backupId) {
        console.error('Error: --id <backupId> is required for verify command');
        process.exit(1);
      }
      const verified = await verifyPlatformBackup(backupId, 'cli_admin');
      console.log(`✅ Backup verification result: ${verified.verificationStatus}`);
      break;
    }
    case 'restore': {
      const idIdx = args.indexOf('--id');
      const backupId = idIdx !== -1 ? args[idIdx + 1] : null;
      if (!backupId) {
        console.error('Error: --id <backupId> is required for restore command');
        process.exit(1);
      }
      console.log(`Executing pre-restore safety backup and restoring backup ID: ${backupId}...`);
      const result = await restorePlatformBackup({ backupId, actorId: 'cli_admin', confirmRestore: true });
      console.log(`✅ Database restoration completed! Safety Backup ID: ${result.safetyBackupId}`);
      break;
    }
    default:
      console.log('Usage: pnpm backup:create | pnpm backup:list | pnpm backup:verify --id <id> | pnpm backup:restore --id <id>');
      break;
  }
}

main().catch((err) => {
  console.error('CLI Backup Error:', err.message || err);
  process.exit(1);
});
