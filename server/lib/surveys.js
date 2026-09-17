import { q, parseJson } from '../db.js';
import { jstDate } from './time.js';

// KPIに使う設問キー（削除・変更不可）
export const KPI_QUESTION_KEYS = { student: ['overall'], lesson: ['ease'], continuation: ['continue'] };

export const DEFAULT_SURVEYS = [
  {
    kind: 'student', title: '生徒アンケート（手帳×探究テーマ）',
    questions: [
      { key: 'overall', type: 'rating', label: '手帳を撮って記録する活動は、自分にとって役に立ちましたか', required: true },
      { key: 'theme', type: 'rating', label: '企業の探究テーマは興味をもてる内容でしたか', required: true },
      { key: 'ease', type: 'rating', label: '撮影・提出の操作はかんたんでしたか', required: true },
      { key: 'comment', type: 'text', label: 'よかったこと・こうしてほしいこと（自由記述）', required: false },
    ],
  },
  {
    kind: 'lesson', title: '授業後アンケート（教員）',
    questions: [
      { key: 'ease', type: 'rating', label: '授業のしやすさ', required: true },
      { key: 'reaction', type: 'rating', label: '生徒の反応', required: true },
      { key: 'prep_minutes', type: 'choice', label: '授業準備にかかった時間', options: ['15分未満', '15〜30分', '30〜60分', '60分以上'], required: true },
      { key: 'comment', type: 'text', label: '気づき・改善してほしい点（自由記述）', required: false },
    ],
  },
  {
    kind: 'continuation', title: '継続参加アンケート（参加企業）',
    questions: [
      { key: 'continue', type: 'choice', label: '次年度も継続して参加したいですか', options: [{ value: 'yes', label: '継続したい' }, { value: 'maybe', label: '条件次第で検討' }, { value: 'no', label: '継続しない' }], required: true },
      { key: 'value', type: 'rating', label: '生徒の反応レポートは参考になりましたか', required: true },
      { key: 'burden', type: 'rating', label: '参加の負担は小さかったですか（5=とても小さい）', required: true },
      { key: 'pay', type: 'choice', label: '有償化された場合の参加意向（参考）', options: ['月額10万円程度でも参加したい', '月額3〜5万円なら検討', '無償なら参加', 'わからない'], required: false },
      { key: 'request', type: 'text', label: '改善要望（自由記述）', required: false },
    ],
  },
];

export function surveyDto(s) {
  return { id: s.id, title: s.title, kind: s.kind, questions: parseJson(s.questions, []), openFrom: s.open_from, openTo: s.open_to, active: Boolean(s.active) };
}

export function isOpen(s, today = jstDate()) {
  return s.active && (!s.open_from || s.open_from <= today) && (!s.open_to || s.open_to >= today);
}

const roleKind = { student: 'student', teacher: 'lesson', company: 'continuation' };

export function openSurveysFor(user) {
  const kind = roleKind[user.role];
  if (!kind || kind === 'lesson') return [];
  return q.all('SELECT * FROM surveys WHERE kind=? ORDER BY id DESC', kind)
    .filter((s) => isOpen(s))
    .filter((s) => !q.one('SELECT 1 FROM survey_responses WHERE survey_id=? AND user_id=? AND distribution_id=0', s.id, user.id))
    .map(surveyDto);
}

export function validateAnswers(survey, answers) {
  if (!answers || typeof answers !== 'object') return { error: '回答が空です' };
  const out = {};
  for (const qn of survey.questions) {
    const v = answers[qn.key];
    const empty = v === undefined || v === null || String(v).trim() === '';
    if (empty) {
      if (qn.required) return { error: `「${qn.label}」に回答してください` };
      continue;
    }
    if (qn.type === 'rating') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: `「${qn.label}」は1〜5で回答してください` };
      out[qn.key] = n;
    } else if (qn.type === 'choice') {
      const values = (qn.options || []).map((o) => (typeof o === 'string' ? o : o.value));
      if (!values.includes(v)) return { error: `「${qn.label}」の選択肢が正しくありません` };
      out[qn.key] = v;
    } else out[qn.key] = String(v).slice(0, 2000);
  }
  return { answers: out };
}

export function validateQuestions(kind, questions) {
  if (!Array.isArray(questions) || !questions.length) return '設問を1つ以上設定してください';
  const keys = new Set();
  for (const qn of questions) {
    if (!qn.key || !/^[a-z0-9_]+$/.test(qn.key)) return '設問キーは半角英小文字・数字・_で指定してください';
    if (keys.has(qn.key)) return `設問キー「${qn.key}」が重複しています`;
    keys.add(qn.key);
    if (!['rating', 'choice', 'text'].includes(qn.type)) return '設問タイプが正しくありません';
    if (!qn.label) return '設問文を入力してください';
    if (qn.type === 'choice' && !(qn.options || []).length) return '選択肢を設定してください';
  }
  for (const k of KPI_QUESTION_KEYS[kind] || []) if (!keys.has(k)) return `KPI集計に使う設問「${k}」は削除できません`;
  return null;
}
