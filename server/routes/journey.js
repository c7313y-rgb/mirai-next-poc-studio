import { Router } from 'express';
import { q, nowIso } from '../db.js';
import { requireRole, teacherClassIds, teacherCanSeeClass } from '../auth.js';
import { ensureJourneySchema, JOURNEY_STAGES, studentJourney, entryDto, writingMetrics } from '../journey.js';
import { logEvent, audit } from '../lib/log.js';
import { keywordConcern } from '../lib/safety.js';
import { jstDate } from '../lib/time.js';
const r = Router();
r.use(requireRole('student', 'teacher'));
r.use((_req, _res, next) => { ensureJourneySchema(); next(); });
const error = (res, message, status = 400) => res.status(status).json({ error: message });
const dateOk = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const textOk = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
function validateEntry(body, userId) {
  const stage = JOURNEY_STAGES.find(s => s.id === body?.stage);
  if (!stage || !dateOk(body.entryDate) || typeof body.voluntary !== 'boolean') return { error: '段階・記録日・自己申告の形式を確認してください' };
  const values = body.fields;
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(k => !stage.fields.some(f => f.key === k)) || stage.fields.some(f => !textOk(values[f.key], 1, 1500))) return { error: '各問いに自分の言葉で記入してください（各1500文字まで）' };
  if (!Array.isArray(body.recordIds) || body.recordIds.length > 10 || new Set(body.recordIds).size !== body.recordIds.length || body.recordIds.some(id => !Number.isInteger(id) || !q.one("SELECT id FROM records WHERE id=? AND user_id=? AND status='submitted'", id, userId))) return { error: '根拠には自分が提出した記録を10件まで選択してください' };
  const url = body.referenceUrl || '', checked = body.referenceCheckedAt || '';
  if (url) {
    try { const parsed = new URL(url); if (!textOk(url, 1, 1000) || parsed.protocol !== 'https:' || parsed.username || parsed.password || !dateOk(checked) || checked > jstDate()) throw new Error(); }
    catch { return { error: '参考リンクはhttps URLと確認済みの日付（今日以前）を入力してください' }; }
  } else if (checked) return { error: '確認日は参考リンクと一緒に入力してください' };
  return { stage, values: Object.fromEntries(stage.fields.map(f => [f.key, values[f.key].trim()])), url, checked };
}
function flagConcern(user, entryId, values) {
  const result = keywordConcern(Object.values(values).join('\n'));
  if (!result.flag) return;
  const reason = `探究4STEP（記録${entryId}）：${result.reason}`;
  if (!q.one("SELECT id FROM alerts WHERE student_id=? AND kind='concern' AND reason=? AND status='open'", user.id, reason)) q.run("INSERT INTO alerts(school_id,class_id,student_id,kind,reason) VALUES(?,?,?,'concern',?)", user.school_id, user.class_id, user.id, reason);
}
function studentForTeacher(req, id) {
  const student = q.one("SELECT * FROM users WHERE id=? AND role='student' AND active=1", Number(id));
  return student && teacherCanSeeClass(req.user, student.class_id) ? student : null;
}
function teacherMetrics(user, period = {}) {
  const classes = teacherClassIds(user);
  const allEntries = classes.length ? q.all(`SELECT e.* FROM journey_entries e JOIN users u ON u.id=e.user_id WHERE u.class_id IN (${classes.map(() => '?').join(',')}) AND u.role='student'`, ...classes) : [];
  const selected = allEntries.filter(e => (!period.from || e.entry_date >= period.from) && (!period.to || e.entry_date <= period.to));
  const entries = selected.map(entryDto);
  const beforeStudents = new Set(selected.filter(e => e.voluntary && e.stage <= 2).map(e => e.user_id));
  const afterStudents = new Set(selected.filter(e => e.voluntary && e.stage >= 3).map(e => e.user_id));
  const surveys = q.all("SELECT s.continuation,s.workload,s.updated_at FROM journey_teacher_surveys s JOIN users u ON u.id=s.teacher_id WHERE u.school_id=? AND u.role='teacher' AND u.active=1", user.school_id);
  const eligible = q.one("SELECT COUNT(*) n FROM users WHERE school_id=? AND role='teacher' AND active=1", user.school_id).n;
  const responses = surveys.filter(s => (!period.from || jstDate(s.updated_at) >= period.from) && (!period.to || jstDate(s.updated_at) <= period.to));
  const yes = responses.filter(s => s.continuation === 'yes').length;
  return { period: { from: period.from || null, to: period.to || null }, workload: { respondents: responses.length, lighter: responses.filter(s => s.workload === 'lighter').length, same: responses.filter(s => s.workload === 'same').length, heavier: responses.filter(s => s.workload === 'heavier').length }, writing: { ...writingMetrics(entries), studentCount: new Set(selected.filter(e => e.voluntary).map(e => e.user_id)).size, beforeStudents: beforeStudents.size, afterStudents: afterStudents.size, pairedStudents: [...beforeStudents].filter(id => afterStudents.has(id)).length }, continuation: { target: 0.8, respondents: responses.length, eligible, yes, rate: responses.length ? yes / responses.length : null, responseRate: eligible ? responses.length / eligible : null, note: '同じ学校の回答した教員に占める継続希望の割合です。回答率と合わせて確認し、未回答者を希望者として扱いません。K-C4企業継続率とは別の指標です。' } };
}
r.get('/', (req, res) => {
  if (req.user.role === 'student') return res.json({ role: 'student', stages: JOURNEY_STAGES, ...studentJourney(req.user.id) });
  const classes = teacherClassIds(req.user);
  const students = classes.length ? q.all(`SELECT u.id,u.pseudo_id,u.attendance_no,c.grade,c.name class_name,(SELECT COUNT(*) FROM journey_entries e WHERE e.user_id=u.id) entry_count,(SELECT MAX(entry_date) FROM journey_entries e WHERE e.user_id=u.id) latest_date FROM users u JOIN classes c ON c.id=u.class_id WHERE u.role='student' AND u.active=1 AND u.class_id IN (${classes.map(() => '?').join(',')}) ORDER BY c.grade,c.name,u.attendance_no`, ...classes) : [];
  res.json({ role: 'teacher', stages: JOURNEY_STAGES, teacherId: req.user.id, students, metrics: teacherMetrics(req.user), survey: q.one('SELECT continuation,workload,note,updated_at FROM journey_teacher_surveys WHERE teacher_id=?', req.user.id) || null });
});
r.post('/entries', requireRole('student'), (req, res) => {
  const v = validateEntry(req.body, req.user.id); if (v.error) return error(res, v.error);
  const at = nowIso();
  const id = Number(q.run('INSERT INTO journey_entries(user_id,stage,entry_date,fields,record_ids,reference_url,reference_checked_at,voluntary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', req.user.id, req.body.stage, req.body.entryDate, JSON.stringify(v.values), JSON.stringify(req.body.recordIds), v.url || null, v.checked || null, req.body.voluntary ? 1 : 0, at, at).lastInsertRowid);
  flagConcern(req.user, id, v.values); logEvent(req.user, 'journey_entry', 'journey', id, { stage: req.body.stage });
  res.status(201).json({ entry: entryDto(q.one('SELECT * FROM journey_entries WHERE id=?', id)) });
});
r.put('/entries/:id', requireRole('student'), (req, res) => {
  const existing = q.one('SELECT * FROM journey_entries WHERE id=? AND user_id=?', Number(req.params.id), req.user.id);
  if (!existing) return error(res, '自分の記録が見つかりません', 404);
  const v = validateEntry(req.body, req.user.id); if (v.error) return error(res, v.error);
  if (req.body.version !== existing.version) return error(res, '別の画面で更新されています。再読込してから編集してください', 409);
  q.run('UPDATE journey_entries SET stage=?,entry_date=?,fields=?,record_ids=?,reference_url=?,reference_checked_at=?,voluntary=?,version=version+1,updated_at=? WHERE id=?', req.body.stage, req.body.entryDate, JSON.stringify(v.values), JSON.stringify(req.body.recordIds), v.url || null, v.checked || null, req.body.voluntary ? 1 : 0, nowIso(), existing.id);
  flagConcern(req.user, existing.id, v.values); logEvent(req.user, 'journey_update', 'journey', existing.id);
  res.json({ entry: entryDto(q.one('SELECT * FROM journey_entries WHERE id=?', existing.id)) });
});
r.get('/students/:id', requireRole('teacher'), (req, res) => {
  const student = studentForTeacher(req, req.params.id); if (!student) return error(res, '担当クラスの生徒のみ確認できます', 403);
  audit(req, 'journey_student_view', { studentId: student.id });
  res.json({ student: { id: student.id, pseudoId: student.pseudo_id, attendanceNo: student.attendance_no }, ...studentJourney(student.id) });
});
function noteInput(b) { return b && textOk(b.body, 1, 2000) && ['planned', 'done', 'followup'].includes(b.status) && (!b.plannedDate || dateOk(b.plannedDate)); }
r.post('/students/:id/notes', requireRole('teacher'), (req, res) => {
  const student = studentForTeacher(req, req.params.id); if (!student) return error(res, '担当クラスの生徒のみ記録できます', 403);
  if (!noteInput(req.body)) return error(res, '共有メモ・声かけ日・対応状態を確認してください');
  const at = nowIso();
  const id = Number(q.run('INSERT INTO journey_notes(student_id,teacher_id,body,planned_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', student.id, req.user.id, req.body.body.trim(), req.body.plannedDate || null, req.body.status, at, at).lastInsertRowid);
  audit(req, 'journey_shared_note', { studentId: student.id, noteId: id }); res.status(201).json({ ok: true, id });
});
r.put('/notes/:id', requireRole('teacher'), (req, res) => {
  const note = q.one('SELECT * FROM journey_notes WHERE id=? AND teacher_id=?', Number(req.params.id), req.user.id);
  if (!note || !studentForTeacher(req, note.student_id)) return error(res, '自分が担当生徒に記録した共有メモのみ更新できます', 403);
  if (!noteInput(req.body)) return error(res, '共有メモ・声かけ日・対応状態を確認してください');
  q.run('UPDATE journey_notes SET body=?,planned_date=?,status=?,updated_at=? WHERE id=?', req.body.body.trim(), req.body.plannedDate || null, req.body.status, nowIso(), note.id);
  audit(req, 'journey_shared_note_update', { studentId: note.student_id, noteId: note.id }); res.json({ ok: true });
});
r.put('/teacher-survey', requireRole('teacher'), (req, res) => {
  const b = req.body || {};
  if (!['yes', 'unsure', 'no'].includes(b.continuation) || !['lighter', 'same', 'heavier'].includes(b.workload) || !textOk(b.note || '', 0, 1000)) return error(res, '継続希望・指導負荷の回答を選択してください');
  q.run('INSERT INTO journey_teacher_surveys(teacher_id,continuation,workload,note,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(teacher_id) DO UPDATE SET continuation=excluded.continuation,workload=excluded.workload,note=excluded.note,updated_at=excluded.updated_at', req.user.id, b.continuation, b.workload, b.note || '', nowIso());
  logEvent(req.user, 'journey_teacher_survey'); res.json({ ok: true, metrics: teacherMetrics(req.user) });
});
r.get('/metrics', requireRole('teacher'), (req, res) => {
  const { from, to } = req.query;
  if ((from && !dateOk(from)) || (to && !dateOk(to)) || (from && to && from > to)) return error(res, '測定期間を確認してください');
  audit(req, 'journey_metrics_view', { from: from || null, to: to || null });
  res.json(teacherMetrics(req.user, { from, to }));
});
export default r;
