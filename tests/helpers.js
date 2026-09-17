import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function bootstrap() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-test-'));
  process.env.DATA_DIR = dir;
  process.env.AI_PROVIDER = 'mock';
  process.env.PSEUDO_ID_SECRET = 'test-secret-test-secret-test-secret';
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const { openDb, q } = await import('../server/db.js');
  openDb(path.join(dir, 'test.db'));
  const { DEFAULT_SURVEYS } = await import('../server/lib/surveys.js');
  for (const s of DEFAULT_SURVEYS) q.run('INSERT INTO surveys(title, kind, questions) VALUES(?,?,?)', s.title, s.kind, JSON.stringify(s.questions));
  const { createApp } = await import('../server/app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { dir, server, base, q };
}

export function client(base) {
  let cookie = '';
  const call = async (method, url, body, { csrf = true, form } = {}) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-requested-with'] = 'mirai-next';
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data };
  };
  return {
    get: (u, o) => call('GET', u, undefined, o),
    post: (u, b, o) => call('POST', u, b, o),
    put: (u, b, o) => call('PUT', u, b, o),
    login: (loginId, password) => call('POST', '/api/auth/login', { loginId, password }),
  };
}

// 最小のJPEG（1x1）
export const TINY_JPEG = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
