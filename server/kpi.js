import { q, parseJson } from './db.js';
import { getSettings } from './settings.js';
import { jstDate, addDays, mondayOf, jstRangeToUtc, minDate, maxDate } from './lib/time.js';
import { buildExportDataset, linkFillRate } from './export.js';

const inList = (arr) => arr.map(() => '?').join(',') || 'NULL';
const ratio = (a, b) => (b > 0 ? a / b : null);

/**
 * 要件定義書 3章のKPIを定義どおりに集計する。
 * @param {{from?:string,to?:string,schoolId?:number,today?:string}} opts JSTの日付
 */
export async function computeKpis(opts = {}) {
  const st = getSettings();
  const today = opts.today || jstDate();
  const from = opts.from || st.poc_start;
  const to = opts.to || minDate(st.poc_end, today);
  const [fromUtc, toUtc] = jstRangeToUtc(from, to);
  const schoolId = opts.schoolId ? Number(opts.schoolId) : null;
  const schoolFilter = schoolId ? ' AND u.school_id = ' + schoolId : '';
  const T = st.kpi_targets;

  const students = q.all(`SELECT u.id, u.school_id FROM users u WHERE u.role='student' AND u.active=1${schoolFilter}`);
  const studentIds = students.map((s) => s.id);
  const nStudents = students.length;

  const submissions = studentIds.length
    ? q.all(`SELECT user_id, submitted_at FROM records WHERE status='submitted' AND submitted_at >= ? AND submitted_at < ? AND user_id IN (${inList(studentIds)})`, fromUtc, toUtc, ...studentIds)
    : [];
  const subs = submissions.map((r) => ({ user: r.user_id, date: jstDate(r.submitted_at) }));

  // K-S1 協力校数：終了日までにテーマ配信開始または提出があった学校の累計。
  const schoolsStarted = q.all(`
    SELECT DISTINCT s.id FROM schools s WHERE ${schoolId ? 's.id=' + schoolId + ' AND ' : ''}(
      EXISTS (SELECT 1 FROM distributions d JOIN classes c ON c.id=d.class_id WHERE c.school_id=s.id AND d.start_date <= ?)
      OR EXISTS (SELECT 1 FROM records r WHERE r.school_id=s.id AND r.status='submitted' AND r.submitted_at < ?))`,
    to, toUtc).length;

  // K-S2 生徒アクティブ率：週ごとの「週1回以上提出した生徒/対象生徒」の平均（除外期間の週は除く）
  const weeks = [];
  const lastDay = minDate(to, today);
  const firstDay = maxDate(from, st.poc_start);
  for (let w = mondayOf(firstDay); w <= lastDay; w = addDays(w, 7)) {
    const wEnd = addDays(w, 6);
    const excluded = (st.excluded_periods || []).some((p) => w >= p.from && w <= p.to);
    const active = new Set(subs.filter((x) => x.date >= w && x.date <= wEnd).map((x) => x.user)).size;
    weeks.push({ week: w, active, rate: ratio(active, nStudents), excluded, partial: w < firstDay || wEnd > lastDay });
  }
  // 進行中の週は途中値のため平均から除く（進行中の週しかない場合のみ含める）
  const fullWeeks = weeks.filter((w) => !w.excluded && w.rate !== null && !w.partial);
  const countedWeeks = fullWeeks.length ? fullWeeks : weeks.filter((w) => !w.excluded && w.rate !== null);
  const ks2 = countedWeeks.length ? countedWeeks.reduce((a, w) => a + w.rate, 0) / countedWeeks.length : null;

  // K-S3の基準コホートは学校ごとの開始2週間に固定する。
  // 画面で集計開始日を絞っても、基準コホートまで消してはならない。
  const schoolStarts = new Map(q.all('SELECT id, start_date FROM schools').map((s) => [s.id, s.start_date || st.poc_start]));
  const endRef = minDate(st.poc_end, to, today);
  const lastWindowStart = addDays(endRef, -13);
  const userSchool = new Map(students.map((s) => [s.id, s.school_id]));
  const cohort = new Set();
  const lastActive = new Set();
  const retentionFrom = minDate(lastWindowStart, ...students.map((s) => schoolStarts.get(s.school_id)));
  const [retentionFromUtc, retentionToUtc] = jstRangeToUtc(retentionFrom, endRef);
  const retentionSubmissions = studentIds.length ? q.all(`SELECT user_id, submitted_at FROM records WHERE status='submitted' AND submitted_at >= ? AND submitted_at < ? AND user_id IN (${inList(studentIds)})`, retentionFromUtc, retentionToUtc, ...studentIds) : [];
  for (const r of retentionSubmissions) {
    const x = { user: r.user_id, date: jstDate(r.submitted_at) };
    const start = schoolStarts.get(userSchool.get(x.user));
    if (x.date >= start && x.date <= addDays(start, 13)) cohort.add(x.user);
    if (x.date >= lastWindowStart && x.date <= endRef) lastActive.add(x.user);
  }
  const retained = [...cohort].filter((u) => lastActive.has(u)).length;
  const ks3Provisional = endRef < st.poc_end;

  // K-S4/K-S5 授業後アンケート（テーマ配信ごとに1回答を期待）
  const dists = q.all(`SELECT d.id FROM distributions d JOIN classes c ON c.id=d.class_id WHERE d.start_date >= ? AND d.start_date <= ?${schoolId ? ' AND c.school_id=' + schoolId : ''}`, from, to);
  const distIds = dists.map((d) => d.id);
  const lessonResp = distIds.length
    ? q.all(`SELECT sr.distribution_id, sr.answers FROM survey_responses sr JOIN surveys sv ON sv.id=sr.survey_id WHERE sv.kind='lesson' AND sr.created_at >= ? AND sr.created_at < ? AND sr.distribution_id IN (${inList(distIds)})`, fromUtc, toUtc, ...distIds)
    : [];
  const answeredDists = new Set(lessonResp.map((r) => r.distribution_id)).size;
  const easeVals = lessonResp.map((r) => Number(parseJson(r.answers, {}).ease)).filter((n) => n >= 1 && n <= 5);

  // K-S6 生徒アンケート
  const studentResp = studentIds.length
    ? q.all(`SELECT sr.user_id, sr.answers FROM survey_responses sr JOIN surveys sv ON sv.id=sr.survey_id WHERE sv.kind='student' AND sr.created_at >= ? AND sr.created_at < ? AND sr.user_id IN (${inList(studentIds)})`, fromUtc, toUtc, ...studentIds)
    : [];
  const respondedStudents = new Set(studentResp.map((r) => r.user_id)).size;
  const overallVals = studentResp.map((r) => Number(parseJson(r.answers, {}).overall)).filter((n) => n >= 1 && n <= 5);

  // K-C1/K-C2は新規公開数ではなく、終了日までに公開した現在公開中の累計。
  // 公開状態の履歴は保持していないため、過去時点の状態復元は行わない。
  // 学校フィルタ時は、終了日までにその学校へ配信開始したテーマを対象にする。
  const themeScope = schoolId
    ? `AND t.id IN (SELECT d.theme_id FROM distributions d JOIN classes c ON c.id=d.class_id WHERE c.school_id=? AND d.start_date <= ?)`
    : '';
  const publishedThemes = q.all(`SELECT t.id, t.company_id, t.title FROM themes t WHERE t.status='published' AND COALESCE(t.published_at, t.created_at) < ? ${themeScope}`, toUtc, ...(schoolId ? [schoolId, to] : []));
  const participatingCompanies = new Set(publishedThemes.map((t) => t.company_id));

  // K-C3: 閲覧履歴は初回のみを保持するため、期間内の初回閲覧コホートを使う。
  // 分子も同じ生徒×テーマ集合に限定し、期間外の選択・将来の閲覧を混入させない。
  const viewCohort = studentIds.length ? q.all(`SELECT v.theme_id, v.user_id,
      EXISTS (SELECT 1 FROM theme_interests ti WHERE ti.theme_id=v.theme_id AND ti.user_id=v.user_id AND ti.created_at >= ? AND ti.created_at < ?) AS interested
    FROM theme_views v WHERE v.user_id IN (${inList(studentIds)}) AND v.first_viewed_at >= ? AND v.first_viewed_at < ?`, fromUtc, toUtc, ...studentIds, fromUtc, toUtc) : [];
  const viewers = viewCohort.length;
  const interested = viewCohort.filter((v) => v.interested).length;

  // K-C4 継続参加意向（分母は参加企業。未回答は「継続したい」に数えない＝保守的）
  const contResp = q.all(`SELECT u.company_id, sr.answers FROM survey_responses sr JOIN surveys sv ON sv.id=sr.survey_id JOIN users u ON u.id=sr.user_id WHERE sv.kind='continuation' AND u.company_id IS NOT NULL AND sr.created_at >= ? AND sr.created_at < ? ORDER BY sr.created_at, sr.id`, fromUtc, toUtc);
  const latestCompanyAnswers = new Map(contResp.filter((r) => participatingCompanies.has(r.company_id)).map((r) => [r.company_id, parseJson(r.answers, {}).continue]));
  const yesCompanies = [...latestCompanyAnswers.values()].filter((answer) => answer === 'yes').length;

  // K-X1 テーマ記録件数
  const themeCounts = publishedThemes.map((t) => ({
    theme_id: t.id, title: t.title,
    count: studentIds.length ? q.one(`SELECT COUNT(*) c FROM records WHERE status='submitted' AND type='theme' AND theme_id=? AND submitted_at >= ? AND submitted_at < ? AND user_id IN (${inList(studentIds)})`, t.id, fromUtc, toUtc, ...studentIds).c : 0,
  }));
  const avgPerTheme = themeCounts.length ? themeCounts.reduce((a, t) => a + t.count, 0) / themeCounts.length : null;
  const minimumPerTheme = themeCounts.length ? Math.min(...themeCounts.map((t) => t.count)) : null;
  const themesMeeting = themeCounts.filter((t) => t.count >= T['K-X1']).length;

  // K-X2 データ連携充足率
  const fill = linkFillRate(await buildExportDataset({ from, to, schoolId, withAiSummary: false }));

  const k = (id, group, name, value, target, fmt, extra = {}) => ({
    id, group, name, value, target, format: fmt,
    achieved: value === null || target === null ? null : value >= target, ...extra,
  });

  return {
    period: { from, to, today, schoolId },
    students: nStudents,
    weeks,
    kpis: [
      k('K-S1', '学校側', '協力校数', schoolsStarted, T['K-S1'], 'count', { note: '終了日までにテーマ配信開始または記録提出がある学校の累計（開始日で絞らない）' }),
      k('K-S2', '学校側', '生徒アクティブ率（週平均）', ks2, T['K-S2'], 'pct', { note: `集計週 ${countedWeeks.length}週（週開始日が除外期間内 ${weeks.filter((w) => w.excluded).length}週）${!fullWeeks.length && countedWeeks.length ? '。完全な週がないため途中週の暫定値' : '。期間端の途中週は平均から除外'}` }),
      k('K-S3', '学校側', '継続利用率', ratio(retained, cohort.size), T['K-S3'], 'pct', { note: `学校ごとの開始2週（開始日フィルタ対象外）の提出者 ${cohort.size}名中、${lastWindowStart}〜${endRef}も提出 ${retained}名${ks3Provisional ? '（終了日前の暫定値）' : ''}` }),
      k('K-S4', '学校側', '授業後アンケート回収率', ratio(answeredDists, distIds.length), T['K-S4'], 'pct', { note: `期間内開始の配信授業 ${distIds.length}件中、期間内回答済み ${answeredDists}件（回答総数 ${lessonResp.length}件）` }),
      k('K-S5', '学校側', '授業のしやすさ（平均）', easeVals.length ? easeVals.reduce((a, b) => a + b, 0) / easeVals.length : null, T['K-S5'], 'score', { note: `期間内開始の配信授業への期間内回答 ${easeVals.length}件` }),
      k('K-S6', '学校側', '生徒アンケート回答率', ratio(respondedStudents, nStudents), T['K-S6_rate'], 'pct', {
        achieved: nStudents && overallVals.length ? respondedStudents / nStudents >= T['K-S6_rate'] && overallVals.reduce((a, b) => a + b, 0) / overallVals.length >= T['K-S6_avg'] : null,
        note: `平均評価 ${overallVals.length ? (overallVals.reduce((a, b) => a + b, 0) / overallVals.length).toFixed(2) : '—'}（目標${T['K-S6_avg']}）`,
        sub: { avg: overallVals.length ? overallVals.reduce((a, b) => a + b, 0) / overallVals.length : null, targetAvg: T['K-S6_avg'] },
      }),
      k('K-C1', '企業側', '賛同企業数', participatingCompanies.size, T['K-C1'], 'count', { note: `終了日までに公開した現在公開中のテーマの提供企業数（開始日で絞らない）${schoolId ? '。選択校へ終了日までに配信開始したテーマが対象' : ''}` }),
      k('K-C2', '企業側', '提供テーマ数', publishedThemes.length, T['K-C2'], 'count', { note: '終了日までに公開した現在公開中のテーマ累計（開始日で絞らない）。過去の公開状態は復元しません' }),
      k('K-C3', '企業側', '生徒の関心反応率', ratio(interested, viewers), T['K-C3'], 'pct', { note: `期間内に初回閲覧した ${viewers}組のうち、期間内に関心選択 ${interested}組（生徒×テーマ）。再閲覧は対象外` }),
      k('K-C4', '企業側', '継続参加意向', ratio(yesCompanies, participatingCompanies.size), T['K-C4'], 'pct', { note: `各社の期間内最終回答：継続したい ${yesCompanies}社／参加 ${participatingCompanies.size}社（回答 ${latestCompanyAnswers.size}社、未回答は分子に含めない）` }),
      k('K-X1', '共通', 'テーマ記録件数（テーマ別の最少件数）', minimumPerTheme, T['K-X1'], 'count', { achieved: themeCounts.length ? themesMeeting === themeCounts.length : null, note: `全テーマが${T['K-X1']}件以上で達成。目標到達 ${themesMeeting}／${themeCounts.length}テーマ（平均 ${avgPerTheme === null ? '—' : avgPerTheme.toFixed(1)}件）。記録は選択期間内`, detail: themeCounts, average: avgPerTheme }),
      k('K-X2', '共通', 'データ連携充足率', fill.rate, T['K-X2'], 'pct', { note: '選択期間・学校の提出記録で、必須項目を1件以上出力できる割合。mirAI側の取込成功を示す値ではありません', detail: fill.detail }),
    ],
  };
}
