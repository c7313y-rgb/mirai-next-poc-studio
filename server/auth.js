import { q, nowIso } from './db.js';
import { config } from './config.js';
import { randomToken, sha256 } from './lib/pseudo.js';

const COOKIE = 'mn_sid';

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function createSession(res, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  q.run('INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES(?,?,?,?)', sha256(token), userId, nowIso(), expires.toISOString());
  q.run('UPDATE users SET last_login_at=? WHERE id=?', nowIso(), userId);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${config.isProd ? '; Secure' : ''}`);
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) q.run('DELETE FROM sessions WHERE id=?', sha256(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

const passwordChangePaths = new Set([
  '/api/auth/me', '/api/auth/password', '/api/auth/logout',
  '/api/auth/config', '/api/auth/login', '/api/auth/qr', '/api/auth/demo',
]);

export function loadUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = q.one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at > ? AND u.active=1`, sha256(token), nowIso());
    const demoIds = JSON.parse(q.one("SELECT value FROM settings WHERE key='demo_user_ids'")?.value || '[]');
    if (row && (config.demoMode || !demoIds.includes(row.id))) req.user = row;
  }
  // 画面遷移だけでなく、画像等を含むAPIへの直接アクセスも制限する。
  if (req.user?.must_change_password && req.path.startsWith('/api/') && !passwordChangePaths.has(req.path)) {
    return res.status(403).json({ error: '初期パスワードを変更してから利用してください', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'ログインが必要です' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'この操作の権限がありません' });
    next();
  };
}

// CSRF対策：状態を変更するAPIには独自ヘッダを必須にする（クロスサイトのフォーム送信では付与できない）
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'mirai-next') return res.status(403).json({ error: '不正なリクエストです' });
  next();
}

// 1プロセス内の制限。複数台構成では同じ方針を共有ストア/入口側にも適用する。
const attempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_RATE_LIMIT_KEYS = 10000;
export function loginRateLimited(key, limit = 10) {
  const now = Date.now();
  for (const [k, values] of attempts) {
    if (!values.length || now - values.at(-1) >= LOGIN_WINDOW_MS) attempts.delete(k);
  }
  if (!attempts.has(key) && attempts.size >= MAX_RATE_LIMIT_KEYS) return true;
  const a = (attempts.get(key) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (a.length >= limit) return true;
  a.push(now);
  attempts.set(key, a);
  return false;
}

// 教員の担当クラス判定（CM-02：所属外の情報は表示しない）
export function teacherClassIds(user) {
  return q.all('SELECT class_id FROM teacher_classes WHERE teacher_id=?', user.id).map((r) => r.class_id);
}
export function teacherCanSeeClass(user, classId) {
  return teacherClassIds(user).includes(Number(classId));
}
