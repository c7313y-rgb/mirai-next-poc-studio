import { q } from '../db.js';

// CM-03 利用ログ（KPI集計の基礎）
export function logEvent(user, type, targetType = null, targetId = null, meta = null) {
  q.run('INSERT INTO events(user_id, role, type, target_type, target_id, meta) VALUES(?,?,?,?,?,?)',
    user?.id ?? null, user?.role ?? null, type, targetType, targetId, meta ? JSON.stringify(meta) : null);
}

// AD-08 操作ログ（管理者・教員による個人データの閲覧／出力／変更）
export function audit(req, action, detail = {}) {
  q.run('INSERT INTO audit_logs(user_id, role, action, detail, ip) VALUES(?,?,?,?,?)',
    req.user?.id ?? null, req.user?.role ?? null, action, JSON.stringify(detail), req.ip || null);
}
