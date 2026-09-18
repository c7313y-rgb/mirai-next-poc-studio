import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), '..');
const SERVICE = 'mirai-next-poc-studio';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const CONFIG_KEYS = ['NODE_ENV', 'DEMO_MODE', 'PORT', 'DATA_DIR', 'PUBLIC_BASE_URL', 'PSEUDO_ID_SECRET', 'DATA_ENCRYPTION_KEY', 'EXPORT_ID_MODE', 'TRUST_PROXY_HOPS'];

// Management paths depend only on the project, never on a mutable .env file.
function runtimePaths(root = defaultRoot) {
  root = path.resolve(root);
  const stateDir = path.join(root, '.local-demo');
  const hash = crypto.createHash('sha256').update(`${process.getuid?.() ?? ''}:${root}`).digest('hex').slice(0, 18);
  return { root, stateDir, stateFile: path.join(stateDir, 'runtime.json'), lockDir: path.join(stateDir, 'start.lock'), logFile: path.join(stateDir, 'server.log'), socketPath: path.join(os.tmpdir(), `mirai-${hash}.sock`) };
}
function configurationHashes(settings, dotenvKeys) {
  const keys = new Set([...CONFIG_KEYS, ...dotenvKeys, ...Object.keys(settings.env).filter(key => /^(AI_|AWS_|BEDROCK_|ANTHROPIC_)/.test(key))]);
  return Object.fromEntries([...keys].sort().map(key => {
    const value = key === 'PORT' ? settings.port : key === 'DATA_DIR' ? settings.dataDir : settings.env[key] ?? null;
    return [key, crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')];
  }));
}

export function resolveLocalSettings(root = defaultRoot, environment = process.env) {
  root = path.resolve(root);
  const env = { ...environment };
  const dotenvKeys = [];
  const dotenv = path.join(root, '.env');
  if (fs.existsSync(dotenv)) for (const line of fs.readFileSync(dotenv, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) { dotenvKeys.push(match[1]); if (env[match[1]] === undefined) env[match[1]] = match[2].replace(/^["']|["']$/g, ''); }
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORTは1〜65535の整数で設定してください。');
  const settings = { ...runtimePaths(root), env, port, url: `http://localhost:${port}/`, dataDir: path.resolve(root, env.DATA_DIR || './data') };
  settings.configHashes = configurationHashes(settings, dotenvKeys);
  return settings;
}
function preflight(settings) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node.js 22.13以上が必要です。Nodeを更新して再実行してください。');
  if (settings.env.NODE_ENV === 'production' || settings.env.DEMO_MODE !== 'true') throw new Error('このランチャーは既存のローカルデモ専用です。.envのDEMO_MODE=true・非production環境を確認してください。設定は自動変更しません。');
  if (!fs.existsSync(path.join(settings.root, 'server/index.js'))) throw new Error('server/index.jsが見つかりません。プロジェクト内のランチャーを使用してください。');
  if (!fs.existsSync(path.join(settings.dataDir, 'mirai-next.db'))) throw new Error(`保存済みDBが見つかりません：${settings.dataDir}。初回のデモ準備はREADMEを参照してください。このランチャーはDBを作成・リセットしません。`);
  if (!fs.existsSync(path.join(settings.root, 'client/dist/index.html'))) throw new Error('画面のビルドがありません。プロジェクトで npm run build を実行してから再度開いてください。');
  try { const require = createRequire(path.join(settings.root, 'package.json')); require.resolve('express'); require.resolve('sharp'); }
  catch { throw new Error('依存関係が不足しています。プロジェクトで npm run setup を実行してから再度開いてください。'); }
}
async function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.setTimeout(700, () => done(true));
  });
}
export async function probeLocalServer(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(900) });
    const data = await response.json();
    if (response.ok && data.ok === true && data.service === SERVICE) return { healthy: true, recognized: true };
    // Compatibility with the existing v0.4.0 health response. Never stop this unmanaged server.
    if (response.ok && data.ok === true && typeof data.ai === 'string' && !data.service) {
      const auth = await fetch(`http://127.0.0.1:${port}/api/auth/config`, { signal: AbortSignal.timeout(900) });
      const config = await auth.json();
      if (auth.ok && typeof config.demoMode === 'boolean' && typeof config.aiMode === 'string' && config.accounts && typeof config.accounts === 'object') return { healthy: true, recognized: true, legacy: true };
    }
    return { healthy: false, recognized: false };
  } catch { return { healthy: false, recognized: false }; }
}
function control(settings, command) {
  const state = readJson(settings.stateFile);
  if (!state?.token || state.root !== settings.root) return Promise.resolve(null);
  return new Promise(resolve => {
    const socket = net.createConnection(settings.socketPath); let data = '', done = false;
    const finish = value => { if (done) return; done = true; socket.destroy(); resolve(value); };
    socket.setTimeout(1500, () => finish(null)); socket.once('error', () => finish(null));
    socket.once('connect', () => socket.write(JSON.stringify({ token: state.token, command }) + '\n'));
    socket.on('data', chunk => { data += chunk.toString(); if (data.length > 32768) return finish(null); if (data.includes('\n')) { try {
      const response = JSON.parse(data.trim());
      finish(response.ok ? { port: state.port, configHashes: state.configHashes, ...response } : null);
    } catch { finish(null); } } });
    socket.once('end', () => finish(null));
  });
}
async function socketMayBeAlive(socketPath) {
  return new Promise(resolve => {
    const socket = net.createConnection(socketPath);
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true));
    // Only positively stale/missing sockets can be removed; uncertain failures stay protected.
    socket.once('error', error => done(!['ENOENT', 'ECONNREFUSED'].includes(error.code)));
    socket.setTimeout(1500, () => done(true));
  });
}
function prepareState(settings) {
  fs.mkdirSync(settings.stateDir, { recursive: true, mode: 0o700 }); fs.chmodSync(settings.stateDir, 0o700);
}
function acquireLock(settings) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fs.mkdirSync(settings.lockDir, { mode: 0o700 }); fs.writeFileSync(path.join(settings.lockDir, 'owner.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600 }); return () => fs.rmSync(settings.lockDir, { recursive: true, force: true }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = readJson(path.join(settings.lockDir, 'owner.json'));
      if ((Number.isInteger(owner?.pid) && owner.pid > 0 && !exists(owner.pid)) || (!owner && Date.now() - fs.statSync(settings.lockDir).mtimeMs > 30000)) { fs.rmSync(settings.lockDir, { recursive: true, force: true }); continue; }
      throw new Error('別の起動処理が進行中です。少し待ってからもう一度開いてください。');
    }
  }
  throw new Error('起動ロックを取得できませんでした。');
}
function openBrowser(url) {
  if (process.platform !== 'darwin') return;
  const browser = spawn('open', [url], { detached: true, stdio: 'ignore' }); browser.on('error', () => {}); browser.unref();
}
export async function localStatus({ root = defaultRoot, env = process.env } = {}) {
  const paths = runtimePaths(root), managed = await control(paths, 'status');
  let settings, configurationError;
  try { settings = resolveLocalSettings(root, env); } catch (error) { if (!managed?.ok) throw error; configurationError = error.message; }
  const port = managed?.ok ? managed.port : settings.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('保存済みの実行ポートを確認できません。管理情報とログを確認してください。');
  const health = await probeLocalServer(port);
  const configurationVerified = Boolean(managed?.configHashes && settings);
  const changedKeys = configurationVerified ? [...new Set([...Object.keys(managed.configHashes), ...Object.keys(settings.configHashes)])].filter(key => managed.configHashes[key] !== settings.configHashes[key]) : [];
  return { running: health.healthy && health.recognized, managed: Boolean(managed?.ok), port, url: `http://localhost:${port}/`, ...(managed?.ok ? { serverPid: managed.serverPid, dataDir: managed.dataDir, configurationVerified, configurationChanged: !configurationVerified || changedKeys.length > 0, changedKeys, ...(settings ? { requestedPort: settings.port, requestedDataDir: settings.dataDir } : {}), ...(configurationError ? { configurationError } : {}) } : {}), logFile: paths.logFile };
}
export async function startLocalDemo({ root = defaultRoot, env = process.env, open = false, timeoutMs = 45000 } = {}) {
  const settings = resolveLocalSettings(root, env); prepareState(settings);
  const release = acquireLock(settings);
  try {
    const existing = await localStatus({ root, env });
    if (existing.managed && existing.configurationChanged) throw new Error(`起動中の設定と現在の設定が異なるか、設定の一致を確認できません（${existing.changedKeys.join(' / ') || '以前のランチャーの管理情報'}）。稼働中：${existing.url} / 保存先：${existing.dataDir}。このランチャーのstop後にstartしてください。`);
    if (!existing.managed && await socketMayBeAlive(settings.socketPath)) throw new Error('起動済みの管理ソケットがありますが、管理情報を照合できません。二重起動を防ぐため起動を中止しました。runtime.jsonの復元または起動元の確認が必要です。');
    preflight(settings);
    if (existing.running) { if (open) openBrowser(existing.url); return { ...existing, alreadyRunning: true }; }
    if (existing.managed) throw new Error(`起動済みプロセスの応答を確認できません。ログを確認し、このランチャーのstop後に再起動してください：${settings.logFile}`);
    if (await portOpen(settings.port)) throw new Error(`ポート${settings.port}は別のサービスが使用しています。既存プロセスは停止しません。PORT設定または使用中のサービスを確認してください。`);
    if (fs.existsSync(settings.socketPath)) {
      const socketStat = fs.lstatSync(settings.socketPath);
      if (!socketStat.isSocket() || (process.getuid && socketStat.uid !== process.getuid())) throw new Error('起動用ソケットを安全に準備できませんでした。');
      const state = readJson(settings.stateFile);
      if (await socketMayBeAlive(settings.socketPath) || (state?.root === settings.root && Number.isInteger(state.workerPid) && state.workerPid > 0 && exists(state.workerPid))) throw new Error('既存の管理プロセスが動作中の可能性があります。二重起動を防ぐため、stop後に再実行してください。');
      fs.unlinkSync(settings.socketPath);
    }
    if (fs.existsSync(settings.logFile) && fs.statSync(settings.logFile).size > 5 * 1024 * 1024) fs.renameSync(settings.logFile, `${settings.logFile}.1`);
    const fd = fs.openSync(settings.logFile, 'a', 0o600); fs.chmodSync(settings.logFile, 0o600);
    const token = crypto.randomBytes(32).toString('base64url');
    const worker = spawn(process.execPath, [scriptPath, '_worker', settings.root], { cwd: settings.root, env: { ...settings.env, MIRAI_LOCAL_CONTROL_TOKEN: token }, detached: true, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    let spawnError; worker.once('error', error => { spawnError = error; }); worker.unref();
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (spawnError) throw spawnError;
      const current = await localStatus({ root, env });
      if (current.running && current.managed) { if (open) openBrowser(current.url); return { ...current, alreadyRunning: false }; }
      if (worker.pid && !exists(worker.pid)) break;
      await pause(150);
    }
    // A timed-out process started by this launcher is stopped through authenticated control only.
    const stopped = await control(settings, 'stop');
    if (!stopped?.ok && worker.pid) worker.kill('SIGTERM');
    throw new Error(`起動後の応答を確認できませんでした。詳細ログ：${settings.logFile}。iCloud上のファイルが未取得の場合は、Finderでフォルダを「今すぐダウンロード」してから再実行してください。`);
  } finally { release(); }
}
export async function stopLocalDemo({ root = defaultRoot, env = process.env } = {}) {
  const settings = runtimePaths(root);
  const result = await control(settings, 'stop');
  if (!result?.ok) return { stopped: false, reason: 'このランチャーで管理しているプロセスはありません。別のサーバーは停止しません。' };
  for (let i = 0; i < 40; i++) { if (!await control(settings, 'status')) return { stopped: true }; await pause(100); }
  return { stopped: false, reason: `停止処理中です。ログを確認してください：${settings.logFile}` };
}

async function runWorker(root) {
  const settings = resolveLocalSettings(root), token = process.env.MIRAI_LOCAL_CONTROL_TOKEN;
  if (!token || token.length < 32) throw new Error('Worker must be started through the local launcher.');
  delete settings.env.MIRAI_LOCAL_CONTROL_TOKEN;
  preflight(settings);
  let child, stopping = false, killTimer;
  const cleanup = () => {
    const state = readJson(settings.stateFile);
    if (state?.token === token) {
      fs.rmSync(settings.stateFile, { force: true });
      try { fs.unlinkSync(settings.socketPath); } catch { /* already removed */ }
    }
  };
  const shutdown = () => {
    if (stopping) return; stopping = true;
    if (!child || child.exitCode !== null) return server.close(() => { cleanup(); process.exit(0); });
    child.kill('SIGTERM');
    killTimer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 4000); killTimer.unref();
  };
  const server = net.createServer(socket => {
    let input = '';
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('data', chunk => {
      input += chunk.toString(); if (input.length > 8192) return socket.destroy(); if (!input.includes('\n')) return;
      let message; try { message = JSON.parse(input.trim()); } catch { return socket.destroy(); }
      if (message.token !== token || !['status', 'stop'].includes(message.command)) return socket.destroy();
      socket.end(JSON.stringify({ ok: true, serverPid: child?.pid || null, port: settings.port, dataDir: settings.dataDir, configHashes: settings.configHashes }) + '\n');
      if (message.command === 'stop') setTimeout(shutdown, 50);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(settings.socketPath, resolve); });
  fs.chmodSync(settings.socketPath, 0o600);
  console.log(`[${new Date().toISOString()}] local demo start: ${settings.url} / data: ${settings.dataDir}`);
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(settings.root, 'server/index.js')], { cwd: settings.root, env: settings.env, stdio: ['ignore', 'inherit', 'inherit'] });
  fs.writeFileSync(settings.stateFile, JSON.stringify({ root: settings.root, port: settings.port, dataDir: settings.dataDir, configHashes: settings.configHashes, token, workerPid: process.pid, serverPid: child.pid, startedAt: new Date().toISOString() }), { mode: 0o600 });
  child.once('error', error => { console.error('Server launch failed:', error.message); stopping = true; server.close(() => { cleanup(); process.exit(1); }); });
  child.once('exit', (code, signal) => { clearTimeout(killTimer); console.log(`[${new Date().toISOString()}] local demo stopped: code=${code} signal=${signal}`); server.close(() => { cleanup(); process.exit(stopping ? 0 : code || 1); }); });
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2] || 'start';
  try {
    if (command === '_worker') await runWorker(process.argv[3]);
    else if (command === 'start') {
      const result = await startLocalDemo({ open: process.argv.includes('--open') });
      console.log(result.alreadyRunning ? '副担任mirAI NEXT は既に起動しています。二重起動しません。' : '副担任mirAI NEXT を起動しました。このウィンドウを閉じても動作します。');
      console.log(`画面：${result.url}`);
      if (result.dataDir) console.log(`保存先：${result.dataDir}`);
      if (!result.managed) console.log('既存サーバーを利用しています。その保存先・停止操作はこのランチャーの管理外です。');
      console.log(`ログ：${result.logFile}`);
      console.log('Macの再起動後は、もう一度 start-local-demo.command を開いてください。');
    } else if (command === 'status') console.log(JSON.stringify(await localStatus(), null, 2));
    else if (command === 'stop') { const result = await stopLocalDemo(); console.log(result.stopped ? 'このランチャーで起動したサーバーを停止しました。' : result.reason); }
    else throw new Error('使い方：node scripts/local-demo.mjs start [--open] | status | stop');
  } catch (error) { console.error(`起動・確認できませんでした：${error.message}`); process.exitCode = 1; }
}
