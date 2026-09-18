import { generateCurriculum } from '../../../shared/curriculum-generator.js';

export const STORAGE_KEY = 'mirai-next-public-demo-v1';
export const newId = (prefix = 'demo') => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const copy = value => structuredClone(value);

export function makeInitialState() {
  const company = {
    ...generateCurriculum({
      title: '人とロボットが協力する、未来の工場を考えよう',
      sourceContent: 'デモ企業のみらい精工は、地域の工場で協働ロボットを活用しています。重い部品を運ぶ作業の負担を減らす一方、設備費用と作業者の学び直しが課題です。試行では運搬時間が20%減りましたが、全ての仕事を機械に任せることはできません。人の経験や判断を生かし、安全と働きやすさを両立するにはどうすればよいでしょうか。',
      audience: '高校2年生', subject: '総合的な探究の時間', duration: 50, schoolLevel: 'high', guidelineId: 'high_inquiry',
    }),
    id: 'company-robot', kind: 'company', status: 'published', sourceId: null, companyName: '株式会社みらい精工（架空）', teacherReviewed: false,
  };
  const food = {
    ...generateCurriculum({
      title: '規格外の野菜から、地域に選ばれる新商品をつくる',
      sourceContent: '架空の地域農園では、形や大きさが不揃いのため出荷できない野菜が収穫量の15%あります。味には問題がありませんが、加工する人手と運搬の費用が不足しています。農家、消費者、学校それぞれの立場から、食品ロスを減らしながら続けられる仕組みを考えてください。誰に何を届け、どのような方法で価値を伝えられるでしょうか。',
      audience: '高校2年生', subject: '総合的な探究の時間', duration: 100, schoolLevel: 'high', guidelineId: 'high_inquiry',
    }),
    id: 'company-food', kind: 'company', status: 'published', sourceId: null, companyName: 'みらい地域農園（架空）', teacherReviewed: false,
  };
  const teacher = { ...copy(company), id: 'teacher-robot', kind: 'teacher', sourceId: company.id, status: 'approved', teacherReviewed: true };
  teacher.alignment.schoolGoal = '地域の課題を根拠と対話から考える';
  teacher.alignment.unitPosition = '2年次・社会と仕事を知る探究単元';
  const snapshot = () => ({ curriculumId: teacher.id, title: teacher.title, companyName: teacher.companyName, duration: teacher.duration, stages: copy(teacher.stages), objectives: copy(teacher.objectives), assessment: teacher.assessment });
  return {
    version: 1,
    curricula: [company, food, teacher],
    lessons: [
      { ...snapshot(), id: 'lesson-next', status: 'scheduled', stageIndex: 0, baseline: null, response: null },
      { ...snapshot(), id: 'lesson-complete', title: '体験済みサンプル：人とロボットの協働', status: 'completed', stageIndex: teacher.stages.length - 1, baseline: { before: 2, submittedAt: '2026-09-01T01:00:00.000Z' }, response: { after: 4, learning: '機械の速さだけでなく、人の判断や安全を大切にする必要があると気づいた。', nextAction: '身近な仕事で人と機械が協力している場面を調べる。', interests: ['ものづくり', 'テクノロジー'], submittedAt: '2026-09-01T02:00:00.000Z' } },
    ],
    journeys: [{ id: 'journey-sample', stage: 'notice', topic: '働きやすい工場', body: '同じ仕事でも、人によって「助かる」と感じる場面が違うのが気になった。現場の人に聞いてみたい。', date: '2026-09-01' }],
    notes: [{ id: 'note-sample', body: '「誰にとって働きやすいのか」という問いを大切に、次に聞きたいことを手帳に3つ書いてみましょう。', date: '2026-09-02' }],
  };
}

const text = value => typeof value === 'string';
const texts = value => Array.isArray(value) && value.every(text);
const optionalText = value => value === undefined || value === null || text(value);
const score = value => Number.isInteger(value) && value >= 1 && value <= 5;
const alignmentShape = a => a && text(a.schoolGoal) && text(a.unitPosition) && text(a.focus) &&
  Array.isArray(a.pillars) && a.pillars.every(p => p && ['key', 'label', 'objective', 'evidence'].every(k => text(p[k]))) &&
  Array.isArray(a.processes) && a.processes.every(p => p && ['key', 'label', 'activity', 'evidence'].every(k => text(p[k])) && Number.isInteger(p.stageIndex)) &&
  Array.isArray(a.sourceReferences) && a.sourceReferences.every(s => s && ['title', 'url', 'section', 'pages'].every(k => text(s[k])) && /^https:\/\/www\.mext\.go\.jp\//.test(s.url));
export function validDemoState(state) {
  if (!state || state.version !== 1 || !['curricula', 'lessons', 'journeys', 'notes'].every(key => Array.isArray(state[key]) && state[key].length <= 300)) return false;
  const stages = list => Array.isArray(list) && list.length > 0 && list.every(stage => stage && text(stage.title) && text(stage.activity) && optionalText(stage.teacherNote) && Number.isFinite(stage.minutes));
  if (!state.curricula.every(c => c && ['id', 'title', 'sourceContent', 'companyName', 'audience', 'subject', 'assessment'].every(k => text(c[k])) && ['company', 'teacher'].includes(c.kind) && ['draft', 'published', 'approved'].includes(c.status) && [50, 100].includes(c.duration) && typeof c.teacherReviewed === 'boolean' && optionalText(c.sourceId) && stages(c.stages) && texts(c.objectives) && alignmentShape(c.alignment))) return false;
  if (!state.lessons.every(l => l && ['id', 'title', 'curriculumId', 'assessment'].every(k => text(l[k])) && stages(l.stages) && texts(l.objectives) && [50, 100].includes(l.duration) && ['scheduled', 'active', 'completed'].includes(l.status) && Number.isInteger(l.stageIndex) && l.stageIndex >= 0 && l.stageIndex < l.stages.length && (!l.baseline || (score(l.baseline.before) && text(l.baseline.submittedAt))) && (!l.response || (score(l.response.after) && text(l.response.learning) && text(l.response.nextAction) && text(l.response.submittedAt) && texts(l.response.interests))))) return false;
  if (!state.journeys.every(j => j && text(j.id) && ['notice', 'plan', 'experience', 'reflection'].includes(j.stage) && text(j.body) && text(j.date) && optionalText(j.topic))) return false;
  return state.notes.every(n => n && text(n.id) && text(n.body) && text(n.date));
}

export function loadDemo(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { state: makeInitialState(), warning: storage ? '' : 'このブラウザーでは端末保存を利用できません。このタブを閉じると操作内容は失われます。' };
    if (raw.length > 2_000_000) throw new Error('size');
    const state = JSON.parse(raw);
    if (!validDemoState(state)) throw new Error('shape');
    return { state, warning: '' };
  } catch {
    return { state: makeInitialState(), warning: '保存内容を読み込めなかったため、架空の初期データで開きました。' };
  }
}

export function saveDemo(storage, state) {
  if (!storage || !validDemoState(state)) throw new Error('保存できません');
  const raw = JSON.stringify(state);
  if (raw.length > 2_000_000) throw new Error('保存容量の上限です');
  storage.setItem(STORAGE_KEY, raw);
}
