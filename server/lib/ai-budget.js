import { config } from '../config.js';
import { getDb } from '../db.js';
import { jstDate } from './time.js';

const error = (code, message) => Object.assign(new Error(message), { code });

export function aiBudgetMonth(now = new Date()) {
  const month = jstDate(now).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw error('AI_BUDGET_CONFIG', 'AI利用月を確認できません');
  return month;
}

// One SQLite statement reserves the slot before any asynchronous network work.
// Counts attempts, including failures/retries; this is not a currency spending cap.
export function reserveAiRequest({ limit = config.ai.monthlyRequestLimit, now = new Date(), db = getDb() } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw error('AI_BUDGET_CONFIG', 'AI_MONTHLY_REQUEST_LIMITは0以上の整数で設定してください');
  }
  const month = aiBudgetMonth(now);
  const key = `ai_request_count:${month}`;
  const row = db.prepare(`
    INSERT INTO settings(key,value) SELECT ?, '1' WHERE ? > 0
    ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(settings.value AS INTEGER)+1 AS TEXT)
    WHERE settings.value GLOB '[0-9]*'
      AND settings.value NOT GLOB '*[^0-9]*'
      AND CAST(settings.value AS INTEGER) < ?
    RETURNING value
  `).get(key, limit, limit);
  if (!row) {
    const old = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (old && !/^\d+$/.test(old.value)) throw error('AI_BUDGET_CONFIG', 'AI利用件数を確認できないため送信を停止しました');
    throw error('AI_MONTHLY_LIMIT', `AIの月間呼出上限（${month}・${limit}回）に達したため送信しません。運営に連絡してください`);
  }
  return { month, count: Number(row.value), limit, remaining: Math.max(0, limit - Number(row.value)) };
}

export function validateAiRequest({ prompt, images = [] }, { maxInputChars = config.ai.maxInputChars, maxImages = config.upload.maxFiles, maxImageBytes = config.upload.maxBytes } = {}) {
  if (!Number.isSafeInteger(maxInputChars) || maxInputChars < 1 || maxInputChars > 24000) {
    throw error('AI_BUDGET_CONFIG', 'AI_MAX_INPUT_CHARSは1〜24000で設定してください');
  }
  if (typeof prompt !== 'string' || !prompt.trim()) throw error('AI_INPUT_LIMIT', 'AIに送信する文章がありません');
  // Count Unicode code points without materializing a second copy of a large input.
  let chars = 0;
  for (const _char of prompt) {
    if (++chars > maxInputChars) throw error('AI_INPUT_LIMIT', `AIへの入力は1回${maxInputChars}文字以内にしてください`);
  }
  if (!Array.isArray(images) || images.length > Math.min(3, maxImages)) {
    throw error('AI_INPUT_LIMIT', 'AIに送信する画像は1回3枚までです');
  }
  for (const image of images) {
    if (!Buffer.isBuffer(image?.buffer) || !image.buffer.length || image.buffer.length > maxImageBytes || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.mime)) {
      throw error('AI_INPUT_LIMIT', 'AIに送信する画像の形式・サイズを確認してください');
    }
  }
}

export async function sendWithAiBudget(send, request, options = {}) {
  validateAiRequest(request, options);
  reserveAiRequest(options);
  // Do not refund failures: the remote service may have processed the request.
  return send(request);
}
