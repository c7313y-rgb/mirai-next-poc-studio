import { q, parseJson, nowIso } from './db.js';
import { config } from './config.js';
import { jstRangeToUtc, jstDate } from './lib/time.js';
import { plainId } from './lib/pseudo.js';
import { RECORD_TYPES } from './lib/taxonomy.js';
import { toCsv } from './lib/csv.js';
import { ai } from './ai/index.js';

export const EXPORT_SCHEMA_VERSION = 'mirai-next-link/0.3';

// 要件定義書 7.3 副担任mirAI連携項目
export const LINK_FIELDS = [
  { key: 'pseudo_id', label: '仮名ID', required: true },
  { key: 'school_code', label: '学校コード', required: true },
  { key: 'grade_class', label: '学年・クラス', required: true },
  { key: 'record_date', label: '記録日', required: true },
  { key: 'record_type', label: '記録の種類', required: true },
  { key: 'record_text', label: '記録テキスト', required: true },
  { key: 'interest_tags', label: '関心タグ', required: true },
  { key: 'theme', label: '取り組んだテーマ', required: true, applies: (r) => r.record_type_code === 'theme' },
  { key: 'company_id', label: '企業ID', required: true, applies: (r) => r.record_type_code === 'theme' },
  { key: 'company_industry', label: '企業の業種分野', required: true, applies: (r) => r.record_type_code === 'theme' },
  { key: 'period_summary', label: '振り返り要約', required: true },
  { key: 'experience', label: '体験記録', required: false, applies: (r) => r.record_type_code === 'experience' },
  { key: 'teacher_comments', label: '教員コメント', required: false },
];

/**
 * 連携データを組み立てる。画像・要確認フラグ・利用ログは含めない（要件定義書7.3 対象外）。
 * withAiSummary=false のときは期間要約を記録ごとの要約の連結で代替（KPI計算用・高速）。
 */
export async function buildExportDataset({ from, to, schoolId = null, withAiSummary = false }) {
  const [s, e] = jstRangeToUtc(from, to);
  const rows = q.all(`
    SELECT r.*, u.pseudo_id, u.attendance_no, u.student_key, c.grade, c.name AS class_name, sc.code AS school_code,
           t.title AS theme_title, t.field AS subject, t.company_id AS theme_company_id,
           co.industry AS company_industry
    FROM records r
    JOIN users u ON u.id = r.user_id
    JOIN classes c ON c.id = r.class_id
    JOIN schools sc ON sc.id = r.school_id
    LEFT JOIN themes t ON t.id = r.theme_id
    LEFT JOIN companies co ON co.id = t.company_id
    WHERE r.status='submitted' AND r.submitted_at >= ? AND r.submitted_at < ?
    ${schoolId ? 'AND r.school_id = ?' : ''}
    ORDER BY u.pseudo_id, r.submitted_at`, s, e, ...(schoolId ? [Number(schoolId)] : []));

  const commentsByRecord = new Map();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    for (const c of q.all(`SELECT record_id, body FROM comments WHERE record_id IN (${ids.map(() => '?').join(',')}) AND created_at < ? ORDER BY id`, ...ids, e)) {
      if (!commentsByRecord.has(c.record_id)) commentsByRecord.set(c.record_id, []);
      commentsByRecord.get(c.record_id).push(c.body);
    }
  }

  const byStudent = new Map();
  for (const r of rows) {
    const id = config.exportIdMode === 'plain'
      ? plainId({ schoolCode: r.school_code, grade: r.grade, className: r.class_name, attendanceNo: r.attendance_no })
      : r.pseudo_id;
    if (!byStudent.has(id)) byStudent.set(id, { pseudo_id: id, school_code: r.school_code, grade: r.grade, class: r.class_name, grade_class: `${r.grade}年${r.class_name}組`, texts: [], summaries: [] });
    const st = byStudent.get(id);
    st.texts.push(r.final_text || '');
    if (r.summary) st.summaries.push(r.summary);
    r.__sid = id;
  }

  for (const st of byStudent.values()) {
    if (withAiSummary && st.texts.length) {
      try { st.period_summary = await ai().periodSummary({ texts: st.texts }); }
      catch { st.period_summary = st.summaries.join(' / '); }
    } else st.period_summary = st.summaries.join(' / ');
    delete st.texts; delete st.summaries;
  }

  const records = rows.map((r) => ({
    pseudo_id: r.__sid,
    school_code: r.school_code,
    grade: r.grade,
    class: r.class_name,
    grade_class: `${r.grade}年${r.class_name}組`,
    record_date: jstDate(r.submitted_at),
    record_type_code: r.type,
    record_type: RECORD_TYPES[r.type],
    record_text: r.final_text || '',
    interest_tags: parseJson(r.tags, []),
    theme_id: r.theme_id,
    theme_title: r.theme_title,
    subject: r.subject,
    company_id: r.theme_company_id || null,
    company_industry: r.company_industry || null,
    theme: r.theme_id ? `${r.theme_id}:${r.theme_title}` : '',
    period_summary: byStudent.get(r.__sid).period_summary,
    experience_date: r.type === 'experience' ? r.experience_date : null,
    experience_summary: r.type === 'experience' ? r.summary : null,
    experience: r.type === 'experience' ? (r.summary || '') : '',
    teacher_comments: commentsByRecord.get(r.id) || [],
  }));

  return {
    meta: { schema: EXPORT_SCHEMA_VERSION, generated_at: nowIso(), period_from: from, period_to: to, school_id: schoolId ? Number(schoolId) : null, id_mode: config.exportIdMode, student_count: byStudent.size, record_count: records.length },
    students: [...byStudent.values()],
    records,
  };
}

// K-X2 データ連携充足率：必須項目のうち、実データで1件以上出力できた項目の割合
export function linkFillRate(dataset) {
  const required = LINK_FIELDS.filter((f) => f.required);
  const hasValue = (row, field) => {
    const value = row[field.key];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && String(value).trim() !== '';
  };
  const detail = required.map((f) => {
    const applicable = dataset.records.filter((r) => (f.applies ? f.applies(r) : true));
    const filled = applicable.filter((r) => hasValue(r, f));
    return { key: f.key, label: f.label, applicable: applicable.length, filled: filled.length, ok: filled.length > 0 };
  });
  const completeRecords = dataset.records.filter((row) => required.every((field) => (field.applies && !field.applies(row)) || hasValue(row, field))).length;
  return {
    rate: dataset.records.length && required.length ? detail.filter((d) => d.ok).length / required.length : null,
    detail,
    completeRecords,
    completeRecordRate: dataset.records.length ? completeRecords / dataset.records.length : null,
  };
}

export function renderExport(dataset, format) {
  if (format === 'json') {
    const students = dataset.students.map((st) => ({
      ...st,
      records: dataset.records.filter((r) => r.pseudo_id === st.pseudo_id).map((r) => ({
        record_date: r.record_date, record_type: r.record_type, record_text: r.record_text, interest_tags: r.interest_tags,
        theme: r.theme_id ? { theme_id: r.theme_id, theme_title: r.theme_title, company_id: r.company_id, company_industry: r.company_industry, subject: r.subject } : null,
        experience: r.record_type_code === 'experience' ? { date: r.experience_date, summary: r.experience_summary } : null,
        teacher_comments: r.teacher_comments,
      })),
    }));
    return { ext: 'json', content: JSON.stringify({ meta: dataset.meta, students }, null, 2) };
  }
  const cols = [
    { key: 'pseudo_id', label: 'pseudo_id' }, { key: 'school_code', label: 'school_code' }, { key: 'grade', label: 'grade' }, { key: 'class', label: 'class' },
    { key: 'record_date', label: 'record_date' }, { key: 'record_type', label: 'record_type' }, { key: 'record_text', label: 'record_text' },
    { key: 'interest_tags', label: 'interest_tags' }, { key: 'theme_id', label: 'theme_id' }, { key: 'theme_title', label: 'theme_title' }, { key: 'company_id', label: 'company_id' },
    { key: 'company_industry', label: 'company_industry' }, { key: 'subject', label: 'subject' }, { key: 'period_summary', label: 'period_summary' },
    { key: 'experience_date', label: 'experience_date' }, { key: 'experience_summary', label: 'experience_summary' },
    { key: 'teacher_comments', label: 'teacher_comments' },
  ];
  return { ext: 'csv', content: toCsv(cols, dataset.records) };
}
