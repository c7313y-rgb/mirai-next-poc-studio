import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createBackup, verifyBackup } from '../server/lib/backup.js';
test('encrypted backup restores DB and image, rejects wrong key and tampering, leaves original untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-backup-test-'));
  try {
    const dataDir = path.join(root, 'data'); fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
    const db = new DatabaseSync(path.join(dataDir, 'mirai-next.db'));
    db.exec('CREATE TABLE record_images(file_name TEXT, encrypted INTEGER); INSERT INTO record_images VALUES (\'sample.bin\',0)'); db.close();
    fs.writeFileSync(path.join(dataDir, 'uploads/sample.bin'), 'test image');
    const encryptionKey = crypto.randomBytes(32).toString('base64');
    const backup = await createBackup({ dataDir, backupDir: path.join(root, 'backups'), encryptionKey });
    assert.equal((await verifyBackup({ backupPath: backup.path, encryptionKey })).imageCount, 1);
    assert.equal(fs.readFileSync(path.join(dataDir, 'uploads/sample.bin'), 'utf8'), 'test image');
    await assert.rejects(() => verifyBackup({ backupPath: backup.path, encryptionKey: crypto.randomBytes(32).toString('base64') }));
    const bytes = fs.readFileSync(backup.path); bytes[bytes.length - 1] ^= 1; fs.writeFileSync(backup.path, bytes);
    await assert.rejects(() => verifyBackup({ backupPath: backup.path, encryptionKey }));
    fs.unlinkSync(path.join(dataDir, 'uploads/sample.bin'));
    await assert.rejects(() => createBackup({ dataDir, backupDir: path.join(root, 'missing'), encryptionKey }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('encrypted image restoration requires the correct image key independently of the backup key', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-image-key-test-'));
  try {
    const dataDir = path.join(root, 'data'); fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
    const db = new DatabaseSync(path.join(dataDir, 'mirai-next.db'));
    db.exec("CREATE TABLE record_images(file_name TEXT, encrypted INTEGER); INSERT INTO record_images VALUES ('encrypted.bin',1)"); db.close();
    const imageKey = crypto.randomBytes(32), iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', imageKey, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from('private image contents')), cipher.final()]);
    const image = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    fs.writeFileSync(path.join(dataDir, 'uploads/encrypted.bin'), image);
    const encryptionKey = crypto.randomBytes(32).toString('base64');
    const backup = await createBackup({ dataDir, backupDir: path.join(root, 'backups'), encryptionKey });
    const input = { backupPath: backup.path, encryptionKey };
    const result = await verifyBackup({ ...input, dataEncryptionKey: imageKey.toString('base64') });
    assert.equal(result.ok, true); assert.equal(result.imageCount, 1);
    await assert.rejects(() => verifyBackup({ ...input, dataEncryptionKey: crypto.randomBytes(32).toString('base64') }));
    await assert.rejects(() => verifyBackup(input), /Encryption key must be 32 bytes/);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'uploads/encrypted.bin')), image);
    assert.deepEqual(fs.readdirSync(path.join(root, 'backups')), [path.basename(backup.path)]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
