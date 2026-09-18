import { q, parseJson, nowIso } from './db.js';
import { alignmentForCurriculum, buildAlignment, extractMaterial, materialDesign } from './curriculum-guidance.js';

export function curriculumDto(c) {
  if (!c) return null;
  return {
    id: c.id,
    companyId: c.company_id,
    companyName:
      c.company_name || q.one('SELECT name FROM companies WHERE id=?', c.company_id)?.name,
    companyIndustry:
      c.company_industry || q.one('SELECT industry FROM companies WHERE id=?', c.company_id)?.industry || null,
    sourceId: c.source_id,
    themeId: c.theme_id,
    teacherId: c.teacher_id,
    schoolId: c.school_id,
    title: c.title,
    sourceContent: c.source_content,
    audience: c.audience,
    subject: c.subject,
    duration: c.duration,
    objectives: parseJson(c.objectives, []),
    stages: parseJson(c.stages, []),
    assessment: c.assessment,
    alignment: alignmentForCurriculum(c),
    materialAnalysis: extractMaterial(c.source_content),
    status: c.status,
    generatedBy: c.generated_by,
    updatedAt: c.updated_at,
  };
}
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
export function insertCurriculum(c, companyId, extra = {}) {
  const alignment = structuredClone(c.alignment || buildAlignment(c));
  alignment.review = { status: 'pending', confirmedAt: null, confirmedBy: null, note: '' };
  const result = q.run(
    `INSERT INTO curricula(company_id,source_id,theme_id,teacher_id,school_id,title,source_content,audience,subject,duration,objectives,stages,assessment,status,alignment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    companyId,
    extra.sourceId || null,
    extra.themeId || null,
    extra.teacherId || null,
    extra.schoolId || null,
    c.title,
    c.sourceContent,
    c.audience,
    c.subject,
    c.duration,
    JSON.stringify(c.objectives),
    JSON.stringify(c.stages),
    c.assessment,
    extra.status || 'draft',
    JSON.stringify(alignment),
  );
  return curriculumDto(q.one('SELECT * FROM curricula WHERE id=?', Number(result.lastInsertRowid)));
}
export function publishCurriculum(id) {
  const c = q.one('SELECT * FROM curricula WHERE id=?', id);
  const dto = curriculumDto(c);
  let themeId = c.theme_id;
  const params = [
    c.title,
    c.source_content.slice(0, 2000),
    JSON.stringify(dto.stages.map((s) => s.activity)),
    c.assessment,
    c.subject,
    nowIso(),
  ];
  if (themeId)
    q.run(
      "UPDATE themes SET title=?,summary=?,questions=?,worksheet=?,field=?,updated_at=?,status='published' WHERE id=?",
      ...params,
      themeId,
    );
  else
    themeId = Number(
      q.run(
        "INSERT INTO themes(title,summary,questions,worksheet,field,published_at,company_id,status) VALUES(?,?,?,?,?,?,?,'published')",
        ...params,
        c.company_id,
      ).lastInsertRowid,
    );
  q.run(
    "UPDATE curricula SET status='published',theme_id=?,updated_at=? WHERE id=?",
    themeId,
    nowIso(),
    id,
  );
  return curriculumDto(q.one('SELECT * FROM curricula WHERE id=?', id));
}
