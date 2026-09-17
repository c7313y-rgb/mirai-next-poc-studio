import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sanitizeImage } from '../server/lib/upload.js';
test('server removes image metadata and rejects forged image headers', async () => {
  const source = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#abcdef' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await sanitizeImage(source);
  const info = await sharp(result.buffer).metadata();
  assert.equal(result.mime, 'image/jpeg');
  assert.ok(info.width <= 2000 && info.height <= 2000);
  assert.equal(info.exif, undefined);
  assert.equal(info.orientation, undefined);
  await assert.rejects(() => sanitizeImage(Buffer.from([0xff, 0xd8, 0xff, 0, 0])));
});
