import { Router } from 'express';
import { q, tx, nowIso, parseJson } from '../db.js';
import { requireRole } from '../auth.js';
import { logEvent } from '../lib/log.js';
import { saveFile, deleteFile } from '../lib/filestore.js';
import { uploadImages, sniffImage } from '../lib/upload.js';
import { activeThemesForClass, isThemeActiveForClass, themeDto } from '../lib/themes.js';
import { enqueue } from '../jobs.js';
import { openSurveysFor, surveyDto, validateAnswers } from '../lib/surveys.js';

const r = Router();
r.use(requireRole('student'));

function recordDto(rec, { withText = true } = {}) {
  const images = q.all('SELECT id FROM record_images WHERE record_id=? ORDER BY id', rec.id).map((i) => i.id);
  const comments = q.all('SELECT c.body, c.created_at, u.display_name FROM comments c JOIN users u ON u.id=c.teacher_id WHERE c.record_id=? ORDER BY c.id', rec.id);
  return {
    id: rec.id, type: rec.type, themeId: rec.theme_id, themeTitle: rec.theme_title, experienceDate: rec.experience_date,
    ocrStatus: rec.ocr_status, ocrText: withText ? rec.ocr_text : undefined, finalText: withText ? rec.final_text : undefined,
    status: rec.status, aiStatus: rec.ai_status, feedback: rec.feedback, tags: parseJson(rec.tags, []),
    createdAt: rec.created_at, submittedAt: rec.submitted_at, images,
    comments: comments.map((c) => ({ body: c.body, at: c.created_at, teacher: c.display_name })),
  };
}

const ownRecord = (req) => q.one('SELECT r.*, t.title AS theme_title FROM records r LEFT JOIN themes t ON t.id=r.theme_id WHERE r.id=? AND r.user_id=?', req.params.id, req.user.id);

// S-01 ホーム
r.get('/home', (req, res) => {
  const u = req.user;
  const themes = activeThemesForClass(u.class_id).map((t) => ({
    ...t, interested: Boolean(q.one('SELECT 1 FROM theme_interests WHERE theme_id=? AND user_id=?', t.id, u.id)),
  }));
  const drafts = q.all("SELECT r.*, NULL AS theme_title FROM records r WHERE r.user_id=? AND r.status='draft' ORDER BY r.id DESC LIMIT 5", u.id).map((x) => recordDto(x, { withText: false }));
  const latest = q.all("SELECT r.*, t.title AS theme_title FROM records r LEFT JOIN themes t ON t.id=r.theme_id WHERE r.user_id=? AND r.status='submitted' ORDER BY r.submitted_at DESC LIMIT 3", u.id).map((x) => recordDto(x, { withText: false }));
  const weekStart = new Date(Date.now() - 6 * 86400_000).toISOString();
  const submittedThisWeek = q.one("SELECT COUNT(*) c FROM records WHERE user_id=? AND status='submitted' AND submitted_at >= ?", u.id, weekStart).c;
  const total = q.one("SELECT COUNT(*) c FROM records WHERE user_id=? AND status='submitted'", u.id).c;
  res.json({ themes, drafts, latest, surveys: openSurveysFor(u), stats: { submittedThisWeek, total } });
});

// S-03 テーマ詳細（閲覧ログ＝K-C3の分母）
r.get('/themes/:id', (req, res) => {
  if (!isThemeActiveForClass(req.params.id, req.user.class_id)) return res.status(404).json({ error: 'このテーマは配信されていません' });
  const t = q.one('SELECT t.*, co.name AS company_name, co.industry AS company_industry FROM themes t JOIN companies co ON co.id=t.company_id WHERE t.id=?', req.params.id);
  q.run(`INSERT INTO theme_views(theme_id, user_id, first_viewed_at) VALUES(?,?,?)
         ON CONFLICT(theme_id, user_id) DO UPDATE SET view_count = view_count + 1`, t.id, req.user.id, nowIso());
  logEvent(req.user, 'theme_view', 'theme', t.id);
  const interested = Boolean(q.one('SELECT 1 FROM theme_interests WHERE theme_id=? AND user_id=?', t.id, req.user.id));
  res.json({ theme: { ...themeDto(t), interested } });
});

r.post('/themes/:id/interest', (req, res) => {
  if (!isThemeActiveForClass(req.params.id, req.user.class_id)) return res.status(404).json({ error: 'このテーマは配信されていません' });
  const on = Boolean(req.body?.on);
  if (on) q.run('INSERT OR IGNORE INTO theme_interests(theme_id, user_id, created_at) VALUES(?,?,?)', req.params.id, req.user.id, nowIso());
  else q.run('DELETE FROM theme_interests WHERE theme_id=? AND user_id=?', req.params.id, req.user.id);
  logEvent(req.user, on ? 'interest_on' : 'interest_off', 'theme', Number(req.params.id));
  res.json({ interested: on });
});

// S-02 撮影・提出（1）画像アップロード → AI読み取りをキュー投入
r.post('/records', (req, res, next) => uploadImages(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '画像が大きすぎます（1枚10MBまで）' : err.code === 'LIMIT_FILE_COUNT' ? '画像は1回3枚までです' : '画像を受け取れませんでした' });
  next();
}), (req, res) => {
  const files = req.files || [];
  const detected = files.map((f) => sniffImage(f.buffer));
  if (detected.some((m) => !m)) return res.status(400).json({ error: 'JPEG・PNG・WebPの画像を選んでください' });
  const u = req.user;
  const saved = [];
  try {
    const id = tx(() => {
      const rec = q.run("INSERT INTO records(user_id, school_id, class_id, ocr_status) VALUES(?,?,?,?)", u.id, u.school_id, u.class_id, files.length ? 'pending' : 'none');
      files.forEach((f, i) => {
        const s = saveFile(f.buffer);
        saved.push(s.fileName);
        q.run('INSERT INTO record_images(record_id, file_name, mime, size, encrypted) VALUES(?,?,?,?,?)', rec.lastInsertRowid, s.fileName, detected[i], f.size, s.encrypted);
      });
      return Number(rec.lastInsertRowid);
    });
    if (files.length) enqueue('ocr', { recordId: id });
    logEvent(u, 'record_upload', 'record', id, { images: files.length });
    res.status(201).json({ id });
  } catch (e) {
    saved.forEach(deleteFile);
    throw e;
  }
});

r.get('/records/:id', (req, res) => {
  const rec = ownRecord(req);
  if (!rec) return res.status(404).json({ error: '記録が見つかりません' });
  res.json({ record: recordDto(rec), themes: rec.status === 'draft' ? activeThemesForClass(req.user.class_id) : [] });
});

// S-02（2）読み取り結果を確認・修正して提出
r.post('/records/:id/submit', (req, res) => {
  const rec = ownRecord(req);
  if (!rec) return res.status(404).json({ error: '記録が見つかりません' });
  if (rec.status === 'submitted') return res.status(409).json({ error: 'この記録は提出済みです' });
  const { type, themeId, experienceDate, text } = req.body || {};
  const body = String(text || '').trim();
  if (!['reflection', 'theme', 'experience'].includes(type)) return res.status(400).json({ error: '記録の種類を選んでください' });
  if (!body) return res.status(400).json({ error: '記録の文章が空です。読み取り結果を確認するか、入力してください' });
  if (body.length > 4000) return res.status(400).json({ error: '文章が長すぎます（4000文字まで）' });
  if (type === 'theme' && !isThemeActiveForClass(themeId, req.user.class_id)) return res.status(400).json({ error: '配信中のテーマを選んでください' });
  if (type === 'experience' && experienceDate && !/^\d{4}-\d{2}-\d{2}$/.test(experienceDate)) return res.status(400).json({ error: '体験日の形式が正しくありません' });
  const now = nowIso();
  q.run("UPDATE records SET type=?, theme_id=?, experience_date=?, final_text=?, status='submitted', submitted_at=?, ai_status='pending' WHERE id=?",
    type, type === 'theme' ? Number(themeId) : null, type === 'experience' ? experienceDate || null : null, body, now, rec.id);
  // 未提出アラートを自動解消
  q.run("UPDATE alerts SET status='auto_resolved', handled_at=? WHERE student_id=? AND kind='inactive' AND status='open'", now, req.user.id);
  enqueue('analyze', { recordId: rec.id });
  logEvent(req.user, 'record_submit', 'record', rec.id, { type, edited: rec.ocr_text ? rec.ocr_text.trim() !== body : null });
  res.json({ ok: true });
});

r.delete('/records/:id', (req, res) => {
  const rec = ownRecord(req);
  if (!rec || rec.status !== 'draft') return res.status(404).json({ error: '削除できる下書きがありません' });
  const imgs = q.all('SELECT file_name FROM record_images WHERE record_id=?', rec.id);
  q.run('DELETE FROM records WHERE id=?', rec.id);
  imgs.forEach((i) => deleteFile(i.file_name));
  res.json({ ok: true });
});

// S-04 記録一覧（ポートフォリオ）
r.get('/records', (req, res) => {
  const rows = q.all("SELECT r.*, t.title AS theme_title FROM records r LEFT JOIN themes t ON t.id=r.theme_id WHERE r.user_id=? AND r.status='submitted' ORDER BY r.submitted_at DESC LIMIT 200", req.user.id);
  res.json({ records: rows.map((x) => recordDto(x)) });
});

// S-05 生徒アンケート
r.get('/surveys/:id', (req, res) => {
  const s = openSurveysFor(req.user).find((x) => x.id === Number(req.params.id));
  if (!s) return res.status(404).json({ error: '回答できるアンケートがありません' });
  res.json({ survey: s });
});
r.post('/surveys/:id/responses', (req, res) => {
  const s = q.one("SELECT * FROM surveys WHERE id=? AND kind='student'", req.params.id);
  if (!s || !openSurveysFor(req.user).some((x) => x.id === s.id)) return res.status(404).json({ error: '回答できるアンケートがありません' });
  const v = validateAnswers(surveyDto(s), req.body?.answers);
  if (v.error) return res.status(400).json({ error: v.error });
  q.run('INSERT INTO survey_responses(survey_id, user_id, distribution_id, answers) VALUES(?,?,0,?)', s.id, req.user.id, JSON.stringify(v.answers));
  logEvent(req.user, 'survey_response', 'survey', s.id);
  res.json({ ok: true });
});

export default r;
