// Shared, deterministic curriculum draft generation; no network or database access.
import { buildAlignment, materialDesign } from '../server/curriculum-guidance.js';

export function generateCurriculum({ title, sourceContent, audience, subject, duration, schoolLevel, guidelineId }) {
  const design = materialDesign(sourceContent, title);
  const alignment = buildAlignment({ title, sourceContent, audience, subject, schoolLevel, guidelineId });
  const multiple = duration / 50;
  return {
    title,
    sourceContent,
    audience,
    subject,
    duration,
    alignment,
    objectives: alignment.pillars.map(pillar => pillar.objective),
    stages: [
      {
        title: '出会う・問いを持つ',
        minutes: 5 * multiple,
        activity: `${design.drivingQuestion}\n\n授業前の理解度を保存し、今の考えを短く記録しましょう。`,
        teacherNote: '正解を求めず、最初の考えを短い言葉で書かせる。',
      },
      {
        title: '企業の現場を知る',
        minutes: 10 * multiple,
        activity: `企業提供文の抜粋（事実関係は未検証）を読み、事実・主張・課題・制約を分けて整理しましょう。資料番号を記録し、確認に必要な追加情報を一つ挙げます。\n\n${sourceContent.length <= 700 ? sourceContent : design.evidenceText}`,
        teacherNote: 'これは企業入力をもとにした草案です。公開できる情報と事実関係を確認する。',
      },
      {
        title: '対話して、解決策をつくる',
        minutes: 20 * multiple,
        activity: `${design.comparison}\n\n${alignment.focus}`,
        teacherNote: '役割を分け、根拠と反対意見も記録させる。',
      },
      {
        title: '伝える・問い直す',
        minutes: 10 * multiple,
        activity:
          '提案と根拠を1分で伝え、他のグループから質問をもらいましょう。質問を受けて案を1点改善します。',
        teacherNote: '発言量だけで評価せず、観察・記録・質問も学習の証拠として扱う。',
      },
      {
        title: '自分の未来につなげる',
        minutes: 5 * multiple,
        activity:
          '授業後の理解度、今日の発見、関心を持った分野、次に試す小さな行動を記録しましょう。',
        teacherNote: '自己評価の変化を成績や職業適性と断定しない。',
      },
    ],
    assessment: alignment.pillars.map(pillar => `${pillar.label}：${pillar.evidence}をもとに、目標に向かう過程と変化を言葉で記録する。`).join('\n'),
  };
}
