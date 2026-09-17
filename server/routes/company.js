import { Router } from 'express';
import { q, parseJson } from '../db.js';
import { requireRole } from '../auth.js';
import { getSettings } from '../settings.js';
import { logEvent } from '../lib/log.js';
import { openSurveysFor, surveyDto, validateAnswers } from '../lib/surveys.js';

const r = Router();
r.use(requireRole('company'));

// C-01 反応レポート：集計値と承認済みの匿名要約のみ（個人は特定不可）
r.get('/report', (req, res) => {
  const st = getSettings();
  const company = q.one('SELECT id, name, industry FROM companies WHERE id=?', req.user.company_id);
  const themes = q.all("SELECT * FROM themes WHERE company_id=? AND status IN ('published','archived') ORDER BY published_at", req.user.company_id);
  const schoolLabel = new Map();
  const labelFor = (s) => {
    if (st.company_show_school_names) return s.name;
    if (!schoolLabel.has(s.id)) schoolLabel.set(s.id, `協力校${String.fromCharCode(65 + schoolLabel.size)}`);
    return schoolLabel.get(s.id);
  };
  const allSchools = q.all('SELECT id, name FROM schools ORDER BY id');
  allSchools.forEach(labelFor); // ラベルを学校IDで固定

  const out = themes.map((t) => {
    const views = q.one("SELECT COUNT(*) c FROM theme_views v JOIN users u ON u.id=v.user_id WHERE v.theme_id=? AND u.role='student'", t.id).c;
    const interests = q.one("SELECT COUNT(*) c FROM theme_interests i JOIN users u ON u.id=i.user_id WHERE i.theme_id=? AND u.role='student'", t.id).c;
    const records = q.one("SELECT COUNT(*) c FROM records WHERE theme_id=? AND status='submitted' AND type='theme'", t.id).c;
    const classes = q.one('SELECT COUNT(DISTINCT class_id) c FROM distributions WHERE theme_id=?', t.id).c;
    const bySchool = allSchools.map((s) => {
      const v = q.one("SELECT COUNT(*) c FROM theme_views v JOIN users u ON u.id=v.user_id WHERE v.theme_id=? AND u.school_id=?", t.id, s.id).c;
      if (!v) return null;
      const i = q.one("SELECT COUNT(*) c FROM theme_interests i JOIN users u ON u.id=i.user_id WHERE i.theme_id=? AND u.school_id=?", t.id, s.id).c;
      const suppressed = v < st.school_min_cell;
      return { school: labelFor(s), views: suppressed ? null : v, rate: suppressed ? null : i / v, suppressed };
    }).filter(Boolean);
    const submitted = q.all("SELECT r.user_id, r.tags FROM records r JOIN users u ON u.id=r.user_id WHERE r.theme_id=? AND r.status='submitted' AND u.role='student'", t.id);
    const tagStats = new Map();
    for (const rec of submitted) for (const tag of new Set(parseJson(rec.tags, []))) {
      if (!tagStats.has(tag)) tagStats.set(tag, { count: 0, students: new Set() });
      const stats = tagStats.get(tag);
      stats.count += 1;
      stats.students.add(rec.user_id);
    }
    // 記録件数ではなく、生徒の実人数で少人数のタグ・声を抑制する。
    const tags = [...tagStats].filter(([, stats]) => stats.students.size >= st.school_min_cell)
      .sort((a, b) => b[1].count - a[1].count).slice(0, 6).map(([tag, stats]) => ({ tag, count: stats.count }));
    const voice = new Set(submitted.map((rec) => rec.user_id)).size >= st.school_min_cell
      ? q.one("SELECT summary, source_count, generated_at FROM voice_summaries WHERE theme_id=? AND status='approved' AND source_count>=?", t.id, st.school_min_cell)
      : null;
    return {
      id: t.id, title: t.title, status: t.status, classes, views, interests, interestRate: views ? interests / views : null, records,
      bySchool, tags,
      voice: voice ? { ...parseJson(voice.summary, { summary: voice.summary }), sourceCount: voice.source_count, generatedAt: voice.generated_at } : null,
    };
  });
  logEvent(req.user, 'company_report_view', 'company', req.user.company_id);
  const totals = out.reduce((a, t) => ({ views: a.views + t.views, interests: a.interests + t.interests, records: a.records + t.records }), { views: 0, interests: 0, records: 0 });
  const schoolsReached = q.one(`SELECT COUNT(DISTINCT c.school_id) c FROM distributions d JOIN classes c ON c.id=d.class_id JOIN themes t ON t.id=d.theme_id WHERE t.company_id=?`, req.user.company_id).c;
  res.json({ company, totals: { ...totals, interestRate: totals.views ? totals.interests / totals.views : null, schoolsReached, minCell: st.school_min_cell }, themes: out });
});

// C-02 継続参加アンケート
r.get('/surveys', (req, res) => {
  const open = openSurveysFor(req.user);
  const answered = q.all("SELECT sv.id, sv.title, sr.created_at FROM survey_responses sr JOIN surveys sv ON sv.id=sr.survey_id WHERE sr.user_id=? AND sv.kind='continuation'", req.user.id);
  res.json({ open, answered });
});
r.post('/surveys/:id/responses', (req, res) => {
  const s = q.one("SELECT * FROM surveys WHERE id=? AND kind='continuation'", req.params.id);
  if (!s || !openSurveysFor(req.user).some((x) => x.id === s.id)) return res.status(404).json({ error: '回答できるアンケートがありません' });
  // 同じ企業の別アカウントからの重複回答を防ぐ
  if (q.one('SELECT 1 FROM survey_responses sr JOIN users u ON u.id=sr.user_id WHERE sr.survey_id=? AND u.company_id=?', s.id, req.user.company_id)) return res.status(409).json({ error: '貴社は回答済みです' });
  const v = validateAnswers(surveyDto(s), req.body?.answers);
  if (v.error) return res.status(400).json({ error: v.error });
  q.run('INSERT INTO survey_responses(survey_id, user_id, distribution_id, answers) VALUES(?,?,0,?)', s.id, req.user.id, JSON.stringify(v.answers));
  logEvent(req.user, 'survey_response', 'survey', s.id);
  res.json({ ok: true });
});

// CO-03 素材提出
r.get('/materials', (req, res) => {
  const themes = q.all('SELECT id, title FROM themes WHERE company_id=? ORDER BY id', req.user.company_id);
  const items = q.all('SELECT id, theme_id, title, url, note, created_at FROM material_submissions WHERE company_id=? ORDER BY id DESC', req.user.company_id);
  res.json({ themes, items });
});
r.post('/materials', (req, res) => {
  const { themeId, title, url, note } = req.body || {};
  if (!title || String(title).length > 200) return res.status(400).json({ error: '資料名を入力してください' });
  if (url && !/^https:\/\//.test(url)) return res.status(400).json({ error: 'URLは https:// から始まるものを入力してください' });
  if (themeId && !q.one('SELECT 1 FROM themes WHERE id=? AND company_id=?', themeId, req.user.company_id)) return res.status(400).json({ error: 'テーマが正しくありません' });
  q.run('INSERT INTO material_submissions(company_id, user_id, theme_id, title, url, note) VALUES(?,?,?,?,?,?)', req.user.company_id, req.user.id, themeId || null, String(title), url || null, String(note || '').slice(0, 2000));
  res.status(201).json({ ok: true });
});

export default r;
