import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const env = {
  ...process.env,
  NODE_ENV: 'development',
  DEMO_MODE: 'true',
  AI_PROVIDER: 'mock',
  DATA_DIR: process.env.DEMO_DATA_DIR || './data-demo',
};
const run = (script) => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', script], {
    stdio: 'inherit',
    env,
  });
  if (r.status !== 0) process.exit(r.status || 1);
};
run('scripts/build.js');
if (!fs.existsSync(`${env.DATA_DIR}/mirai-next.db`)) run('scripts/seed-demo.js');
run('scripts/seed-learning.js');
run('scripts/seed-journey.js');
run('server/index.js');
