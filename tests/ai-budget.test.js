import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aiBudgetMonth, reserveAiRequest, sendWithAiBudget, validateAiRequest } from '../server/lib/ai-budget.js';
import { config, productionConfigProblems } from '../server/config.js';
import { openDb, q } from '../server/db.js';
import { ai } from '../server/ai/index.js';

function budgetDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  return db;
}
const request = { prompt: '今日の学びを振り返ります。' };
const fixedNow = new Date('2026-09-18T01:00:00Z');
const options = (db, limit = 3) => ({ db, limit, now: fixedNow, maxInputChars: 24000, maxImages: 3, maxImageBytes: 10 * 1024 * 1024 });

test('JSTの月境界で別枠となり、再起動しても同月の呼出数が残る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-budget-'));
  const file = path.join(dir, 'budget.db');
  let db = budgetDb(file);
  try {
    assert.equal(aiBudgetMonth('2026-09-30T14:59:59Z'), '2026-09');
    assert.equal(aiBudgetMonth('2026-09-30T15:00:00Z'), '2026-10');
    assert.equal(reserveAiRequest(options(db, 2)).remaining, 1);
    db.close();
    db = budgetDb(file);
    assert.equal(reserveAiRequest(options(db, 2)).count, 2);
    assert.throws(() => reserveAiRequest(options(db, 2)), { code: 'AI_MONTHLY_LIMIT' });
    assert.equal(reserveAiRequest({ ...options(db, 2), now: '2026-09-30T15:00:00Z' }).count, 1);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('並列呼出でも非同期送信の前に予約し、上限を超えた送信を行わない', async () => {
  const db = budgetDb();
  let sent = 0;
  try {
    const send = async () => { sent++; await new Promise(resolve => setTimeout(resolve, 5)); return 'ok'; };
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => sendWithAiBudget(send, request, options(db, 3))));
    assert.equal(sent, 3);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
    assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'AI_MONTHLY_LIMIT').length, 17);
    assert.equal(db.prepare('SELECT value FROM settings').get().value, '3');
  } finally { db.close(); }
});

test('送信失敗も返金せず、worker等の再試行は新たな1回として数える', async () => {
  const db = budgetDb();
  let sent = 0;
  try {
    const send = async () => { sent++; if (sent === 1) throw new Error('通信切断'); return 'retry ok'; };
    await assert.rejects(sendWithAiBudget(send, request, options(db, 2)), /通信切断/);
    assert.equal(await sendWithAiBudget(send, request, options(db, 2)), 'retry ok');
    await assert.rejects(sendWithAiBudget(send, request, options(db, 2)), { code: 'AI_MONTHLY_LIMIT' });
    assert.equal(sent, 2);
    assert.equal(db.prepare('SELECT value FROM settings').get().value, '2');
  } finally { db.close(); }
});

test('24000文字・画像3枚まで受け付け、超過入力は予約も外部送信もしない', async () => {
  const db = budgetDb();
  let sent = 0;
  const image = { mime: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) };
  try {
    const send = async () => { sent++; return 'ok'; };
    const result = await sendWithAiBudget(send, { prompt: '学'.repeat(24000), images: [image, image, image] }, options(db));
    assert.equal(result, 'ok');
    for (const input of [
      { prompt: '学'.repeat(24001) },
      { prompt: '💡'.repeat(24001) },
      { ...request, images: [image, image, image, image] },
      { ...request, images: [{ ...image, mime: 'text/html' }] },
      { ...request, images: [{ ...image, buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }] },
    ]) await assert.rejects(sendWithAiBudget(send, input, options(db)), { code: 'AI_INPUT_LIMIT' });
    assert.equal(sent, 1);
    assert.equal(db.prepare('SELECT value FROM settings').get().value, '1');
    assert.doesNotThrow(() => validateAiRequest({ prompt: '💡'.repeat(24000) }, options(db)));
    assert.throws(() => validateAiRequest({ prompt: '123456' }, { ...options(db), maxInputChars: 5 }), { code: 'AI_INPUT_LIMIT' });
  } finally { db.close(); }
});

test('0件設定・不正な設定・壊れたカウンタでは送信を止める', async () => {
  const db = budgetDb();
  let sent = 0;
  const send = async () => { sent++; };
  try {
    await assert.rejects(sendWithAiBudget(send, request, options(db, 0)), { code: 'AI_MONTHLY_LIMIT' });
    for (const limit of [-1, 1.5, NaN, Infinity]) {
      await assert.rejects(sendWithAiBudget(send, request, options(db, limit)), { code: 'AI_BUDGET_CONFIG' });
    }
    for (const maxInputChars of [0, -1, 24001, NaN]) {
      await assert.rejects(sendWithAiBudget(send, request, { ...options(db), maxInputChars }), { code: 'AI_BUDGET_CONFIG' });
    }
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('ai_request_count:2026-09', 'broken');
    await assert.rejects(sendWithAiBudget(send, request, options(db)), { code: 'AI_BUDGET_CONFIG' });
    assert.equal(sent, 0);
    assert.equal(db.prepare('SELECT value FROM settings').get().value, 'broken');
  } finally { db.close(); }
});

test('実AIの送信層を共通上限で止め、mockは件数枠を消費しない', async () => {
  const previous = { ...config.ai };
  const fetchBefore = globalThis.fetch;
  const db = openDb(':memory:');
  let sent = 0;
  try {
    config.ai.monthlyRequestLimit = 2;
    config.ai.provider = 'anthropic';
    globalThis.fetch = async () => {
      sent++;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '学びの要約' }] }), { status: 200 });
    };
    assert.equal(await ai().periodSummary({ texts: ['学び'] }), '学びの要約');
    assert.equal(await ai().periodSummary({ texts: ['学び'] }), '学びの要約');
    await assert.rejects(ai().periodSummary({ texts: ['学び'] }), { code: 'AI_MONTHLY_LIMIT' });
    config.ai.provider = 'bedrock';
    await assert.rejects(ai().periodSummary({ texts: ['学び'] }), { code: 'AI_MONTHLY_LIMIT' });
    config.ai.provider = 'mock';
    config.ai.monthlyRequestLimit = 0;
    assert.match(await ai().periodSummary({ texts: ['学び'] }), /デモ要約/);
    assert.equal(sent, 2);
    assert.equal(q.one("SELECT value FROM settings WHERE key LIKE 'ai_request_count:%'").value, '2');
  } finally {
    Object.assign(config.ai, previous);
    globalThis.fetch = fetchBefore;
    db.close();
  }
});

test('本番Bedrock起動時に不正な利用制限設定を検出する', () => {
  const base = { ...config, isProd: true, publicBaseUrl: 'https://example.invalid', pseudoSecret: 'a'.repeat(32), encryptionKey: Buffer.alloc(32), ai: { ...config.ai, provider: 'bedrock', domesticProcessingConfirmed: true } };
  assert.deepEqual(productionConfigProblems(base), []);
  assert.ok(productionConfigProblems({ ...base, ai: { ...base.ai, monthlyRequestLimit: -1 } }).some(v => v.includes('AI_MONTHLY_REQUEST_LIMIT')));
  assert.ok(productionConfigProblems({ ...base, ai: { ...base.ai, maxInputChars: 24001 } }).some(v => v.includes('AI_MAX_INPUT_CHARS')));
});
