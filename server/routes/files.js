import { Router } from 'express';
import { q } from '../db.js';
import { teacherCanSeeClass } from '../auth.js';
import { readFile } from '../lib/filestore.js';
import { audit } from '../lib/log.js';

const r = Router();

// 手帳画像：本人・担当教員・運営のみ。企業は不可。
r.get('/images/:id', (req, res) => {
  if (!req.user) return res.status(401).end();
  const img = q.one('SELECT i.*, r.user_id, r.class_id FROM record_images i JOIN records r ON r.id=i.record_id WHERE i.id=?', req.params.id);
  if (!img) return res.status(404).end();
  const u = req.user;
  const ok = (u.role === 'student' && u.id === img.user_id) || (u.role === 'teacher' && teacherCanSeeClass(u, img.class_id)) || u.role === 'admin';
  if (!ok) return res.status(403).end();
  if (u.role !== 'student') audit(req, 'image_view', { imageId: img.id, recordId: img.record_id });
  res.setHeader('Content-Type', img.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(readFile(img.file_name, img.encrypted));
});

export default r;
