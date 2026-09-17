import { Router } from 'express';
import { q, parseJson, nowIso, tx } from '../db.js';
import { requireRole, teacherCanSeeClass, teacherClassIds } from '../auth.js';
import {
  curriculumDto,
  generateCurriculum,
  insertCurriculum,
  publishCurriculum,
} from '../curriculum.js';
import { normalizeTags, INTEREST_TAGS } from '../lib/taxonomy.js';
import { jstDate, addDays } from '../lib/time.js';
import { logEvent, audit } from '../lib/log.js';
import { queueRecordAnalysis } from '../jobs.js';
import { getSettings } from '../settings.js';
const r = Router();
r.use(requireRole('company', 'teacher', 'student', 'admin'));
const fail = (res, text, status = 400) => res.status(status).json({ error: text });
const str = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const owned = (u, c) =>
  c &&
  (u.role === 'company'
    ? !c.teacher_id && c.company_id === u.company_id
    : u.role === 'teacher' && c.teacher_id === u.id);
const getC = (id) => q.one('SELECT * FROM curricula WHERE id=?', Number(id));
const lessonDto = (l, role = 'teacher') => {
  const c = parseJson(l.snapshot, {});
  const content = role === 'student' ? {
    title: c.title,
    companyName: c.companyName,
    companyIndustry: c.companyIndustry || q.one('SELECT industry FROM companies WHERE id=?', c.companyId)?.industry || null,
    audience: c.audience,
    subject: c.subject,
    duration: c.duration,
    objectives: c.objectives,
    assessment: c.assessment,
    stages: (c.stages || []).map(({ title, minutes, activity }) => ({ title, minutes, activity })),
  } : c;
  const cl = q.one(
    'SELECT c.*,s.name school FROM classes c JOIN schools s ON s.id=c.school_id WHERE c.id=?',
    l.class_id,
  );
  return {
    ...content,
    id: l.id,
    curriculumId: l.curriculum_id,
    classId: l.class_id,
    className: `${cl.grade}年${cl.name}組`,
    schoolName: cl.school,
    ...(role === 'student' ? {} : { teacherId: l.teacher_id }),
    status: l.status,
    stageIndex: l.stage_index,
    scheduledAt: l.scheduled_at,
    startedAt: l.started_at,
    completedAt: l.completed_at,
    responseCount: q.one('SELECT COUNT(*) n FROM lesson_responses WHERE lesson_id=?', l.id).n,
    studentCount: q.one(
      "SELECT COUNT(*) n FROM users WHERE class_id=? AND role='student' AND active=1",
      l.class_id,
    ).n,
  };
};
const canLesson = (u, l) =>
  l &&
  (u.role === 'teacher'
    ? teacherCanSeeClass(u, l.class_id)
    : u.role === 'student' && u.class_id === l.class_id);
const responseDto = (x) =>
  x
    ? {
        before: x.before_score,
        after: x.after_score,
        delta: x.after_score - x.before_score,
        learning: x.learning,
        nextAction: x.next_action,
        interests: parseJson(x.interests, []),
        submittedAt: x.submitted_at,
      }
    : null;
const baselineFor = (lessonId, userId) => {
  const baseline = q.one('SELECT before_score,submitted_at FROM lesson_baselines WHERE lesson_id=? AND user_id=?', lessonId, userId);
  if (baseline) return { before: baseline.before_score, submittedAt: baseline.submitted_at, source: 'baseline' };
  // Preserve old records, but never label their retrospective rating as a true pre-measurement.
  const legacy = q.one('SELECT before_score,submitted_at FROM lesson_responses WHERE lesson_id=? AND user_id=?', lessonId, userId);
  return legacy ? { before: legacy.before_score, submittedAt: legacy.submitted_at, source: 'legacy_response' } : null;
};
const measurementNote =
  '理解度は生徒による1〜5段階の自己評価です。能力・成績や介入の因果効果を表すものではありません。';
r.get('/curricula', requireRole('company', 'teacher'), (req, res) => {
  const rows =
    req.user.role === 'company'
      ? q.all(
          'SELECT * FROM curricula WHERE company_id=? AND teacher_id IS NULL ORDER BY id DESC',
          req.user.company_id,
        )
      : q.all(
          "SELECT * FROM curricula WHERE (teacher_id IS NULL AND status='published') OR teacher_id=? ORDER BY id DESC",
          req.user.id,
        );
  res.json({ curricula: rows.map(curriculumDto) });
});
r.post('/curricula/generate', requireRole('company'), (req, res) => {
  const b = req.body || {};
  if (
    !str(b.title, 1, 200) ||
    !str(b.sourceContent, 30, 20000) ||
    !str(b.audience, 1, 100) ||
    !str(b.subject, 1, 100) ||
    ![50, 100].includes(b.duration)
  )
    return fail(res, 'タイトル・30文字以上の内容・対象・教科・授業時間を確認してください');
  const c = insertCurriculum(generateCurriculum(b), req.user.company_id);
  logEvent(req.user, 'curriculum_generate', 'curriculum', c.id, { provider: 'template' });
  res.status(201).json({ curriculum: c });
});
r.put('/curricula/:id', requireRole('company', 'teacher'), (req, res) => {
  const c = getC(req.params.id);
  if (!owned(req.user, c)) return fail(res, '教材を編集する権限がありません', 403);
  const b = req.body || {};
  if (
    !str(b.title, 1, 200) ||
    !str(b.audience, 1, 100) ||
    !str(b.subject, 1, 100) ||
    !str(b.assessment, 1, 5000) ||
    !Array.isArray(b.objectives) ||
    !b.objectives.length ||
    b.objectives.length > 10 ||
    !b.objectives.every((x) => str(x, 1, 1000)) ||
    !Array.isArray(b.stages) ||
    b.stages.length < 2 ||
    b.stages.length > 10 ||
    !b.stages.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        !Array.isArray(s) &&
        str(s.title, 1, 200) &&
        str(s.activity, 1, 5000) &&
        str(s.teacherNote || '', 0, 3000) &&
        Number.isInteger(s.minutes) &&
        s.minutes > 0,
    ) ||
    b.stages.reduce((n, s) => n + s.minutes, 0) !== c.duration
  )
    return fail(res, '入力内容と活動時間の合計を確認してください');
  q.run(
    "UPDATE curricula SET title=?,audience=?,subject=?,objectives=?,stages=?,assessment=?,status='draft',updated_at=? WHERE id=?",
    b.title,
    b.audience,
    b.subject,
    JSON.stringify(b.objectives),
    JSON.stringify(b.stages),
    b.assessment,
    nowIso(),
    c.id,
  );
  audit(req, 'curriculum_edit', { curriculumId: c.id });
  res.json({ curriculum: curriculumDto(getC(c.id)) });
});
r.post('/curricula/:id/publish', requireRole('company'), (req, res) => {
  const c = getC(req.params.id);
  if (!owned(req.user, c)) return fail(res, '自社の教材ではありません', 403);
  const curriculum = tx(() => publishCurriculum(c.id));
  audit(req, 'curriculum_publish', { curriculumId: c.id });
  res.json({ curriculum });
});
r.post('/curricula/:id/adopt', requireRole('teacher'), (req, res) => {
  const c = getC(req.params.id);
  if (!c || c.teacher_id || c.status !== 'published')
    return fail(res, '提供中の教材を選択してください', 404);
  const old = q.one(
    'SELECT * FROM curricula WHERE source_id=? AND teacher_id=?',
    c.id,
    req.user.id,
  );
  const curriculum = old
    ? curriculumDto(old)
    : insertCurriculum(curriculumDto(c), c.company_id, {
        sourceId: c.id,
        themeId: c.theme_id,
        teacherId: req.user.id,
        schoolId: req.user.school_id,
      });
  audit(req, 'curriculum_adopt', { curriculumId: curriculum.id });
  res.json({ curriculum });
});
r.post('/curricula/:id/approve', requireRole('teacher'), (req, res) => {
  const c = getC(req.params.id);
  if (!owned(req.user, c)) return fail(res, '自分が採用した教材ではありません', 403);
  q.run("UPDATE curricula SET status='approved',updated_at=? WHERE id=?", nowIso(), c.id);
  audit(req, 'curriculum_approve', { curriculumId: c.id });
  res.json({ curriculum: curriculumDto(getC(c.id)) });
});
r.get('/lessons', requireRole('teacher', 'student'), (req, res) => {
  const ids = req.user.role === 'teacher' ? teacherClassIds(req.user) : [req.user.class_id];
  const lessons = ids.length
    ? q
        .all(
          `SELECT * FROM lessons WHERE class_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC`,
          ...ids,
        )
        .map((l) => lessonDto(l, req.user.role))
    : [];
  res.json({ lessons });
});
r.post('/lessons', requireRole('teacher'), (req, res) => {
  const b = req.body || {},
    c = getC(b.curriculumId);
  if (!owned(req.user, c) || c.status !== 'approved')
    return fail(res, '自分が最終承認した教材を選択してください', 403);
  if (!teacherCanSeeClass(req.user, b.classId)) return fail(res, '担当クラスではありません', 403);
  if (b.scheduledAt && !Number.isFinite(Date.parse(b.scheduledAt)))
    return fail(res, '授業日時が正しくありません');
  const id = tx(() => {
    const id = Number(
      q.run(
        'INSERT INTO lessons(curriculum_id,class_id,teacher_id,snapshot,scheduled_at) VALUES(?,?,?,?,?)',
        c.id,
        Number(b.classId),
        req.user.id,
        JSON.stringify(curriculumDto(c)),
        b.scheduledAt || null,
      ).lastInsertRowid,
    );
    if (c.theme_id) {
      const date = b.scheduledAt ? jstDate(b.scheduledAt) : jstDate();
      q.run(
        'INSERT INTO distributions(theme_id,class_id,teacher_id,start_date,end_date) VALUES(?,?,?,?,?)',
        c.theme_id,
        Number(b.classId),
        req.user.id,
        date,
        addDays(date, 30),
      );
    }
    return id;
  });
  audit(req, 'lesson_create', { lessonId: id });
  res.status(201).json({ lesson: lessonDto(q.one('SELECT * FROM lessons WHERE id=?', id)) });
});
r.get('/lessons/:id', requireRole('teacher', 'student'), (req, res) => {
  const l = q.one('SELECT * FROM lessons WHERE id=?', Number(req.params.id));
  if (!canLesson(req.user, l)) return fail(res, '授業を閲覧する権限がありません', 403);
  res.json({
    lesson: lessonDto(l, req.user.role),
    baseline: req.user.role === 'student' ? baselineFor(l.id, req.user.id) : null,
    response:
      req.user.role === 'student'
        ? responseDto(
            q.one(
              'SELECT * FROM lesson_responses WHERE lesson_id=? AND user_id=?',
              l.id,
              req.user.id,
            ),
          )
        : null,
  });
});
r.put('/lessons/:id/baseline', requireRole('student'), (req, res) => {
  const l = q.one('SELECT * FROM lessons WHERE id=?', Number(req.params.id));
  if (!canLesson(req.user, l)) return fail(res, '自分のクラスの授業ではありません', 403);
  const before = req.body?.before;
  if (!Number.isInteger(before) || before < 1 || before > 5) return fail(res, '授業前の理解度を1〜5から選んでください');
  const existing = baselineFor(l.id, req.user.id);
  if (existing) {
    if (existing.before === before) return res.json({ baseline: existing });
    return fail(res, '保存済みの授業前の理解度は変更できません', 409);
  }
  if (l.status === 'completed' || (l.status === 'active' && l.stage_index > 0))
    return fail(res, '授業前の理解度は、授業開始前か最初の活動中に保存してください', 409);
  q.run('INSERT INTO lesson_baselines(lesson_id,user_id,before_score,submitted_at) VALUES(?,?,?,?)', l.id, req.user.id, before, nowIso());
  logEvent(req.user, 'lesson_baseline', 'lesson', l.id);
  res.json({ baseline: baselineFor(l.id, req.user.id) });
});
r.post('/lessons/:id/progress', requireRole('teacher'), (req, res) => {
  const l = q.one('SELECT * FROM lessons WHERE id=?', Number(req.params.id));
  if (!canLesson(req.user, l)) return fail(res, '担当クラスではありません', 403);
  const a = req.body?.action;
  const count = parseJson(l.snapshot, {}).stages.length;
  if (a === 'start' && l.status === 'planned')
    q.run("UPDATE lessons SET status='active',started_at=? WHERE id=?", nowIso(), l.id);
  else if (a === 'next' && l.status === 'active' && l.stage_index < count - 1)
    q.run('UPDATE lessons SET stage_index=stage_index+1 WHERE id=?', l.id);
  else if (a === 'complete' && l.status === 'active' && l.stage_index === count - 1)
    q.run("UPDATE lessons SET status='completed',completed_at=? WHERE id=?", nowIso(), l.id);
  else return fail(res, '現在の授業段階ではこの操作はできません', 409);
  logEvent(req.user, 'lesson_progress', 'lesson', l.id, { action: a });
  res.json({ lesson: lessonDto(q.one('SELECT * FROM lessons WHERE id=?', l.id)) });
});
r.put('/lessons/:id/response', requireRole('student'), (req, res) => {
  const l = q.one('SELECT * FROM lessons WHERE id=?', Number(req.params.id));
  if (!canLesson(req.user, l)) return fail(res, '自分のクラスの授業ではありません', 403);
  if (l.status !== 'completed') return fail(res, '先生が授業を終了してから振り返りを提出してください', 409);
  const baseline = baselineFor(l.id, req.user.id);
  if (!baseline) return fail(res, '授業前の理解度が保存されていません。この授業の前後比較には参加できません。手帳記録から学びを残してください', 409);
  const b = req.body || {};
  if (
    !Number.isInteger(b.after) || b.after < 1 || b.after > 5 ||
    (b.before !== undefined && b.before !== baseline.before) ||
    !str(b.learning, 1, 3000) ||
    !str(b.nextAction, 1, 1000) ||
    !Array.isArray(b.interests) ||
    b.interests.some((t) => !INTEREST_TAGS.includes(t)) ||
    b.interests.length > 3
  )
    return fail(res, '理解度・学び・次の行動・関心分野を確認してください');
  const tags = JSON.stringify(normalizeTags(b.interests)),
    at = nowIso(),
    snap = parseJson(l.snapshot, {});
  const recordId = tx(() => {
    const old = q.one(
      'SELECT * FROM lesson_responses WHERE lesson_id=? AND user_id=?',
      l.id,
      req.user.id,
    );
    const text = `${b.learning}\n次の行動：${b.nextAction}`;
    let recordId = old?.record_id;
    if (recordId)
      q.run(
        'UPDATE records SET final_text=?,tags=?,summary=? WHERE id=?',
        text,
        tags,
        b.learning.slice(0, 300),
        recordId,
      );
    else
      recordId = Number(
        q.run(
          "INSERT INTO records(user_id,school_id,class_id,type,theme_id,ocr_status,final_text,status,ai_status,tags,summary,submitted_at) VALUES(?,?,?,'theme',?,'none',?,'submitted','pending',?,?,?)",
          req.user.id,
          req.user.school_id,
          req.user.class_id,
          snap.themeId,
          text,
          tags,
          b.learning.slice(0, 300),
          at,
        ).lastInsertRowid,
      );
    q.run(
      'INSERT INTO lesson_responses(lesson_id,user_id,record_id,before_score,after_score,learning,next_action,interests,submitted_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(lesson_id,user_id) DO UPDATE SET record_id=excluded.record_id,before_score=excluded.before_score,after_score=excluded.after_score,learning=excluded.learning,next_action=excluded.next_action,interests=excluded.interests,submitted_at=excluded.submitted_at',
      l.id,
      req.user.id,
      recordId,
      baseline.before,
      b.after,
      b.learning,
      b.nextAction,
      tags,
      at,
    );
    return recordId;
  });
  queueRecordAnalysis(recordId, { preserveTags: true });
  logEvent(req.user, 'lesson_reflection', 'lesson', l.id);
  res.json({ ok: true });
});
r.get('/lessons/:id/results', requireRole('teacher'), (req, res) => {
  const l = q.one('SELECT * FROM lessons WHERE id=?', Number(req.params.id));
  if (!canLesson(req.user, l)) return fail(res, '担当クラスではありません', 403);
  const responses = q
    .all(
      'SELECT r.*,u.pseudo_id,u.attendance_no FROM lesson_responses r JOIN users u ON u.id=r.user_id WHERE r.lesson_id=? ORDER BY u.attendance_no',
      l.id,
    )
    .map((x) => ({
      ...responseDto(x),
      studentId: x.user_id,
      pseudoId: x.pseudo_id,
      attendanceNo: x.attendance_no,
    }));
  const n = responses.length,
    studentCount = lessonDto(l).studentCount,
    before = n ? responses.reduce((s, x) => s + x.before, 0) / n : null,
    after = n ? responses.reduce((s, x) => s + x.after, 0) / n : null;
  res.json({
    summary: {
      responseCount: n,
      studentCount,
      responseRate: studentCount ? n / studentCount : null,
      beforeAverage: before,
      afterAverage: after,
      delta: n ? after - before : null,
      measurementNote,
    },
    responses,
  });
});
r.get('/company-report', requireRole('company'), (req, res) => {
  const minimumStudents = getSettings().school_min_cell;
  const curricula = q
    .all('SELECT * FROM curricula WHERE company_id=? AND teacher_id IS NULL', req.user.company_id)
    .map((c) => {
      const ids = q.all('SELECT id FROM curricula WHERE source_id=?', c.id).map((x) => x.id);
      const lessons = ids.length
        ? q.all(
            `SELECT * FROM lessons WHERE curriculum_id IN (${ids.map(() => '?').join(',')})`,
            ...ids,
          )
        : [];
      const lid = lessons.map((x) => x.id);
      const rows = lid.length
        ? q.all(
            `SELECT user_id,before_score,after_score FROM lesson_responses WHERE lesson_id IN (${lid.map(() => '?').join(',')})`,
            ...lid,
          )
        : [];
      const n = rows.length,
        suppressed = new Set(rows.map((x) => x.user_id)).size < minimumStudents;
      const before = n && !suppressed ? rows.reduce((s, x) => s + x.before_score, 0) / n : null,
        after = n && !suppressed ? rows.reduce((s, x) => s + x.after_score, 0) / n : null;
      return {
        curriculumId: c.id,
        title: c.title,
        adoptionCount: ids.length,
        lessonCount: lessons.length,
        completedLessons: lessons.filter((x) => x.status === 'completed').length,
        responseCount: suppressed ? null : n,
        suppressed,
        beforeAverage: before,
        afterAverage: after,
        delta: suppressed ? null : after - before,
      };
    });
  res.json({ curricula, minimumStudents, note: measurementNote + ` ${minimumStudents}人未満の回答集計は非表示です。` });
});
r.get('/career', requireRole('student'), (req, res) => {
  const records = q.all(
    "SELECT r.id,r.final_text,r.tags,r.summary,r.submitted_at,r.type,t.id theme_id,t.title,t.company_id,t.field,co.industry company_industry FROM records r LEFT JOIN themes t ON t.id=r.theme_id LEFT JOIN companies co ON co.id=t.company_id WHERE r.user_id=? AND r.status='submitted' ORDER BY r.submitted_at DESC",
    req.user.id,
  );
  const tags = {};
  for (const rec of records) for (const t of parseJson(rec.tags, [])) tags[t] = (tags[t] || 0) + 1;
  const experiences = q
    .all(
      'SELECT r.*,l.snapshot FROM lesson_responses r JOIN lessons l ON l.id=r.lesson_id WHERE r.user_id=? ORDER BY r.submitted_at DESC',
      req.user.id,
    )
    .map((x) => ({
      ...responseDto(x),
      lessonId: x.lesson_id,
      title: parseJson(x.snapshot, {}).title,
    }));
  const school = q.one('SELECT code FROM schools WHERE id=?', req.user.school_id);
  const cl = q.one('SELECT * FROM classes WHERE id=?', req.user.class_id);
  const payload = {
    schemaVersion: 'mirai-next-career-preview/1.1',
    pseudoId: req.user.pseudo_id,
    schoolCode: school.code,
    gradeClass: `${cl.grade}年${cl.name}組`,
    interestTags: Object.keys(tags),
    records: records.map((x) => ({
      recordDate: jstDate(x.submitted_at),
      recordType: x.type,
      recordText: x.final_text,
      interestTags: parseJson(x.tags, []),
      themeId: x.theme_id || null,
      themeTitle: x.title || null,
      companyId: x.company_id || null,
      companyIndustry: x.company_industry || null,
      subject: x.field || null,
      recordSummary: x.summary || '',
    })),
    periodSummary: records.map((x) => x.summary).filter(Boolean).join(' / '),
  };
  res.json({
    profile: {
      pseudoId: req.user.pseudo_id,
      recordCount: records.length,
      interests: Object.entries(tags)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count })),
      nextActions: experiences.map((x) => x.nextAction).slice(0, 3),
    },
    experiences,
    sharing: {
      status: 'preview',
      connected: false,
      lastSyncedAt: null,
      fields: [
        '仮名ID',
        '学校コード・学年・クラス',
        '本人が確認した記録テキスト',
        '記録日・種類',
        '関心タグ',
        '探究テーマ・企業ID・企業の業種分野',
        '振り返り要約',
      ],
      excluded: ['撮影画像', '要確認フラグ', '利用ログ', '氏名', 'アンケート回答・自由記述'],
      note: '副担任mirAIへの共有予定データです。接続先の取込仕様確定前のため、外部送信・取込確認は行っていません。このプレビューの期間要約は記録要約の連結です。正式出力時に期間要約を作成します。',
      payload,
    },
  });
});
export default r;
