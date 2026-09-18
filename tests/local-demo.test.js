import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveLocalSettings, startLocalDemo, localStatus, stopLocalDemo } from '../scripts/local-demo.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const launcherUrl = new URL('../scripts/local-demo.mjs', import.meta.url).href;
const freePort = async () => { const s = net.createServer(); await new Promise(resolve => s.listen(0, '127.0.0.1', resolve)); const port = s.address().port; await new Promise(resolve => s.close(resolve)); return port; };
async function fixture(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-local-test-'));
  const port = await freePort();
  fs.mkdirSync(path.join(root, 'server')); fs.mkdirSync(path.join(root, 'client/dist'), { recursive: true }); fs.mkdirSync(path.join(root, 'saved data'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(root, 'client/dist/index.html'), '<h1>fixture</h1>');
  fs.writeFileSync(path.join(root, 'saved data/mirai-next.db'), 'existing database sentinel');
  fs.writeFileSync(path.join(root, '.env'), `NODE_ENV=development\nDEMO_MODE=true\nAI_PROVIDER=mock\nDATA_DIR="./saved data"\nPORT=${port}\n`);
  fs.writeFileSync(path.join(root, 'server/index.js'), source || `import http from 'node:http'; http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,service:'mirai-next-poc-studio',ai:'mock'}));}).listen(Number(process.env.PORT),'127.0.0.1'); console.log('fixture server started');`);
  const env = { ...process.env }; for (const key of ['NODE_ENV','DEMO_MODE','AI_PROVIDER','DATA_DIR','PORT']) delete env[key];
  return { root, port, env, cleanup: async () => { await stopLocalDemo({ root, env }); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('ローカル設定は.envと明示環境変数を尊重し、保存先・設定を書き換えない', async () => {
  const f = await fixture();
  try {
    const original = fs.readFileSync(path.join(f.root, '.env'), 'utf8');
    const settings = resolveLocalSettings(f.root, f.env);
    assert.equal(settings.dataDir, path.join(f.root, 'saved data')); assert.equal(settings.port, f.port);
    assert.equal(resolveLocalSettings(f.root, { ...f.env, PORT: '3210' }).port, 3210);
    await assert.rejects(() => startLocalDemo({ root: f.root, env: { ...f.env, NODE_ENV: 'production' } }), /ローカルデモ専用/);
    fs.unlinkSync(path.join(f.root, 'saved data/mirai-next.db'));
    await assert.rejects(() => startLocalDemo({ root: f.root, env: f.env }), /DBが見つかりません/);
    assert.equal(fs.existsSync(path.join(f.root, 'saved data/mirai-next.db')), false);
    assert.equal(fs.readFileSync(path.join(f.root, '.env'), 'utf8'), original);
  } finally { await f.cleanup(); }
});

test('起動元の終了後も動作し、二重起動せず、安全な管理経路から停止する', async () => {
  const f = await fixture();
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {startLocalDemo} from ${JSON.stringify(launcherUrl)}; console.log(JSON.stringify(await startLocalDemo({root:process.env.TEST_DEMO_ROOT,timeoutMs:8000})));`], { env: { ...f.env, TEST_DEMO_ROOT: f.root }, encoding: 'utf8', timeout: 12000 });
    assert.equal(result.status, 0, result.stderr);
    const first = JSON.parse(result.stdout.trim());
    assert.equal(first.running, true); assert.equal(first.managed, true);
    const live = await localStatus({ root: f.root, env: f.env });
    assert.equal(live.running, true, '起動処理の子プロセス終了後もサーバーは動作する');
    const again = await startLocalDemo({ root: f.root, env: f.env, timeoutMs: 8000 });
    assert.equal(again.alreadyRunning, true); assert.equal(again.serverPid, first.serverPid);
    assert.equal(fs.readFileSync(path.join(f.root, 'saved data/mirai-next.db'), 'utf8'), 'existing database sentinel');
    assert.equal(fs.statSync(resolveLocalSettings(f.root, f.env).stateFile).mode & 0o777, 0o600);
    assert.equal((await stopLocalDemo({ root: f.root, env: f.env })).stopped, true);
    assert.equal((await localStatus({ root: f.root, env: f.env })).running, false);
    assert.equal((await stopLocalDemo({ root: f.root, env: f.env })).stopped, false);
  } finally { await f.cleanup(); }
});

test('別サービスのポートを奪わず、停止命令も送らない', async () => {
  const f = await fixture();
  const other = http.createServer((_req, res) => res.end('unrelated service'));
  await new Promise(resolve => other.listen(f.port, '127.0.0.1', resolve));
  try {
    await assert.rejects(() => startLocalDemo({ root: f.root, env: f.env }), /別のサービス/);
    assert.equal((await stopLocalDemo({ root: f.root, env: f.env })).stopped, false);
    assert.equal(await (await fetch(`http://127.0.0.1:${f.port}`)).text(), 'unrelated service');
  } finally { await new Promise(resolve => other.close(resolve)); await f.cleanup(); }
});

test('起動失敗はログと理由を残し、ロックを解放する', async () => {
  const f = await fixture("console.error('fixture startup failure'); process.exit(2);");
  try {
    await assert.rejects(() => startLocalDemo({ root: f.root, env: f.env, timeoutMs: 3000 }), /応答を確認できません/);
    const settings = resolveLocalSettings(f.root, f.env);
    assert.match(fs.readFileSync(settings.logFile, 'utf8'), /fixture startup failure/);
    assert.equal(fs.existsSync(settings.lockDir), false);
    assert.equal((await localStatus({ root: f.root, env: f.env })).running, false);
  } finally { await f.cleanup(); }
});

test('PORT変更後も実稼働URLを示し、停止前の二重起動を拒否する。不正PORTでも停止できる', async () => {
  const f = await fixture();
  try {
    const original = fs.readFileSync(path.join(f.root, '.env'), 'utf8');
    const first = await startLocalDemo({ root: f.root, env: f.env, timeoutMs: 8000 });
    const settings = resolveLocalSettings(f.root, f.env);
    const stateBefore = fs.readFileSync(settings.stateFile, 'utf8');
    const replacementPort = await freePort();
    fs.writeFileSync(path.join(f.root, '.env'), original.replace(`PORT=${f.port}`, `PORT=${replacementPort}`));
    const status = await localStatus({ root: f.root, env: f.env });
    assert.equal(status.running, true); assert.equal(status.managed, true);
    assert.equal(status.port, f.port); assert.equal(status.url, first.url); assert.equal(status.requestedPort, replacementPort);
    assert.equal(status.configurationChanged, true); assert.deepEqual(status.changedKeys, ['PORT']);
    await assert.rejects(() => startLocalDemo({ root: f.root, env: f.env }), /設定.*異なる.*PORT.*stop後/s);
    assert.equal(fs.readFileSync(settings.stateFile, 'utf8'), stateBefore);
    assert.equal((await localStatus({ root: f.root, env: f.env })).serverPid, first.serverPid);
    assert.equal((await stopLocalDemo({ root: f.root, env: f.env })).stopped, true);
    const restarted = await startLocalDemo({ root: f.root, env: f.env, timeoutMs: 8000 });
    assert.equal(restarted.port, replacementPort); assert.equal(restarted.configurationChanged, false);
    assert.notEqual(restarted.serverPid, first.serverPid);
    fs.writeFileSync(path.join(f.root, '.env'), original.replace(`PORT=${f.port}`, 'PORT=not-a-port'));
    const invalidStatus = await localStatus({ root: f.root, env: f.env });
    assert.equal(invalidStatus.port, replacementPort); assert.equal(invalidStatus.running, true);
    assert.match(invalidStatus.configurationError, /PORT/);
    await assert.rejects(() => startLocalDemo({ root: f.root, env: f.env }), /PORT/);
    assert.equal((await stopLocalDemo({ root: f.root, env: f.env })).stopped, true);
  } finally { await f.cleanup(); }
});

test('DATA_DIRやAI設定の変更を現在の稼働設定と混同せず、再起動後にだけ適用する', async () => {
  const f = await fixture();
  try {
    const first = await startLocalDemo({ root: f.root, env: f.env, timeoutMs: 8000 });
    const settings = resolveLocalSettings(f.root, f.env), stateBefore = fs.readFileSync(settings.stateFile, 'utf8');
    const original = fs.readFileSync(path.join(f.root, '.env'), 'utf8');
    const nextData = path.join(f.root, 'other saved data');
    fs.writeFileSync(path.join(f.root, '.env'), original.replace('./saved data', './other saved data') + 'AI_MONTHLY_REQUEST_LIMIT=1200\n');
    const status = await localStatus({ root: f.root, env: f.env });
    assert.equal(status.dataDir, path.join(f.root, 'saved data')); assert.equal(status.requestedDataDir, nextData);
    assert.deepEqual(status.changedKeys.sort(), ['AI_MONTHLY_REQUEST_LIMIT', 'DATA_DIR']);
    await assert.rejects(() => startLocalDemo({ root: f.root, env: f.env }), /設定.*stop後/s);
    assert.equal(fs.existsSync(nextData), false, '新しい保存先は勝手に作らない');
    assert.equal(fs.readFileSync(settings.stateFile, 'utf8'), stateBefore);
    assert.equal((await localStatus({ root: f.root, env: f.env })).serverPid, first.serverPid);
    assert.equal((await stopLocalDemo({ root: f.root, env: f.env })).stopped, true);
    fs.mkdirSync(nextData); fs.writeFileSync(path.join(nextData, 'mirai-next.db'), 'second existing database');
    const restarted = await startLocalDemo({ root: f.root, env: f.env, timeoutMs: 8000 });
    assert.equal(restarted.dataDir, nextData); assert.equal(restarted.configurationChanged, false);
    assert.equal(fs.readFileSync(path.join(f.root, 'saved data/mirai-next.db'), 'utf8'), 'existing database sentinel');
    assert.equal(fs.readFileSync(path.join(nextData, 'mirai-next.db'), 'utf8'), 'second existing database');
  } finally { await f.cleanup(); }
});

test('管理情報が欠損・不一致でも生存中のソケットを削除せず、別ポートに二重起動しない', async () => {
  const f = await fixture(); let originalState, settings;
  try {
    const first = await startLocalDemo({ root: f.root, env: f.env, timeoutMs: 8000 });
    settings = resolveLocalSettings(f.root, f.env); originalState = fs.readFileSync(settings.stateFile, 'utf8');
    const socketInode = fs.statSync(settings.socketPath).ino;
    const changedEnv = { ...f.env, PORT: String(await freePort()) };
    for (const damage of ['missing', 'wrong-token', 'wrong-root']) {
      if (damage === 'missing') fs.unlinkSync(settings.stateFile);
      else { const state = JSON.parse(originalState); if (damage === 'wrong-token') state.token = 'incorrect-token'; else state.root += '-wrong'; fs.writeFileSync(settings.stateFile, JSON.stringify(state)); }
      await assert.rejects(() => startLocalDemo({ root: f.root, env: changedEnv }), /管理ソケット.*二重起動/s, damage);
      assert.equal(fs.statSync(settings.socketPath).ino, socketInode, damage);
      assert.equal((await (await fetch(first.url + 'api/health')).json()).ok, true, damage);
      if (damage === 'missing') assert.equal(fs.existsSync(settings.stateFile), false);
      else assert.notEqual(fs.readFileSync(settings.stateFile, 'utf8'), originalState);
      fs.writeFileSync(settings.stateFile, originalState);
      assert.equal((await localStatus({ root: f.root, env: f.env })).serverPid, first.serverPid);
    }
  } finally { if (originalState && settings) fs.writeFileSync(settings.stateFile, originalState); await f.cleanup(); }
});
