import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { q, nowIso, parseJson } from '../db.js';
import { config } from '../config.js';
import { requireRole } from '../auth.js';
import { audit } from '../lib/log.js';
import { parseCsv, toCsv } from '../lib/csv.js';
import { importUsers, reissueCredentials, withQr } from '../lib/users.js';
import { themeDto } from '../lib/themes.js';
import { computeKpis } from '../kpi.js';
import { getSettings, saveSettings } from '../settings.js';
import { enqueue } from '../jobs.js';
import { ai } from '../ai/index.js';
import { scrubPii } from '../lib/safety.js';
import { surveyDto, validateQuestions, DEFAULT_SURVEYS } from '../lib/surveys.js';
import { INTEREST_TAGS } from '../lib/taxonomy.js';
import { jstDate } from '../lib/time.js';

const r = Router();
r.use(requireRole('admin'));
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// ---------- A-01 KPIダッシュボード ----------
r.get('/kpi', async (req, res) => {
  const { from, to, schoolId } = req.query;
  if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) return res.status(400).json({ error: '期間の形式が正しくありません' });
  const data = await computeKpis({ from, to, schoolId });
  data.schools = q.all('SELECT id, name, code, start_date FROM schools ORDER BY id');
  data.openConcernAlertsBySchool = q.all("SELECT s.name, COUNT(a.id) AS open FROM schools s LEFT JOIN alerts a ON a.school_id=s.id AND a.kind='concern' AND a.status='open' GROUP BY s.id ORDER BY s.id");
  data.aiProvider = ai().name;
  data.jobs = q.one("SELECT SUM(status='queued') queued, SUM(status='running') running, SUM(status='failed') failed FROM jobs");
  res.json(data);
});

r.get('/kpi.csv', async (req, res) => {
  const data = await computeKpis(req.query);
  audit(req, 'kpi_csv_export', req.query);
  const fmt = (k, v) => (v === null || v === undefined ? '' : k.format === 'pct' ? (v * 100).toFixed(1) + '%' : Number(v).toFixed(k.format === 'count' ? 0 : 2));
  const csv = toCsv([
    { label: '区分', key: 'group' }, { label: 'ID', key: 'id' }, { label: 'KPI', key: 'name' },
    { label: '実績', value: (k) => fmt(k, k.value) }, { label: '目標', value: (k) => fmt(k, k.target) },
    { label: '達成', value: (k) => (k.achieved === null ? '計測不可' : k.achieved ? '達成' : '未達') }, { label: '備考', key: 'note' },
  ], data.kpis);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kpi_${data.period.from}_${data.period.to}.csv"`);
  res.send(csv);
});

// ---------- 設定 ----------
r.get('/settings', (req, res) => res.json({ settings: getSettings(), tags: INTEREST_TAGS }));
r.put('/settings', (req, res) => {
  try {
    const s = saveSettings(req.body || {});
    audit(req, 'settings_update', req.body);
    res.json({ settings: s });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// ---------- A-02 利用者管理 ----------
r.get('/schools', (req, res) => {
  const schools = q.all(`SELECT s.*, (SELECT COUNT(*) FROM users u WHERE u.school_id=s.id AND u.role='student' AND u.active=1) AS students,
    (SELECT COUNT(*) FROM users u WHERE u.school_id=s.id AND u.role='teacher' AND u.active=1) AS teachers FROM schools s ORDER BY s.id`);
  const classes = q.all(`SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.class_id=c.id AND u.role='student' AND u.active=1) AS students FROM classes c ORDER BY c.school_id, c.grade, c.name`);
  const companies = q.all(`SELECT co.*, (SELECT COUNT(*) FROM users u WHERE u.company_id=co.id) AS users, (SELECT COUNT(*) FROM themes t WHERE t.company_id=co.id AND t.status='published') AS published FROM companies co ORDER BY co.id`);
  res.json({ schools, classes, companies });
});
r.put('/schools/:id', (req, res) => {
  const { name, startDate } = req.body || {};
  if (startDate && !dateRe.test(startDate)) return res.status(400).json({ error: '開始日の形式が正しくありません' });
  q.run('UPDATE schools SET name=COALESCE(?, name), start_date=? WHERE id=?', name || null, startDate || null, req.params.id);
  audit(req, 'school_update', { id: req.params.id, name, startDate });
  res.json({ ok: true });
});
r.get('/users', (req, res) => {
  const { role, schoolId, classId } = req.query;
  const where = ['1=1'];
  const p = [];
  if (role) { where.push('u.role=?'); p.push(role); }
  if (schoolId) { where.push('u.school_id=?'); p.push(schoolId); }
  if (classId) { where.push('u.class_id=?'); p.push(classId); }
  const users = q.all(`SELECT u.id, u.login_id, u.role, u.display_name, u.attendance_no, u.pseudo_id, u.active, u.last_login_at, s.name AS school_name, c.grade, c.name AS class_name, co.name AS company_name
    FROM users u LEFT JOIN schools s ON s.id=u.school_id LEFT JOIN classes c ON c.id=u.class_id LEFT JOIN companies co ON co.id=u.company_id
    WHERE ${where.join(' AND ')} ORDER BY u.role, s.id, c.grade, c.name, u.attendance_no, u.login_id LIMIT 2000`, ...p);
  res.json({ users });
});
r.post('/users/import', async (req, res) => {
  const csv = String(req.body?.csv || '');
  if (!csv.trim()) return res.status(400).json({ error: 'CSVが空です' });
  const rows = parseCsv(csv);
  if (rows.length > 2000) return res.status(400).json({ error: '一度に登録できるのは2000行までです' });
  const result = importUsers(rows);
  if (result.errors.length) return res.status(422).json({ error: 'CSVにエラーがあります。修正して再度取り込んでください（何も登録されていません）', errors: result.errors });
  audit(req, 'users_import', { created: result.created, updated: result.updated });
  res.json({ created: result.created, updated: result.updated, credentials: await withQr(result.credentials) });
});
r.post('/users/reissue', async (req, res) => {
  const { userIds, classId } = req.body || {};
  const ids = classId ? q.all("SELECT id FROM users WHERE class_id=? AND role='student' AND active=1 ORDER BY attendance_no", classId).map((x) => x.id) : (userIds || []).map(Number);
  if (!ids.length) return res.status(400).json({ error: '対象の利用者を選んでください' });
  const creds = reissueCredentials(ids);
  audit(req, 'credentials_reissue', { count: creds.length, classId: classId || null });
  res.json({ credentials: await withQr(creds) });
});
r.patch('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '自分自身は変更できません' });
  q.run('UPDATE users SET active=? WHERE id=?', req.body?.active ? 1 : 0, req.params.id);
  if (!req.body?.active) q.run('DELETE FROM sessions WHERE user_id=?', req.params.id);
  audit(req, 'user_active_change', { id: req.params.id, active: Boolean(req.body?.active) });
  res.json({ ok: true });
});

// ---------- A-03 テーマ・企業管理 ----------
r.post('/companies', (req, res) => {
  const { code, name, industry } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: '企業コードと企業名を入力してください' });
  try {
    const id = q.run('INSERT INTO companies(code, name, industry) VALUES(?,?,?)', code, name, industry || null).lastInsertRowid;
    audit(req, 'company_create', { id: Number(id), code });
    res.status(201).json({ id: Number(id) });
  } catch { res.status(409).json({ error: 'この企業コードは登録済みです' }); }
});
r.put('/companies/:id', (req, res) => {
  const { name, industry } = req.body || {};
  q.run('UPDATE companies SET name=COALESCE(?, name), industry=? WHERE id=?', name || null, industry || null, req.params.id);
  audit(req, 'company_update', { id: req.params.id });
  res.json({ ok: true });
});
r.get('/themes', (req, res) => {
  const themes = q.all(`SELECT t.*, co.name AS company_name, co.industry AS company_industry,
      (SELECT COUNT(*) FROM distributions d WHERE d.theme_id=t.id) AS distributions,
      (SELECT COUNT(*) FROM records r WHERE r.theme_id=t.id AND r.status='submitted') AS records,
      (SELECT status FROM voice_summaries v WHERE v.theme_id=t.id) AS voice_status
    FROM themes t JOIN companies co ON co.id=t.company_id ORDER BY t.id DESC`)
    .map((t) => ({ ...themeDto(t), distributions: t.distributions, records: t.records, voiceStatus: t.voice_status }));
  const materials = q.all('SELECT m.*, co.name AS company_name FROM material_submissions m JOIN companies co ON co.id=m.company_id ORDER BY m.id DESC LIMIT 100');
  res.json({ themes, materials });
});
function themeInput(body) {
  const { companyId, title, summary, questions, worksheet, materials, field } = body || {};
  if (!q.one('SELECT 1 FROM companies WHERE id=?', companyId)) return { error: '企業を選んでください' };
  if (!title || String(title).length > 100) return { error: 'テーマ名を100文字以内で入力してください' };
  const qs = (Array.isArray(questions) ? questions : []).map((x) => String(x).trim()).filter(Boolean);
  const mats = (Array.isArray(materials) ? materials : []).filter((m) => m && m.label);
  for (const m of mats) if (m.url && !/^https:\/\//.test(m.url)) return { error: '素材URLは https:// から始まるものにしてください' };
  return { value: [Number(companyId), String(title), String(summary || ''), JSON.stringify(qs), String(worksheet || ''), JSON.stringify(mats), field || null] };
}
r.post('/themes', (req, res) => {
  const v = themeInput(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const id = Number(q.run('INSERT INTO themes(company_id, title, summary, questions, worksheet, materials, field) VALUES(?,?,?,?,?,?,?)', ...v.value).lastInsertRowid);
  audit(req, 'theme_create', { id });
  res.status(201).json({ id });
});
r.put('/themes/:id', (req, res) => {
  const v = themeInput(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  q.run('UPDATE themes SET company_id=?, title=?, summary=?, questions=?, worksheet=?, materials=?, field=?, updated_at=? WHERE id=?', ...v.value, nowIso(), req.params.id);
  audit(req, 'theme_update', { id: req.params.id });
  res.json({ ok: true });
});
r.post('/themes/:id/status', (req, res) => {
  const status = req.body?.status;
  if (!['draft', 'published', 'archived'].includes(status)) return res.status(400).json({ error: '状態が正しくありません' });
  const t = q.one('SELECT * FROM themes WHERE id=?', req.params.id);
  if (!t) return res.status(404).json({ error: 'テーマが見つかりません' });
  if (status === 'published' && (!t.summary || parseJson(t.questions, []).length === 0)) return res.status(400).json({ error: '公開には概要と問い（1つ以上）が必要です' });
  q.run('UPDATE themes SET status=?, published_at=COALESCE(published_at, CASE WHEN ?=\'published\' THEN ? END), updated_at=? WHERE id=?', status, status, nowIso(), nowIso(), t.id);
  audit(req, 'theme_status', { id: t.id, status });
  res.json({ ok: true });
});
// AD-03 教材化支援
r.post('/themes/draft', async (req, res) => {
  const { companyId, material } = req.body || {};
  const co = q.one('SELECT * FROM companies WHERE id=?', companyId);
  if (!co || !String(material || '').trim()) return res.status(400).json({ error: '企業と資料テキストを入力してください' });
  try {
    const d = await ai().worksheet({ companyName: co.name, material: String(material).slice(0, 20000) });
    audit(req, 'theme_ai_draft', { companyId: co.id });
    res.json({ draft: { title: d.title || '', summary: d.summary || '', questions: Array.isArray(d.questions) ? d.questions : [], worksheet: d.worksheet || '' } });
  } catch (e) { res.status(502).json({ error: 'AIによる案の作成に失敗しました: ' + e.message }); }
});

// CO-01 企業向け匿名要約（運営が確認・承認してから企業に表示）
r.post('/themes/:id/voice-summary', async (req, res) => {
  const st = getSettings();
  const t = q.one('SELECT * FROM themes WHERE id=?', req.params.id);
  if (!t) return res.status(404).json({ error: 'テーマが見つかりません' });
  const recs = q.all("SELECT final_text FROM records WHERE theme_id=? AND status='submitted' AND concern_flag=0 ORDER BY submitted_at DESC LIMIT 150", t.id);
  if (recs.length < st.voice_min_records) return res.status(400).json({ error: `匿名性確保のため、記録が${st.voice_min_records}件以上たまってから作成してください（現在${recs.length}件）` });
  const schoolNames = q.all('SELECT name FROM schools').map((s) => s.name);
  try {
    const out = await ai().voiceSummary({ themeTitle: t.title, texts: recs.map((x) => scrubPii(x.final_text, schoolNames)) });
    const clean = { summary: scrubPii(out.summary, schoolNames), points: (out.points || []).map((p) => scrubPii(p, schoolNames)), suggestion: scrubPii(out.suggestion, schoolNames) };
    q.run(`INSERT INTO voice_summaries(theme_id, summary, source_count, status, generated_at) VALUES(?,?,?, 'pending_review', ?)
      ON CONFLICT(theme_id) DO UPDATE SET summary=excluded.summary, source_count=excluded.source_count, status='pending_review', generated_at=excluded.generated_at, approved_by=NULL, approved_at=NULL`,
      t.id, JSON.stringify(clean), recs.length, nowIso());
    audit(req, 'voice_summary_generate', { themeId: t.id, sources: recs.length });
    res.json({ summary: clean, sourceCount: recs.length, status: 'pending_review' });
  } catch (e) { res.status(502).json({ error: '要約の作成に失敗しました: ' + e.message }); }
});
r.get('/themes/:id/voice-summary', (req, res) => {
  const v = q.one('SELECT * FROM voice_summaries WHERE theme_id=?', req.params.id);
  res.json({ voice: v ? { ...parseJson(v.summary, {}), status: v.status, sourceCount: v.source_count, generatedAt: v.generated_at } : null });
});
r.put('/themes/:id/voice-summary', (req, res) => {
  const { summary, points, suggestion, approve } = req.body || {};
  const v = q.one('SELECT * FROM voice_summaries WHERE theme_id=?', req.params.id);
  if (!v) return res.status(404).json({ error: '要約がありません' });
  q.run('UPDATE voice_summaries SET summary=?, status=?, approved_by=?, approved_at=? WHERE theme_id=?',
    JSON.stringify({ summary: String(summary || ''), points: (points || []).map(String), suggestion: String(suggestion || '') }),
    approve ? 'approved' : 'pending_review', approve ? req.user.id : null, approve ? nowIso() : null, req.params.id);
  audit(req, approve ? 'voice_summary_approve' : 'voice_summary_edit', { themeId: req.params.id });
  res.json({ ok: true });
});

// ---------- A-04 アンケート管理 ----------
r.get('/surveys', (req, res) => {
  const surveys = q.all('SELECT * FROM surveys ORDER BY id').map((s) => {
    const dto = surveyDto(s);
    const responses = q.one('SELECT COUNT(*) c FROM survey_responses WHERE survey_id=?', s.id).c;
    let expected;
    if (s.kind === 'student') expected = q.one("SELECT COUNT(*) c FROM users WHERE role='student' AND active=1").c;
    if (s.kind === 'lesson') expected = q.one('SELECT COUNT(*) c FROM distributions WHERE start_date <= ?', jstDate()).c;
    if (s.kind === 'continuation') expected = q.one("SELECT COUNT(DISTINCT company_id) c FROM themes WHERE status='published'").c;
    return { ...dto, responses, expected };
  });
  res.json({ surveys, templates: DEFAULT_SURVEYS });
});
r.post('/surveys', (req, res) => {
  const { title, kind, questions, openFrom, openTo } = req.body || {};
  if (!title || !['student', 'lesson', 'continuation'].includes(kind)) return res.status(400).json({ error: 'タイトルと対象を指定してください' });
  const err = validateQuestions(kind, questions);
  if (err) return res.status(400).json({ error: err });
  const id = Number(q.run('INSERT INTO surveys(title, kind, questions, open_from, open_to) VALUES(?,?,?,?,?)', title, kind, JSON.stringify(questions), openFrom || null, openTo || null).lastInsertRowid);
  audit(req, 'survey_create', { id });
  res.status(201).json({ id });
});
r.put('/surveys/:id', (req, res) => {
  const s = q.one('SELECT * FROM surveys WHERE id=?', req.params.id);
  if (!s) return res.status(404).json({ error: 'アンケートが見つかりません' });
  const { title, questions, openFrom, openTo, active } = req.body || {};
  const hasResponses = q.one('SELECT 1 FROM survey_responses WHERE survey_id=?', s.id);
  if (questions && hasResponses && JSON.stringify(questions.map((x) => x.key)) !== JSON.stringify(parseJson(s.questions, []).map((x) => x.key))) {
    return res.status(409).json({ error: '回答があるアンケートの設問の追加・削除はできません（集計が崩れるため）。新しいアンケートを作成してください' });
  }
  if (questions) { const err = validateQuestions(s.kind, questions); if (err) return res.status(400).json({ error: err }); }
  q.run('UPDATE surveys SET title=COALESCE(?, title), questions=COALESCE(?, questions), open_from=?, open_to=?, active=? WHERE id=?',
    title || null, questions ? JSON.stringify(questions) : null, openFrom || null, openTo || null, active === false ? 0 : 1, s.id);
  audit(req, 'survey_update', { id: s.id });
  res.json({ ok: true });
});
r.get('/surveys/:id/results', (req, res) => {
  const s = q.one('SELECT * FROM surveys WHERE id=?', req.params.id);
  if (!s) return res.status(404).json({ error: 'アンケートが見つかりません' });
  const dto = surveyDto(s);
  const rows = q.all('SELECT sr.answers, u.school_id FROM survey_responses sr JOIN users u ON u.id=sr.user_id WHERE sr.survey_id=?', s.id).map((x) => ({ ...parseJson(x.answers, {}), __school: x.school_id }));
  const results = dto.questions.map((qn) => {
    const vals = rows.map((r0) => r0[qn.key]).filter((v) => v !== undefined && v !== '');
    if (qn.type === 'rating') {
      const dist = [1, 2, 3, 4, 5].map((n) => vals.filter((v) => Number(v) === n).length);
      return { key: qn.key, label: qn.label, type: qn.type, n: vals.length, avg: vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null, dist };
    }
    if (qn.type === 'choice') {
      const opts = (qn.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
      return { key: qn.key, label: qn.label, type: qn.type, n: vals.length, counts: opts.map((o) => ({ ...o, count: vals.filter((v) => v === o.value).length })) };
    }
    return { key: qn.key, label: qn.label, type: qn.type, n: vals.length, texts: vals.slice(0, 300) };
  });
  const analysis = q.one('SELECT result, generated_at FROM survey_analyses WHERE survey_id=?', s.id);
  audit(req, 'survey_results_view', { id: s.id });
  res.json({ survey: dto, responses: rows.length, results, analysis: analysis ? { ...parseJson(analysis.result, {}), generatedAt: analysis.generated_at } : null });
});
// AD-07 自由記述の分類・要約
r.post('/surveys/:id/analyze', async (req, res) => {
  const s = q.one('SELECT * FROM surveys WHERE id=?', req.params.id);
  if (!s) return res.status(404).json({ error: 'アンケートが見つかりません' });
  const textKeys = surveyDto(s).questions.filter((x) => x.type === 'text').map((x) => x.key);
  const texts = q.all('SELECT answers FROM survey_responses WHERE survey_id=?', s.id).flatMap((x) => textKeys.map((k) => parseJson(x.answers, {})[k])).filter((t) => t && String(t).trim());
  if (texts.length < 3) return res.status(400).json({ error: `自由記述が3件以上たまってから実行してください（現在${texts.length}件）` });
  try {
    const out = await ai().freeText({ title: s.title, texts: texts.slice(0, 300) });
    q.run('INSERT INTO survey_analyses(survey_id, result, generated_at) VALUES(?,?,?) ON CONFLICT(survey_id) DO UPDATE SET result=excluded.result, generated_at=excluded.generated_at', s.id, JSON.stringify(out), nowIso());
    audit(req, 'survey_analyze', { id: s.id, n: texts.length });
    res.json({ analysis: out });
  } catch (e) { res.status(502).json({ error: '分類・要約に失敗しました: ' + e.message }); }
});

// ---------- A-05 データ出力・ログ ----------
r.get('/exports', (req, res) => {
  res.json({ exports: q.all('SELECT e.*, u.login_id FROM exports e JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 50') });
});
r.post('/exports', (req, res) => {
  const { from, to, format } = req.body || {};
  if (!dateRe.test(from || '') || !dateRe.test(to || '') || from > to) return res.status(400).json({ error: '期間を正しく指定してください' });
  if (!['csv', 'json'].includes(format)) return res.status(400).json({ error: '形式を選んでください' });
  const id = Number(q.run('INSERT INTO exports(user_id, format, period_from, period_to) VALUES(?,?,?,?)', req.user.id, format, from, to).lastInsertRowid);
  enqueue('export', { exportId: id });
  audit(req, 'link_export_request', { id, from, to, format });
  res.status(202).json({ id });
});
r.get('/exports/:id/download', (req, res) => {
  const e = q.one("SELECT * FROM exports WHERE id=? AND status='done'", req.params.id);
  if (!e) return res.status(404).json({ error: 'ファイルがありません' });
  audit(req, 'link_export_download', { id: e.id, file: e.file_name });
  res.setHeader('Cache-Control', 'no-store');
  res.download(path.join(config.dataDir, 'exports', path.basename(e.file_name)));
});

// AD-08 操作ログ
r.get('/audit-logs', (req, res) => {
  const { action, from, to } = req.query;
  const where = ['1=1'];
  const p = [];
  if (action) { where.push('a.action LIKE ?'); p.push(`%${action}%`); }
  if (from && dateRe.test(from)) { where.push('a.created_at >= ?'); p.push(new Date(from + 'T00:00:00+09:00').toISOString()); }
  if (to && dateRe.test(to)) { where.push('a.created_at < ?'); p.push(new Date(new Date(to + 'T00:00:00+09:00').getTime() + 86400_000).toISOString()); }
  const logs = q.all(`SELECT a.*, u.login_id FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 500`, ...p);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
    return res.send(toCsv([{ label: '日時', key: 'created_at' }, { label: 'ログインID', key: 'login_id' }, { label: '権限', key: 'role' }, { label: '操作', key: 'action' }, { label: '詳細', key: 'detail' }, { label: 'IP', key: 'ip' }], logs));
  }
  res.json({ logs });
});

// 利用状況（CM-03の日別集計）
r.get('/usage', (req, res) => {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const rows = q.all("SELECT substr(datetime(created_at, '+9 hours'), 1, 10) AS day, type, COUNT(*) AS n FROM events WHERE created_at >= ? GROUP BY day, type ORDER BY day", since);
  res.json({ rows });
});

export default r;
