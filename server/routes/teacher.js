import { Router } from 'express';
import { q, nowIso, parseJson } from '../db.js';
import { requireRole, teacherClassIds, teacherCanSeeClass } from '../auth.js';
import { audit, logEvent } from '../lib/log.js';
import { refreshInactiveAlerts } from '../lib/alerts.js';
import { themeDto } from '../lib/themes.js';
import { jstDate, mondayOf, addDays } from '../lib/time.js';
import { surveyDto, isOpen, validateAnswers } from '../lib/surveys.js';
import { RECORD_TYPES } from '../lib/taxonomy.js';

const r = Router();
r.use(requireRole('teacher'));

const guardClass = (req, res, classId) => {
  if (!teacherCanSeeClass(req.user, classId)) { res.status(403).json({ error: '担当クラスではありません' }); return false; }
  return true;
};

r.get('/classes', (req, res) => {
  const ids = teacherClassIds(req.user);
  const classes = ids.length ? q.all(`SELECT c.id, c.grade, c.name, s.name AS school_name, (SELECT COUNT(*) FROM users u WHERE u.class_id=c.id AND u.role='student' AND u.active=1) AS students FROM classes c JOIN schools s ON s.id=c.school_id WHERE c.id IN (${ids.map(() => '?').join(',')}) ORDER BY c.grade, c.name`, ...ids) : [];
  const pendingLessonSurveys = pendingLessons(req.user).length;
  res.json({ classes, pendingLessonSurveys });
});

// T-01 クラスダッシュボード
r.get('/classes/:id/dashboard', (req, res) => {
  const classId = Number(req.params.id);
  if (!guardClass(req, res, classId)) return;
  refreshInactiveAlerts(classId);
  const today = jstDate();
  const students = q.all(`SELECT u.id, u.attendance_no, u.pseudo_id,
      (SELECT COUNT(*) FROM records r WHERE r.user_id=u.id AND r.status='submitted') AS submissions,
      (SELECT MAX(submitted_at) FROM records r WHERE r.user_id=u.id AND r.status='submitted') AS last_submitted,
      (SELECT COUNT(*) FROM theme_interests ti WHERE ti.user_id=u.id) AS interests,
      (SELECT COUNT(*) FROM alerts a WHERE a.student_id=u.id AND a.status='open') AS open_alerts
    FROM users u WHERE u.class_id=? AND u.role='student' AND u.active=1 ORDER BY u.attendance_no`, classId);
  const ids = students.map((s) => s.id);
  const recs = ids.length ? q.all(`SELECT user_id, submitted_at, tags FROM records WHERE status='submitted' AND class_id=?`, classId) : [];

  const weeks = [];
  let w = mondayOf(today);
  for (let i = 0; i < 8; i++) {
    const wEnd = addDays(w, 6);
    const active = new Set(recs.filter((x) => { const d = jstDate(x.submitted_at); return d >= w && d <= wEnd; }).map((x) => x.user_id)).size;
    weeks.unshift({ week: w, active, rate: ids.length ? active / ids.length : 0 });
    w = addDays(w, -7);
  }

  const tagCount = {};
  const tagsByUser = {};
  for (const x of recs) for (const t of parseJson(x.tags, [])) {
    tagCount[t] = (tagCount[t] || 0) + 1;
    (tagsByUser[x.user_id] ||= {})[t] = ((tagsByUser[x.user_id] ||= {})[t] || 0) + 1;
  }
  const alerts = q.all(`SELECT a.*, u.attendance_no FROM alerts a JOIN users u ON u.id=a.student_id WHERE a.class_id=? AND a.status='open' ORDER BY CASE a.kind WHEN 'concern' THEN 0 ELSE 1 END, a.created_at DESC`, classId);
  const surveyStudent = q.all("SELECT * FROM surveys WHERE kind='student'").filter((s) => isOpen(s));
  const surveyResponded = surveyStudent.length && ids.length
    ? q.one(`SELECT COUNT(DISTINCT user_id) c FROM survey_responses WHERE survey_id IN (${surveyStudent.map((s) => s.id).join(',')}) AND user_id IN (${ids.join(',')})`).c : 0;
  const thisWeek = weeks.at(-1);

  audit(req, 'teacher_view_dashboard', { classId });
  res.json({
    class: q.one('SELECT c.id, c.grade, c.name, s.name AS school_name FROM classes c JOIN schools s ON s.id=c.school_id WHERE c.id=?', classId),
    cards: {
      students: ids.length,
      activeThisWeek: thisWeek.active,
      activeRateThisWeek: thisWeek.rate,
      submissionsTotal: recs.length,
      submissionsThisWeek: recs.filter((x) => jstDate(x.submitted_at) >= thisWeek.week).length,
      interests: students.reduce((a, s) => a + s.interests, 0),
      openAlerts: alerts.length,
      concernAlerts: alerts.filter((a) => a.kind === 'concern').length,
      studentSurveyRate: surveyStudent.length && ids.length ? surveyResponded / ids.length : null,
      pendingLessonSurveys: pendingLessons(req.user).filter((d) => d.class_id === classId).length,
    },
    weeks,
    tags: Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
    alerts: alerts.map((a) => ({ id: a.id, kind: a.kind, reason: a.reason, studentId: a.student_id, attendanceNo: a.attendance_no, recordId: a.record_id, createdAt: a.created_at })),
    students: students.map((s) => ({
      id: s.id, attendanceNo: s.attendance_no, pseudoId: s.pseudo_id, submissions: s.submissions, lastSubmitted: s.last_submitted,
      interests: s.interests, openAlerts: s.open_alerts,
      topTags: Object.entries(tagsByUser[s.id] || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t),
    })),
  });
});

// T-02 生徒記録詳細
r.get('/students/:id', (req, res) => {
  const s = q.one("SELECT u.id, u.class_id, u.attendance_no, u.pseudo_id FROM users u WHERE u.id=? AND u.role='student'", req.params.id);
  if (!s || !guardClass(req, res, s.class_id)) return s ? undefined : res.status(404).json({ error: '生徒が見つかりません' });
  const records = q.all("SELECT r.*, t.title AS theme_title FROM records r LEFT JOIN themes t ON t.id=r.theme_id WHERE r.user_id=? AND r.status='submitted' ORDER BY r.submitted_at DESC", s.id)
    .map((x) => ({
      id: x.id, type: x.type, typeLabel: RECORD_TYPES[x.type], themeTitle: x.theme_title, experienceDate: x.experience_date,
      finalText: x.final_text, ocrText: x.ocr_text, summary: x.summary, feedback: x.feedback, tags: parseJson(x.tags, []),
      aiStatus: x.ai_status, concern: x.concern_flag ? x.concern_reason : null, submittedAt: x.submitted_at,
      images: q.all('SELECT id FROM record_images WHERE record_id=?', x.id).map((i) => i.id),
      comments: q.all('SELECT c.id, c.body, c.created_at, u.display_name FROM comments c JOIN users u ON u.id=c.teacher_id WHERE c.record_id=? ORDER BY c.id', x.id),
    }));
  const alerts = q.all('SELECT id, kind, reason, status, note, created_at, handled_at FROM alerts WHERE student_id=? ORDER BY id DESC LIMIT 20', s.id);
  audit(req, 'teacher_view_student', { studentId: s.id });
  res.json({ student: { id: s.id, attendanceNo: s.attendance_no, pseudoId: s.pseudo_id, classId: s.class_id }, records, alerts });
});

// TE-04 教員コメント
r.post('/records/:id/comments', (req, res) => {
  const rec = q.one('SELECT * FROM records WHERE id=?', req.params.id);
  if (!rec || !guardClass(req, res, rec.class_id)) return rec ? undefined : res.status(404).json({ error: '記録が見つかりません' });
  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 1000) return res.status(400).json({ error: 'コメントは1〜1000文字で入力してください' });
  q.run('INSERT INTO comments(record_id, teacher_id, body) VALUES(?,?,?)', rec.id, req.user.id, body);
  logEvent(req.user, 'teacher_comment', 'record', rec.id);
  res.json({ ok: true });
});

// TE-03 アラート対応済み
r.post('/alerts/:id/handle', (req, res) => {
  const a = q.one('SELECT * FROM alerts WHERE id=?', req.params.id);
  if (!a || !guardClass(req, res, a.class_id)) return a ? undefined : res.status(404).json({ error: 'アラートが見つかりません' });
  q.run("UPDATE alerts SET status='handled', handled_by=?, handled_at=?, note=? WHERE id=?", req.user.id, nowIso(), String(req.body?.note || '').slice(0, 500), a.id);
  audit(req, 'alert_handled', { alertId: a.id, kind: a.kind });
  res.json({ ok: true });
});

// T-03 テーマ配信
r.get('/themes', (req, res) => {
  const themes = q.all("SELECT t.*, co.name AS company_name, co.industry AS company_industry FROM themes t JOIN companies co ON co.id=t.company_id WHERE t.status='published' ORDER BY t.published_at DESC").map(themeDto);
  const ids = teacherClassIds(req.user);
  const distributions = ids.length ? q.all(`SELECT d.*, t.title, c.grade, c.name AS class_name FROM distributions d JOIN themes t ON t.id=d.theme_id JOIN classes c ON c.id=d.class_id WHERE d.class_id IN (${ids.join(',')}) ORDER BY d.start_date DESC`) : [];
  res.json({ themes, distributions: distributions.map((d) => ({ id: d.id, themeId: d.theme_id, title: d.title, classId: d.class_id, className: `${d.grade}年${d.class_name}組`, startDate: d.start_date, endDate: d.end_date, mine: d.teacher_id === req.user.id })) });
});

r.post('/distributions', (req, res) => {
  const { themeId, classIds, startDate, endDate } = req.body || {};
  const t = q.one("SELECT id FROM themes WHERE id=? AND status='published'", themeId);
  if (!t) return res.status(400).json({ error: 'テーマを選んでください' });
  if (!Array.isArray(classIds) || !classIds.length) return res.status(400).json({ error: '配信するクラスを選んでください' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '') || startDate > endDate) return res.status(400).json({ error: '公開期間を正しく指定してください' });
  for (const c of classIds) if (!teacherCanSeeClass(req.user, c)) return res.status(403).json({ error: '担当外のクラスが含まれています' });
  for (const c of classIds) q.run('INSERT INTO distributions(theme_id, class_id, teacher_id, start_date, end_date) VALUES(?,?,?,?,?)', t.id, c, req.user.id, startDate, endDate);
  logEvent(req.user, 'theme_distribute', 'theme', t.id, { classIds, startDate, endDate });
  res.status(201).json({ ok: true });
});

r.delete('/distributions/:id', (req, res) => {
  const d = q.one('SELECT * FROM distributions WHERE id=? AND teacher_id=?', req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: '配信が見つかりません' });
  if (q.one("SELECT 1 FROM records WHERE theme_id=? AND class_id=? AND status='submitted'", d.theme_id, d.class_id)) {
    q.run('UPDATE distributions SET end_date=? WHERE id=?', addDays(jstDate(), -1), d.id); // 記録があるものは期間終了で停止
  } else q.run('DELETE FROM distributions WHERE id=?', d.id);
  res.json({ ok: true });
});

// T-04 授業後アンケート（配信ごと）
function pendingLessons(user) {
  const s = q.all("SELECT * FROM surveys WHERE kind='lesson' ORDER BY id DESC").find((x) => isOpen(x));
  if (!s) return [];
  return q.all(`SELECT d.*, t.title, c.grade, c.name AS class_name FROM distributions d JOIN themes t ON t.id=d.theme_id JOIN classes c ON c.id=d.class_id
    WHERE d.teacher_id=? AND d.start_date <= ? AND NOT EXISTS (SELECT 1 FROM survey_responses sr WHERE sr.survey_id=? AND sr.distribution_id=d.id)
    ORDER BY d.start_date DESC`, user.id, jstDate(), s.id).map((d) => ({ ...d, survey_id: s.id }));
}

r.get('/lesson-surveys', (req, res) => {
  const s = q.all("SELECT * FROM surveys WHERE kind='lesson' ORDER BY id DESC").find((x) => isOpen(x));
  res.json({
    survey: s ? surveyDto(s) : null,
    pending: pendingLessons(req.user).map((d) => ({ distributionId: d.id, title: d.title, className: `${d.grade}年${d.class_name}組`, startDate: d.start_date })),
  });
});

r.post('/lesson-surveys', (req, res) => {
  const { distributionId, answers } = req.body || {};
  const d = pendingLessons(req.user).find((x) => x.id === Number(distributionId));
  if (!d) return res.status(404).json({ error: '回答対象の授業が見つかりません（回答済みの可能性があります）' });
  const s = q.one('SELECT * FROM surveys WHERE id=?', d.survey_id);
  const v = validateAnswers(surveyDto(s), answers);
  if (v.error) return res.status(400).json({ error: v.error });
  q.run('INSERT INTO survey_responses(survey_id, user_id, distribution_id, answers) VALUES(?,?,?,?)', s.id, req.user.id, d.id, JSON.stringify(v.answers));
  logEvent(req.user, 'survey_response', 'survey', s.id, { distributionId: d.id });
  res.json({ ok: true });
});

export default r;
