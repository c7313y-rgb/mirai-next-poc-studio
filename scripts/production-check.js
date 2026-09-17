import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, productionConfigProblems } from '../server/config.js';
const checks = [];
const add = (name, ok, action) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { action }) });
add('NODE_ENV', config.isProd, 'Set NODE_ENV=production');
add('DEMO_MODE', !config.demoMode, 'Use DEMO_MODE=false and a separate production database');
const problems = productionConfigProblems({ ...config, isProd: true });
add('production configuration', problems.length === 0, problems.join('; '));
add('real domestic AI', config.ai.provider === 'bedrock', 'Configure and test approved domestic Bedrock before field acceptance');
add('backup encryption key', Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '', 'base64').length === 32, 'Configure a separate 32-byte BACKUP_ENCRYPTION_KEY');
add('built frontend', fs.existsSync(path.resolve('client/dist/index.html')), 'Run npm run build');
add('proxy configuration', /^[0-3]$/.test(process.env.TRUST_PROXY_HOPS || '0'), 'Set the verified number of trusted proxy hops (0–3)');
const dbPath = path.join(config.dataDir, 'mirai-next.db');
add('production database', fs.existsSync(dbPath), 'Initialize production database and issue real accounts');
if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    add('database integrity', db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'Investigate database integrity');
    add('administrator account', db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1").get().n > 0, 'Issue a production administrator account');
    const demo = db.prepare("SELECT value FROM settings WHERE key='demo_user_ids'").get();
    add('demo data separation', !demo || !JSON.parse(demo.value)?.length, 'Start from a clean database; do not reuse demo data');
  } finally { db.close(); }
}
console.log(JSON.stringify({ readyForManualAcceptance: checks.every((x) => x.ok), checks, note: 'Configuration checks do not certify TLS, cloud region, real AI quality, restoration, school usability, or mirAI import success.' }, null, 2));
if (checks.some((x) => !x.ok)) process.exitCode = 1;
