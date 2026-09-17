import path from 'node:path';
import { config } from '../server/config.js';
import { createBackup } from '../server/lib/backup.js';
try {
  const result = await createBackup({ dataDir: config.dataDir, backupDir: path.resolve(process.env.BACKUP_DIR || './backups'), encryptionKey: process.env.BACKUP_ENCRYPTION_KEY, keepDays: Number(process.env.BACKUP_KEEP_DAYS || 14) });
  console.log(JSON.stringify(result));
} catch (error) { console.error('Backup failed:', error.message); process.exitCode = 1; }
