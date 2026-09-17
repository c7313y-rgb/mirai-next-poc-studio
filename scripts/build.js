import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  cwd: new URL('../client/', import.meta.url),
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
