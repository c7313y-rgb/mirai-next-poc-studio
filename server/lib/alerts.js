import { q, nowIso } from '../db.js';
import { getSettings } from '../settings.js';
import { jstDate, addDays, maxDate } from './time.js';

// TE-03 一定期間の未提出者を抽出してアラート化（ダッシュボード表示時に更新）
export function refreshInactiveAlerts(classId, today = jstDate()) {
  const st = getSettings();
  const klass = q.one('SELECT c.*, s.start_date FROM classes c JOIN schools s ON s.id=c.school_id WHERE c.id=?', classId);
  if (!klass) return;
  const startDate = klass.start_date || st.poc_start;
  if (today < addDays(startDate, st.inactive_days)) return;
  const students = q.all(`SELECT u.id, (SELECT MAX(submitted_at) FROM records r WHERE r.user_id=u.id AND r.status='submitted') AS last
                          FROM users u WHERE u.role='student' AND u.active=1 AND u.class_id=?`, classId);
  for (const s of students) {
    const lastDate = s.last ? jstDate(s.last) : null;
    const base = maxDate(lastDate, startDate);
    if (today < addDays(base, st.inactive_days)) continue;
    const open = q.one("SELECT 1 FROM alerts WHERE student_id=? AND kind='inactive' AND status='open'", s.id);
    const recentlyHandled = q.one("SELECT 1 FROM alerts WHERE student_id=? AND kind='inactive' AND status='handled' AND handled_at >= ?", s.id, new Date(Date.now() - st.inactive_days * 86400_000).toISOString());
    if (!open && !recentlyHandled) {
      q.run("INSERT INTO alerts(school_id, class_id, student_id, kind, reason, created_at) VALUES(?,?,?, 'inactive', ?, ?)",
        klass.school_id, classId, s.id, lastDate ? `${lastDate}以降、${st.inactive_days}日以上提出がありません` : `開始から${st.inactive_days}日以上提出がありません`, nowIso());
    }
  }
}
