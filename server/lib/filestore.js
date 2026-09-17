import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

const dir = () => path.join(config.dataDir, 'uploads');

// 画像はAES-256-GCMでアプリ層暗号化（DATA_ENCRYPTION_KEY設定時）。ディスク暗号化と併用する前提。
export function saveFile(buffer) {
  fs.mkdirSync(dir(), { recursive: true });
  const name = crypto.randomUUID() + '.bin';
  let out = buffer;
  let encrypted = 0;
  if (config.encryptionKey) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', config.encryptionKey, iv);
    const body = Buffer.concat([c.update(buffer), c.final()]);
    out = Buffer.concat([iv, c.getAuthTag(), body]);
    encrypted = 1;
  }
  fs.writeFileSync(path.join(dir(), name), out, { mode: 0o600 });
  return { fileName: name, encrypted };
}

export function readFile(fileName, encrypted) {
  const safe = path.basename(fileName);
  const raw = fs.readFileSync(path.join(dir(), safe));
  if (!encrypted) return raw;
  if (!config.encryptionKey) throw new Error('暗号化キーが未設定のため復号できません');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const d = crypto.createDecipheriv('aes-256-gcm', config.encryptionKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}

export function deleteFile(fileName) {
  try { fs.unlinkSync(path.join(dir(), path.basename(fileName))); } catch { /* noop */ }
}
