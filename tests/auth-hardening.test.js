import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrap, client } from './helpers.js';

let env;
before(async () => {
  env = await bootstrap();
  const { hashPassword } = await import('../server/lib/password.js');
  for (const [id, mustChange] of [['initial-teacher', 1], ['rate-teacher', 0], ['rotate-teacher', 0]]) {
    env.q.run("INSERT INTO users(login_id,password_hash,role,must_change_password) VALUES(?,?,'teacher',?)", id, hashPassword('initial-password'), mustChange);
  }
});
after(async () => {
  if (!env) return;
  await new Promise(resolve => env.server.close(resolve));
  fs.rmSync(env.dir, { recursive: true, force: true });
});

test('初期パスワード変更は教員APIと画像APIへの直接アクセスにも強制する', async () => {
  const c = client(env.base);
  assert.equal((await c.login('initial-teacher', 'initial-password')).status, 200);
  assert.equal((await c.get('/api/auth/me')).data.user.mustChangePassword, true);
  for (const path of ['/api/teacher/classes', '/api/files/images/123', '/api/learning/lessons']) {
    const blocked = await c.get(path);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'PASSWORD_CHANGE_REQUIRED');
  }
  assert.equal((await c.post('/api/auth/password', { current: 'initial-password', next: 'initial-password' })).status, 400);
  assert.equal((await c.post('/api/auth/password', { current: 'initial-password', next: 'updated-password' })).status, 200);
  assert.equal((await c.get('/api/auth/me')).data.user.mustChangePassword, false);
  assert.equal((await c.get('/api/teacher/classes')).status, 200);
});

test('パスワード変更で他の既存セッションを失効し、変更した端末は再発行されたセッションを使う', async () => {
  const current = client(env.base), other = client(env.base);
  await current.login('rotate-teacher', 'initial-password');
  await other.login('rotate-teacher', 'initial-password');
  assert.equal((await other.get('/api/teacher/classes')).status, 200);
  assert.equal((await current.post('/api/auth/password', { current: 'initial-password', next: 'rotated-password' })).status, 200);
  assert.equal((await current.get('/api/teacher/classes')).status, 200);
  assert.equal((await other.get('/api/teacher/classes')).status, 401);
  const fresh = client(env.base);
  assert.equal((await fresh.login('rotate-teacher', 'initial-password')).status, 401);
  assert.equal((await fresh.login('rotate-teacher', 'rotated-password')).status, 200);
  const userId = env.q.one("SELECT id FROM users WHERE login_id='rotate-teacher'").id;
  assert.equal(env.q.one('SELECT COUNT(*) n FROM sessions WHERE user_id=?', userId).n, 2);
});

test('IDの前後の空白を変えても同じアカウントの試行上限が適用される', async () => {
  const c = client(env.base);
  for (let i = 0; i < 10; i++) {
    assert.equal((await c.login(' '.repeat(i) + 'rate-teacher' + ' '.repeat(i), 'wrong-password')).status, 401);
  }
  assert.equal((await c.login('rate-teacher', 'initial-password')).status, 429);
  assert.equal((await c.login('  rate-teacher  ', 'initial-password')).status, 429);
});

test('本番AI設定は未知プロバイダ・海外構成・確認未了を拒否する', async () => {
  const { config, productionConfigProblems } = await import('../server/config.js');
  const base = {
    ...config, isProd: true, publicBaseUrl: 'https://example.invalid',
    pseudoSecret: 'a'.repeat(32), encryptionKey: Buffer.alloc(32),
    ai: { ...config.ai, provider: 'bedrock', awsRegion: 'ap-northeast-1', domesticProcessingConfirmed: true },
  };
  assert.deepEqual(productionConfigProblems(base), []);
  const check = ai => productionConfigProblems({ ...base, ai: { ...base.ai, ...ai } });
  assert.ok(check({ provider: 'typo' }).some(x => x.includes('AI_PROVIDER')));
  assert.ok(check({ provider: 'anthropic' }).some(x => x.includes('AI_PROVIDER')));
  assert.ok(check({ domesticProcessingConfirmed: false }).some(x => x.includes('AI_DOMESTIC_PROCESSING_CONFIRMED')));
  assert.ok(check({ awsRegion: 'us-east-1' }).some(x => x.includes('AWS_REGION')));
  assert.ok(check({ bedrockModelText: 'global.anthropic.example' }).some(x => x.includes('BEDROCK_MODEL')));
});

test('未知AIプロバイダをmockへ黙って置き換えない', async () => {
  const { config } = await import('../server/config.js');
  const { ai } = await import('../server/ai/index.js');
  const previous = config.ai.provider;
  try { config.ai.provider = 'typo'; assert.throws(() => ai(), /AI_PROVIDER/); }
  finally { config.ai.provider = previous; }
});

test('IDを変え続けるログイン試行にもIP側の上限を適用する', async () => {
  const c = client(env.base);
  let blocked = false;
  for (let i = 0; i < 301; i++) {
    const result = await c.login(`nonexistent-account-${i}`, 'wrong-password');
    if (result.status === 429) { blocked = true; break; }
    assert.equal(result.status, 401);
  }
  assert.equal(blocked, true);
  assert.equal((await c.login('different-new-account', 'wrong-password')).status, 429);
});
