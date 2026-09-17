import { q, parseJson } from '../db.js';
import { jstDate } from './time.js';

export function themeDto(t) {
  if (!t) return null;
  return {
    id: t.id, companyId: t.company_id, companyName: t.company_name, companyIndustry: t.company_industry,
    title: t.title, summary: t.summary, questions: parseJson(t.questions, []), worksheet: t.worksheet,
    materials: parseJson(t.materials, []), field: t.field, status: t.status, publishedAt: t.published_at,
    updatedAt: t.updated_at,
  };
}

export function activeThemesForClass(classId, today = jstDate()) {
  return q.all(`
    SELECT t.*, co.name AS company_name, co.industry AS company_industry, MIN(d.start_date) AS start_date, MAX(d.end_date) AS end_date
    FROM distributions d JOIN themes t ON t.id=d.theme_id JOIN companies co ON co.id=t.company_id
    WHERE d.class_id=? AND d.start_date <= ? AND d.end_date >= ? AND t.status='published'
    GROUP BY t.id ORDER BY MAX(d.created_at) DESC`, classId, today, today)
    .map((t) => ({ ...themeDto(t), startDate: t.start_date, endDate: t.end_date }));
}

export function isThemeActiveForClass(themeId, classId) {
  return activeThemesForClass(classId).some((t) => t.id === Number(themeId));
}
