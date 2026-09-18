// Local curriculum design suggestions. These are editable mappings, never an automatic compliance verdict.
const INQUIRY_PDF = 'https://www.mext.go.jp/content/20260115-mxt__kyoiku01_2_9.pdf';
const INFO_PDF = 'https://www.mext.go.jp/content/20230615-mxt_kyoikujinzai02-000033062_08.pdf';
export const GUIDANCE_PROFILES = [
  { id: 'high_inquiry', schoolLevel: 'high', label: '高校・総合的な探究の時間', subject: '総合的な探究の時間',
    source: { title: '高等学校学習指導要領（平成30年告示）解説 総合的な探究の時間編', url: INQUIRY_PDF, section: '第3章 目標／第4章 各学校の目標・内容／第9章 学習指導／第10章 評価', pages: '本文11〜36、117〜138頁' },
    focus: '自己の在り方や生き方と社会の課題を結び、問い・方法・根拠を自分たちで選ぶ。' },
  { id: 'middle_integrated', schoolLevel: 'middle', label: '中学・総合的な学習の時間', subject: '総合的な学習の時間',
    source: { title: '中学校学習指導要領 第4章 総合的な学習の時間（文科省解説 付録4収録）', url: INQUIRY_PDF, section: '付録4 第1 目標／第2 各学校の目標・内容／第3 指導計画・内容の取扱い', pages: '本文181〜183頁' },
    focus: '実生活の身近な疑問から課題を立て、協力して調べ、自分の生活や社会への関わりを考える。' },
  { id: 'high_information', schoolLevel: 'high', label: '高校・情報Ⅰ（情報社会の問題解決）', subject: '情報Ⅰ',
    source: { title: '高等学校学習指導要領（平成30年告示）解説 情報編', url: INFO_PDF, section: '第1部 第2章 第1節 情報Ⅰ／2 内容とその取扱い（1）情報社会の問題解決', pages: '本文22〜26頁' },
    focus: '情報の信頼性・権利・個人情報を確かめ、情報技術を使う方法と使わない方法を比べる。' },
];
export const PILLARS = [
  { key: 'knowledge', label: '知識及び技能' },
  { key: 'thinking', label: '思考力・判断力・表現力等' },
  { key: 'agency', label: '学びに向かう力・人間性等' },
];
export const PROCESSES = [
  { key: 'question', label: '課題の設定' }, { key: 'collect', label: '情報の収集' },
  { key: 'analyze', label: '整理・分析' }, { key: 'express', label: 'まとめ・表現' },
];
export const GUIDANCE_NOTE = '文部科学省の資料を参照した授業設計の候補です。学習指導要領への自動適合判定や認定ではありません。各学校の目標・年間計画・生徒の実態に照らして教員が確認してください。';

export function selectGuidance({ schoolLevel, guidelineId, audience = '', subject = '' } = {}) {
  const level = schoolLevel || (/中学/.test(audience) ? 'middle' : 'high');
  const inferred = level === 'middle' ? 'middle_integrated' : /^情報[ⅠI1１]$/.test(subject) ? 'high_information' : 'high_inquiry';
  return GUIDANCE_PROFILES.find(p => p.id === (guidelineId || inferred) && p.schoolLevel === level) || null;
}

export function extractMaterial(sourceContent) {
  const text = String(sourceContent || '');
  const fragments = [];
  for (const match of text.matchAll(/[^\n。！？]+[。！？]?/gu)) {
    const raw = match[0].trim();
    if (!raw) continue;
    const offset = match.index + match[0].indexOf(raw);
    for (let start = 0; start < raw.length; start += 360) {
      const body = raw.slice(start, start + 360);
      const kind = /[？?]|問い|なぜ|どうすれば|考えてほしい/.test(body) ? 'question'
        : /課題|困|制約|予算|費用|負担|不足|安全|できない|難し|必要|問題/.test(body) ? 'constraint'
          : /[0-9０-９]|調査|データ|実績|結果|測定/.test(body) ? 'evidence' : 'context';
      fragments.push({ id: `S${fragments.length + 1}`, text: body, kind, start: offset + start, end: offset + start + body.length });
    }
  }
  return { processedCharacters: text.length, fragmentCount: fragments.length, fragments };
}
const cited = (fragment) => fragment ? `[${fragment.id}] ${fragment.text}` : '追加の資料を教員と相談して用意する。';
export function materialDesign(sourceContent, title) {
  const material = extractMaterial(sourceContent);
  const { fragments } = material;
  const question = fragments.find(f => f.kind === 'question');
  const constraint = fragments.findLast(f => f.kind === 'constraint') || fragments.at(-1);
  const evidence = fragments.find(f => f.kind === 'evidence') || fragments[0];
  const last = fragments.at(-1);
  const selected = [...new Map([evidence, constraint, last].filter(Boolean).map(x => [x.id, x])).values()];
  return {
    material,
    drivingQuestion: question ? `${question.text}\nこの問いを、調べて確かめられる自分たちの問いに言い換えよう。` : `「${title}」で、誰のどんな困りごとを解決したいですか。\n手がかり：${cited(constraint)}\n解決を判断する条件を一つ決めましょう。`,
    evidenceText: selected.map(cited).join('\n\n'),
    comparison: `企業文の条件「${constraint?.text || title}」を手がかりに2案を比較する。\n根拠となる資料番号、まだ分からないこと、別の立場からの反対意見を表にする。`,
  };
}
export function buildAlignment(input) {
  const profile = selectGuidance(input);
  if (!profile) throw new Error('対象校種と学習指導要領の候補が一致していません');
  const information = profile.id === 'high_information';
  const middle = profile.schoolLevel === 'middle';
  const title = input.title;
  return {
    version: 'curriculum-guidance/1.0', schoolLevel: profile.schoolLevel, guidelineId: profile.id,
    schoolGoal: '', unitPosition: '', subjectConnection: input.subject || profile.subject,
    pillars: [
      { ...PILLARS[0], objective: information ? `${title}に必要な情報を出典・権利・個人情報の観点で確かめ、問題解決の手順を説明する。` : `${title}に関わる事実・立場・制約を資料から読み取り、根拠を付けて説明する。`, evidence: '出典番号付きの資料メモ、用語や条件を整理した表' },
      { ...PILLARS[1], objective: information ? '情報技術を活用する案と別の案を、効果・負担・リスクから比べ、根拠を示して提案する。' : `${middle ? '身近な疑問' : '自己の関心と社会の課題'}から問いを立て、複数の情報を比較して提案を改善する。`, evidence: '自分で立てた問い、比較表、提案とその修正理由' },
      { ...PILLARS[2], objective: `${middle ? '友人のよさを生かして協力し' : '自分の役割や学び方を振り返り、他者の視点を生かし'}、次に試す行動を具体化する。`, evidence: '対話中の工夫、学習過程の記録、次の行動を記した振り返り' },
    ],
    processes: PROCESSES.map((p, i) => ({ ...p, activity: [
      `${title}から自分たちで調べたい問いを一つ選ぶ。`,
      '企業の提供文と追加資料を分けて読み、出典・事実・未確認情報を記す。',
      '異なる立場と条件を整理し、二つ以上の案を根拠とともに比較する。',
      '相手に伝わる方法で提案し、質問を受けて改善点と次の問いを残す。',
    ][i], evidence: ['問いのメモ', '出典付き資料メモ', '比較表・根拠一覧', '提案・修正理由・振り返り'][i], stageIndex: [0, 1, 2, 3][i] })),
    sourceReferences: [{ ...profile.source }], focus: profile.focus, note: GUIDANCE_NOTE,
    review: { status: 'pending', confirmedAt: null, confirmedBy: null, note: '' },
  };
}
export function normalizeAlignment(value, input, stageCount) {
  const fallback = buildAlignment(input);
  if (value === undefined) return fallback;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('指導要領との対応を確認してください');
  const profile = selectGuidance({ schoolLevel: value.schoolLevel, guidelineId: value.guidelineId });
  if (!profile) throw new Error('対象校種と学習指導要領の候補が一致していません');
  const validText = (v, max = 1500) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const optionalText = (v, max) => typeof v === 'string' && v.length <= max;
  if (!optionalText(value.schoolGoal, 2000) || !optionalText(value.unitPosition, 1000) || !optionalText(value.subjectConnection, 1000)) throw new Error('自校の目標・単元位置・教科との関連を確認してください');
  if (!Array.isArray(value.pillars) || value.pillars.length !== 3 || !PILLARS.every(p => value.pillars.some(v => v?.key === p.key && validText(v.objective) && validText(v.evidence)))) throw new Error('三つの資質・能力の目標と評価の証拠を入力してください');
  if (!Array.isArray(value.processes) || value.processes.length !== 4 || !PROCESSES.every(p => value.processes.some(v => v?.key === p.key && validText(v.activity) && validText(v.evidence) && Number.isInteger(v.stageIndex) && v.stageIndex >= 0 && v.stageIndex < stageCount))) throw new Error('探究の過程・評価の証拠・対応する活動を確認してください');
  return { ...buildAlignment({ ...input, schoolLevel: profile.schoolLevel, guidelineId: profile.id }),
    schoolGoal: value.schoolGoal.trim(), unitPosition: value.unitPosition.trim(), subjectConnection: value.subjectConnection.trim(),
    pillars: PILLARS.map(p => { const v = value.pillars.find(x => x.key === p.key); return { ...p, objective: v.objective.trim(), evidence: v.evidence.trim() }; }),
    processes: PROCESSES.map(p => { const v = value.processes.find(x => x.key === p.key); return { ...p, activity: v.activity.trim(), evidence: v.evidence.trim(), stageIndex: v.stageIndex }; }),
  };
}
export function alignmentForCurriculum(c) {
  let saved;
  try { saved = typeof c.alignment === 'string' ? JSON.parse(c.alignment) : c.alignment; } catch { saved = null; }
  return saved?.version === 'curriculum-guidance/1.0' ? saved : buildAlignment({ title: c.title, audience: c.audience, subject: c.subject });
}
