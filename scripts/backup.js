// 日次バックアップ（cron例: 0 2 * * * cd /opt/mirai-next-poc && npm run backup）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb } from '../server/db.js';
import { config } from '../server/config.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.env.BACKUP_DIR || './backups', stamp);
fs.mkdirSync(outDir, { recursive: true });
const db = openDb();
db.exec(`VACUUM INTO '${path.join(outDir, 'mirai-next.db').replace(/'/g, "''")}'`); // 稼働中でも整合性のあるコピー
fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });
execFileSync('tar', ['-czf', path.join(outDir, 'uploads.tar.gz'), '-C', config.dataDir, 'uploads'], { stdio: 'inherit' });
const keep = Number(process.env.BACKUP_KEEP_DAYS || 14);
const root = path.dirname(outDir);
for (const d of fs.readdirSync(root).sort().slice(0, -keep)) fs.rmSync(path.join(root, d), { recursive: true, force: true });
console.log('backup:', outDir);
