import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
const MAGIC = Buffer.from('MIRAI-BACKUP-1\n');
const HEADER_LENGTH = MAGIC.length + 12 + 16;
const keyBuffer = (key) => {
  const b = Buffer.from(key || '', 'base64');
  if (b.length !== 32) throw new Error('Encryption key must be 32 bytes in base64');
  return b;
};
function readHeader(file, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(length);
    if (fs.readSync(fd, header, 0, length, 0) !== length) throw new Error('Truncated encrypted file');
    return header;
  } finally { fs.closeSync(fd); }
}

export async function createBackup({ dataDir, backupDir, encryptionKey, now = new Date(), keepDays = 14 }) {
  if (!Number.isInteger(keepDays) || keepDays < 1 || keepDays > 3650) throw new Error('BACKUP_KEEP_DAYS must be 1–3650');
  const key = keyBuffer(encryptionKey);
  const dbPath = path.join(dataDir, 'mirai-next.db');
  if (!fs.existsSync(dbPath)) throw new Error('Database does not exist');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-backup-'));
  fs.chmodSync(work, 0o700);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const output = path.join(backupDir, `${now.toISOString().replace(/[:.]/g, '-')}.mirai-backup.enc`);
  const partial = `${output}.partial`;
  let db, partialCreated = false;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    db.exec(`VACUUM INTO '${path.join(work, 'mirai-next.db').replace(/'/g, "''")}'`);
    db.close(); db = null;
    const snapshot = new DatabaseSync(path.join(work, 'mirai-next.db'), { readOnly: true });
    const files = snapshot.prepare('SELECT DISTINCT file_name FROM record_images').all(); snapshot.close();
    fs.mkdirSync(path.join(work, 'uploads'), { mode: 0o700 });
    for (const row of files) {
      if (path.basename(row.file_name) !== row.file_name) throw new Error('Unsafe image path');
      fs.copyFileSync(path.join(dataDir, 'uploads', row.file_name), path.join(work, 'uploads', row.file_name));
    }
    fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify({ schema: 'mirai-backup/1', createdAt: now.toISOString(), imageCount: files.length }), { mode: 0o600 });
    const archive = path.join(work, 'snapshot.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', work, 'mirai-next.db', 'uploads', 'manifest.json']);
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    // Keep the v1 header format; fill the authentication tag after streaming completes.
    fs.writeFileSync(partial, Buffer.concat([MAGIC, iv, Buffer.alloc(16)]), { mode: 0o600, flag: 'wx' });
    partialCreated = true;
    await pipeline(fs.createReadStream(archive), cipher, fs.createWriteStream(partial, { flags: 'r+', start: HEADER_LENGTH }));
    const fd = fs.openSync(partial, 'r+');
    try {
      fs.writeSync(fd, cipher.getAuthTag(), 0, 16, MAGIC.length + 12);
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(partial, output);
    partialCreated = false;
    const cutoff = now.getTime() - keepDays * 86_400_000;
    for (const name of fs.readdirSync(backupDir)) {
      if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z\.mirai-backup\.enc$/.test(name)) continue;
      const file = path.join(backupDir, name);
      if (file !== output && fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
    }
    return { path: output, imageCount: files.length, encrypted: true };
  } finally {
    db?.close();
    if (partialCreated) fs.rmSync(partial, { force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Validate in a private temporary directory; live data is never overwritten.
export async function verifyBackup({ backupPath, encryptionKey, dataEncryptionKey }) {
  const header = readHeader(backupPath, HEADER_LENGTH), key = keyBuffer(encryptionKey);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unknown backup format');
  const offset = MAGIC.length, decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(offset, offset + 12));
  decipher.setAuthTag(header.subarray(offset + 12, offset + 28));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-restore-check-')); fs.chmodSync(work, 0o700);
  let db;
  try {
    const archive = path.join(work, 'snapshot.tar.gz');
    await pipeline(fs.createReadStream(backupPath, { start: HEADER_LENGTH }), decipher, fs.createWriteStream(archive, { flags: 'wx', mode: 0o600 }));
    // Authenticate the whole archive before inspecting or extracting any contents.
    const listing = path.join(work, 'entries.txt'), listingFd = fs.openSync(listing, 'wx', 0o600);
    try { execFileSync('tar', ['-tzf', archive], { stdio: ['ignore', listingFd, 'pipe'] }); }
    finally { fs.closeSync(listingFd); }
    const input = fs.createReadStream(listing), entries = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const name of entries) {
        if (!/^(mirai-next\.db|manifest\.json|uploads\/?|uploads\/[a-zA-Z0-9_.-]+)$/.test(name) || name.includes('..')) throw new Error('Unsafe archive path');
      }
    } finally { entries.close(); input.destroy(); }
    execFileSync('tar', ['-xzf', archive, '-C', work]);
    db = new DatabaseSync(path.join(work, 'mirai-next.db'), { readOnly: true });
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Database integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database foreign key check failed');
    const images = db.prepare('SELECT DISTINCT file_name, encrypted FROM record_images').all();
    const manifest = JSON.parse(fs.readFileSync(path.join(work, 'manifest.json'), 'utf8'));
    if (manifest.imageCount !== images.length) throw new Error('Image count mismatch');
    for (const row of images) {
      if (path.basename(row.file_name) !== row.file_name) throw new Error('Unsafe image path');
      const imagePath = path.join(work, 'uploads', row.file_name);
      if (!fs.statSync(imagePath).isFile()) throw new Error('Missing image file');
      if (row.encrypted) {
        const imageHeader = readHeader(imagePath, 28);
        const d = crypto.createDecipheriv('aes-256-gcm', keyBuffer(dataEncryptionKey), imageHeader.subarray(0, 12));
        d.setAuthTag(imageHeader.subarray(12, 28));
        await pipeline(fs.createReadStream(imagePath, { start: 28 }), d, async (source) => { for await (const _chunk of source) { /* authentication only */ } });
      }
    }
    return { ok: true, imageCount: images.length, createdAt: manifest.createdAt, liveDataUnchanged: true };
  } finally { db?.close(); fs.rmSync(work, { recursive: true, force: true }); }
}
