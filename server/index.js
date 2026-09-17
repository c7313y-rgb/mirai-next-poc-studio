import { config, assertProductionConfig } from './config.js';
import { openDb, q } from './db.js';
import { createApp } from './app.js';
import { startWorker } from './jobs.js';
import { DEFAULT_SURVEYS } from './lib/surveys.js';

assertProductionConfig();
openDb();

// 初回起動時に既定アンケートを作成
if (!q.one('SELECT 1 FROM surveys')) {
  for (const s of DEFAULT_SURVEYS) q.run('INSERT INTO surveys(title, kind, questions) VALUES(?,?,?)', s.title, s.kind, JSON.stringify(s.questions));
}

startWorker();
createApp().listen(config.port, () => {
  console.log(`副担任mirAI NEXT PoC: ${config.publicBaseUrl}（port ${config.port} / AI=${config.ai.provider}）`);
  if (!q.one("SELECT 1 FROM users WHERE role='admin'")) console.log('運営管理者がいません。npm run create-admin -- <login_id> で作成してください。');
});
