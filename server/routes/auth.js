import { Router } from 'express';
import { q } from '../db.js';
import { createSession, destroySession, loginRateLimited, requireRole } from '../auth.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { sha256 } from '../lib/pseudo.js';
import { logEvent } from '../lib/log.js';
import { config } from '../config.js';

const r = Router();
const demoAccounts = { company: 'c-01', teacher: 't-a', student: 's-aa-01', admin: 'admin' };
const isDemoUser = (id) => JSON.parse(q.one("SELECT value FROM settings WHERE key='demo_user_ids'")?.value || '[]').includes(id);
r.get('/config', (_req, res) => res.json({ demoMode: config.demoMode, aiMode: config.ai.provider, accounts: config.demoMode ? demoAccounts : {} }));
r.post('/demo', (req, res) => {
  if (!config.demoMode) return res.status(403).json({ error: 'デモログインは無効です。発行されたIDでログインしてください' });
  const loginId = Object.hasOwn(demoAccounts, req.body?.role) ? demoAccounts[req.body.role] : null;
  if (!loginId) return res.status(400).json({ error: '利用する画面を選択してください' });
  const u = q.one('SELECT * FROM users WHERE login_id=? AND active=1', loginId);
  if (!u || !isDemoUser(u.id)) return res.status(409).json({ error: 'デモデータが準備されていません' });
  createSession(res, u.id);
  logEvent(u, 'login', null, null, { method: 'demo' });
  res.json({ user: publicUser(u) });
});

export function publicUser(u) {
  if (!u) return null;
  const school = u.school_id ? q.one('SELECT id, name, code FROM schools WHERE id=?', u.school_id) : null;
  const klass = u.class_id ? q.one('SELECT id, grade, name FROM classes WHERE id=?', u.class_id) : null;
  const company = u.company_id ? q.one('SELECT id, name FROM companies WHERE id=?', u.company_id) : null;
  return {
    id: u.id, role: u.role, loginId: u.login_id, displayName: u.display_name, pseudoId: u.role === 'student' ? u.pseudo_id : undefined,
    attendanceNo: u.attendance_no, school, class: klass, company, mustChangePassword: Boolean(u.must_change_password),
  };
}

r.post('/login', (req, res) => {
  const { loginId, password } = req.body || {};
  if (!loginId || !password) return res.status(400).json({ error: 'IDとパスワードを入力してください' });
  if (loginRateLimited(`${req.ip}|${loginId}`)) return res.status(429).json({ error: '試行回数が多すぎます。15分ほど待ってから再度お試しください' });
  const u = q.one('SELECT * FROM users WHERE login_id=? AND active=1', String(loginId).trim());
  if (u && !config.demoMode && isDemoUser(u.id)) return res.status(403).json({ error: 'デモアカウントは無効です' });
  if (!u || !verifyPassword(String(password), u.password_hash)) return res.status(401).json({ error: 'IDまたはパスワードが違います' });
  createSession(res, u.id);
  logEvent(u, 'login', null, null, { method: 'password' });
  res.json({ user: publicUser(u) });
});

r.post('/qr', (req, res) => {
  const token = String(req.body?.token || '');
  if (token.length < 20) return res.status(400).json({ error: 'QRコードが正しくありません' });
  if (loginRateLimited(`${req.ip}|qr`)) return res.status(429).json({ error: '試行回数が多すぎます。しばらく待ってください' });
  const u = q.one('SELECT * FROM users WHERE qr_token_hash=? AND active=1', sha256(token));
  if (!u) return res.status(401).json({ error: 'このQRコードは使えません。先生に再発行を依頼してください' });
  if (!config.demoMode && isDemoUser(u.id)) return res.status(403).json({ error: 'デモアカウントは無効です' });
  createSession(res, u.id);
  logEvent(u, 'login', null, null, { method: 'qr' });
  res.json({ user: publicUser(u) });
});

r.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

r.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

r.post('/password', requireRole('student', 'teacher', 'company', 'admin'), (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) return res.status(400).json({ error: '現在のパスワードが違います' });
  if (String(next || '').length < 8) return res.status(400).json({ error: '新しいパスワードは8文字以上にしてください' });
  q.run('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', hashPassword(String(next)), req.user.id);
  res.json({ ok: true });
});

export default r;
