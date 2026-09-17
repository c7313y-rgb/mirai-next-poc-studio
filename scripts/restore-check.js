import '../server/config.js';
import { verifyBackup } from '../server/lib/backup.js';
if (!process.argv[2]) { console.error('Usage: node scripts/restore-check.js <backup.mirai-backup.enc>'); process.exit(1); }
try {
  console.log(JSON.stringify(await verifyBackup({ backupPath: process.argv[2], encryptionKey: process.env.BACKUP_ENCRYPTION_KEY, dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY })));
} catch (error) { console.error('Restore check failed:', error.message); process.exitCode = 1; }
