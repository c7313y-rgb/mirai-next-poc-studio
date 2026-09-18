import { q, parseJson, nowIso } from './db.js';
import { alignmentForCurriculum, buildAlignment, extractMaterial } from './curriculum-guidance.js';

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
export { generateCurriculum } from '../shared/curriculum-generator.js';

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
