import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrap, client } from './helpers.js';

let env, company, otherCompany, teacher, otherTeacher, student, otherStudent;
let original, adopted, lesson, classId, otherClassId;
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const source = {
  title: 'ロボットと人が協力する工場', sourceContent: '架空の工場で、人の観察力とロボットの繰り返し作業を組み合わせます。費用、安全性、働く人の学びを考えて改善案を比べてください。',
  audience: '高校2年生', subject: 'ものづくり・工学', duration: 50,
};
const answer = { before: 2, after: 4, learning: '人の判断と機械の繰り返し作業の違いに気づいた。', nextAction: '身近な作業を観察する。', interests: ['ものづくり・工学'] };

before(async () => {
  env = await bootstrap();
  const { importUsers } = await import('../server/lib/users.js');
  const rows = [
    { role: 'teacher', login_id: 't-a', school_code: 'DEMO-A', school_name: 'テスト第一高校', teacher_classes: '2-A', display_name: '担当A' },
    { role: 'teacher', login_id: 't-b', school_code: 'DEMO-B', school_name: 'テスト第二高校', teacher_classes: '2-B', display_name: '担当B' },
    ...Array.from({ length: 8 }, (_, i) => ({ role: 'student', login_id: `s-aa-${String(i + 1).padStart(2, '0')}`, school_code: 'DEMO-A', grade: '2', class: 'A', attendance_no: String(i + 1) })),
    { role: 'student', login_id: 's-bb-01', school_code: 'DEMO-B', grade: '2', class: 'B', attendance_no: '1' },
    ...Array.from({ length: 5 }, (_, i) => ({ role: 'company', login_id: `c-0${i + 1}`, company_code: `CO-0${i + 1}`, company_name: `架空企業${i + 1}`, company_industry: 'ものづくり・工学' })),
  ].map((row, i) => ({ __line: i + 2, password: 'test-pass-123', ...row }));
  assert.deepEqual(importUsers(rows).errors, []);
  env.q.run('UPDATE users SET must_change_password=0');
  const { saveSettings } = await import('../server/settings.js');
  saveSettings({ poc_start: shift(today, -30), poc_end: shift(today, 60), excluded_periods: [] });
  const login = async id => { const c = client(env.base); assert.equal((await c.login(id, 'test-pass-123')).status, 200); return c; };
  company = await login('c-01'); otherCompany = await login('c-02');
  teacher = await login('t-a'); otherTeacher = await login('t-b');
  student = await login('s-aa-01'); otherStudent = await login('s-bb-01');
  classId = env.q.one("SELECT id FROM classes WHERE name='A'").id;
  otherClassId = env.q.one("SELECT id FROM classes WHERE name='B'").id;
});

after(async () => {
  if (!env) return;
  await new Promise(resolve => env.server.close(resolve));
  fs.rmSync(env.dir, { recursive: true, force: true });
});

test('企業教材：入力検証、企業別分離、公開テーマ同期', async () => {
  assert.equal((await client(env.base).get('/api/learning/curricula')).status, 401);
  assert.equal((await student.post('/api/learning/curricula/generate', source)).status, 403);
  for (const invalid of [{ ...source, sourceContent: '短い' }, { ...source, duration: 60 }, { ...source, title: '' }]) {
    assert.equal((await company.post('/api/learning/curricula/generate', invalid)).status, 400);
  }
  const created = await company.post('/api/learning/curricula/generate', source);
  assert.equal(created.status, 201);
  original = created.data.curriculum;
  assert.equal(original.generatedBy, 'template');
  assert.equal(original.status, 'draft');
  assert.equal(original.stages.reduce((n, s) => n + s.minutes, 0), 50);
  assert.ok(original.stages.some(s => s.activity.includes(source.sourceContent)));
  assert.equal((await teacher.get('/api/learning/curricula')).data.curricula.length, 0);
  assert.equal((await otherCompany.get('/api/learning/curricula')).data.curricula.length, 0);
  assert.equal((await otherCompany.post(`/api/learning/curricula/${original.id}/publish`, {})).status, 403);
  assert.equal((await teacher.post(`/api/learning/curricula/${original.id}/adopt`, {})).status, 404);
  const published = await company.post(`/api/learning/curricula/${original.id}/publish`, {});
  assert.equal(published.status, 200);
  original = published.data.curriculum;
  assert.equal(original.status, 'published');
  assert.ok(original.themeId);
  await company.post(`/api/learning/curricula/${original.id}/publish`, {});
  assert.equal(env.q.one('SELECT COUNT(*) n FROM themes').n, 1, '再公開してもテーマを重複作成しない');
  assert.equal((await teacher.get('/api/learning/curricula')).data.curricula.length, 1);
});

test('教員編集：独立コピー・最終承認・授業スナップショット・担当クラス制限', async () => {
  adopted = (await teacher.post(`/api/learning/curricula/${original.id}/adopt`, {})).data.curriculum;
  const again = (await teacher.post(`/api/learning/curricula/${original.id}/adopt`, {})).data.curriculum;
  assert.equal(again.id, adopted.id, '再採用で編集内容を失わない');
  assert.equal(adopted.sourceId, original.id);
  assert.notEqual(adopted.id, original.id);
  assert.equal((await teacher.put(`/api/learning/curricula/${original.id}`, original)).status, 403);
  assert.equal((await company.put(`/api/learning/curricula/${adopted.id}`, adopted)).status, 403);
  assert.equal((await otherTeacher.put(`/api/learning/curricula/${adopted.id}`, adopted)).status, 403);
  assert.equal((await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId })).status, 403);
  const invalid = { ...adopted, stages: adopted.stages.map((s, i) => ({ ...s, minutes: s.minutes + (i === 0 ? 1 : 0) })) };
  assert.equal((await teacher.put(`/api/learning/curricula/${adopted.id}`, invalid)).status, 400);
  const edited = await teacher.put(`/api/learning/curricula/${adopted.id}`, { ...adopted, title: '2年A組で考える工場の未来' });
  assert.equal(edited.status, 200);
  adopted = edited.data.curriculum;
  assert.equal(env.q.one('SELECT title FROM curricula WHERE id=?', original.id).title, source.title);
  adopted = (await teacher.post(`/api/learning/curricula/${adopted.id}/approve`, {})).data.curriculum;
  assert.equal(adopted.status, 'approved');
  assert.equal((await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId: otherClassId })).status, 403);
  assert.equal((await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId, scheduledAt: 'not-a-date' })).status, 400);
  const created = await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId });
  assert.equal(created.status, 201);
  lesson = created.data.lesson;
  assert.equal(lesson.title, adopted.title);
  assert.equal(lesson.status, 'planned');
  assert.equal(env.q.one('SELECT COUNT(*) n FROM distributions WHERE theme_id=?', original.themeId).n, 1);
  await teacher.put(`/api/learning/curricula/${adopted.id}`, { ...adopted, title: '次回授業に向けて編集したタイトル' });
  assert.equal((await teacher.get(`/api/learning/lessons/${lesson.id}`)).data.lesson.title, lesson.title, '作成済授業は確定教材のまま');
  assert.equal((await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId })).status, 403, '編集後は再承認が必要');
});

test('授業：ロール越境と他クラスを拒否し、段階順序を守って進行する', async () => {
  assert.equal((await student.get('/api/learning/lessons')).data.lessons.length, 1);
  const studentLesson = (await student.get(`/api/learning/lessons/${lesson.id}`)).data.lesson;
  assert.equal('sourceContent' in studentLesson, false);
  assert.equal('teacherId' in studentLesson, false);
  assert.ok(studentLesson.stages.every(s => !('teacherNote' in s)));
  assert.equal((await otherStudent.get('/api/learning/lessons')).data.lessons.length, 0);
  assert.equal((await otherTeacher.get('/api/learning/lessons')).data.lessons.length, 0);
  for (const c of [company, otherTeacher, otherStudent]) {
    assert.equal((await c.get(`/api/learning/lessons/${lesson.id}`)).status, 403);
  }
  for (const c of [company, student, otherTeacher]) {
    assert.equal((await c.get(`/api/learning/lessons/${lesson.id}/results`)).status, 403);
    assert.equal((await c.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'start' })).status, 403);
  }
  assert.equal((await otherStudent.put(`/api/learning/lessons/${lesson.id}/response`, answer)).status, 403);
  assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/response`, answer)).status, 409);
  assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/baseline`, { before: 0 })).status, 400);
  assert.equal((await otherStudent.put(`/api/learning/lessons/${lesson.id}/baseline`, { before: 2 })).status, 403);
  for (let i = 1; i <= 8; i++) {
    const c = client(env.base);
    await c.login(`s-aa-0${i}`, 'test-pass-123');
    assert.equal((await c.put(`/api/learning/lessons/${lesson.id}/baseline`, { before: 2 })).status, 200);
  }
  assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/baseline`, { before: 3 })).status, 409);
  assert.equal((await student.get(`/api/learning/lessons/${lesson.id}`)).data.baseline.source, 'baseline');
  assert.equal((await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'next' })).status, 409);
  assert.equal((await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'start' })).status, 200);
  assert.equal((await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'complete' })).status, 409);
  for (let i = 1; i < lesson.stages.length; i++) {
    const result = await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'next' });
    assert.equal(result.status, 200);
    assert.equal(result.data.lesson.stageIndex, i);
  }
  assert.equal((await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'next' })).status, 409);
  const completed = await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'complete' });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.lesson.status, 'completed');
  assert.ok(completed.data.lesson.completedAt);
  assert.equal((await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'start' })).status, 409);
});

test('生徒回答：1授業1回答、手帳・KPI・連携出力へ同期し、本人のみプレビュー可能', async () => {
  for (const invalid of [{ ...answer, before: 0 }, { ...answer, after: 6 }, { ...answer, after: '4' }, { ...answer, learning: '' }, { ...answer, interests: ['秘密の自由タグ'] }]) {
    assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/response`, invalid)).status, 400);
  }
  assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/response`, answer)).status, 200);
  let records = env.q.all('SELECT * FROM records');
  assert.equal(records.length, 1);
  assert.equal(records[0].theme_id, original.themeId);
  assert.equal(records[0].status, 'submitted');
  const recordId = records[0].id;
  const revised = { ...answer, after: 5, learning: '修正した自分の学び。人の判断が安全を支えている。' };
  assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/response`, revised)).status, 200);
  records = env.q.all('SELECT * FROM records');
  assert.equal(records.length, 1, '更新で手帳を重複作成しない');
  assert.equal(records[0].id, recordId);
  assert.match(records[0].final_text, /修正した自分の学び/);
  const result = (await teacher.get(`/api/learning/lessons/${lesson.id}/results`)).data;
  assert.equal(result.summary.responseCount, 1);
  assert.equal(result.summary.studentCount, 8);
  assert.equal(result.summary.responseRate, 1 / 8);
  assert.equal(result.summary.beforeAverage, 2);
  assert.equal(result.summary.afterAverage, 5);
  assert.match(result.summary.measurementNote, /自己評価/);
  assert.equal(result.responses[0].attendanceNo, 1);
  assert.equal((await student.get(`/api/learning/lessons/${lesson.id}`)).data.response.after, 5);
  const career = (await student.get('/api/learning/career')).data;
  assert.equal(career.experiences.length, 1);
  assert.equal(career.sharing.connected, false);
  assert.equal(career.sharing.status, 'preview');
  assert.match(career.sharing.note, /外部送信.*行っていません/);
  assert.ok(career.profile.interests.some(x => x.tag === answer.interests[0]));
  assert.equal(career.sharing.payload.records.length, 1);
  assert.ok(!/concern_flag|password_hash|record_images/.test(JSON.stringify(career)));
  assert.equal((await otherStudent.get('/api/learning/career')).data.experiences.length, 0);
  assert.equal((await teacher.get('/api/learning/career')).status, 403);
  assert.equal((await company.get('/api/learning/career')).status, 403);
  const { buildExportDataset } = await import('../server/export.js');
  const dataset = await buildExportDataset({ from: shift(today, -1), to: today });
  assert.equal(dataset.records.length, 1);
  assert.equal(dataset.records[0].company_id, original.companyId);
  assert.match(dataset.records[0].record_text, /修正した自分の学び/);
  const { computeKpis } = await import('../server/kpi.js');
  const kpis = await computeKpis({ from: today, to: today, today });
  assert.equal(kpis.kpis.find(k => k.id === 'K-X1').value, 1);
  assert.equal(kpis.kpis.find(k => k.id === 'K-S2').value, 1 / 9);
  assert.equal(kpis.kpis.find(k => k.id === 'K-C2').value, 1);
});

test('企業集計：5人未満は抑制、複数授業への同一生徒回答でも閾値をすり抜けない', async () => {
  let report = (await company.get('/api/learning/company-report')).data;
  assert.equal(report.curricula[0].suppressed, true);
  assert.equal(report.curricula[0].responseCount, null);
  assert.equal(report.curricula[0].beforeAverage, null);
  assert.ok(!JSON.stringify(report).includes('修正した自分の学び'));
  assert.ok(!JSON.stringify(report).includes('MN-'));
  assert.equal((await otherCompany.get('/api/learning/company-report')).data.curricula.length, 0);
  await teacher.post(`/api/learning/curricula/${adopted.id}/approve`, {});
  for (let i = 0; i < 4; i++) {
    const l = (await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId })).data.lesson;
    await student.put(`/api/learning/lessons/${l.id}/baseline`, { before: 2 });
    await teacher.post(`/api/learning/lessons/${l.id}/progress`, { action: 'start' });
    for (let n = 1; n < l.stages.length; n++) await teacher.post(`/api/learning/lessons/${l.id}/progress`, { action: 'next' });
    await teacher.post(`/api/learning/lessons/${l.id}/progress`, { action: 'complete' });
    await student.put(`/api/learning/lessons/${l.id}/response`, answer);
  }
  report = (await company.get('/api/learning/company-report')).data;
  assert.equal(report.curricula[0].suppressed, true, '5回答あっても1人なら非表示');
  for (let i = 2; i <= 5; i++) {
    const c = client(env.base);
    await c.login(`s-aa-0${i}`, 'test-pass-123');
    assert.equal((await c.put(`/api/learning/lessons/${lesson.id}/response`, answer)).status, 200);
  }
  report = (await company.get('/api/learning/company-report')).data;
  assert.equal(report.curricula[0].suppressed, false);
  assert.equal(report.curricula[0].responseCount, 9);
  assert.equal(report.curricula[0].beforeAverage, 2);
  assert.equal(report.curricula[0].completedLessons, 5);
  assert.ok(!JSON.stringify(report).includes('studentId'));
  const { saveSettings } = await import('../server/settings.js');
  saveSettings({ school_min_cell: 6 });
  report = (await company.get('/api/learning/company-report')).data;
  assert.equal(report.minimumStudents, 6);
  assert.equal(report.curricula[0].suppressed, true, '運営で設定した同じ少人数閾値を新授業レポートにも適用');
  saveSettings({ school_min_cell: 5 });
});

test('入力検証：壊れた段階オブジェクトを400で拒否する', async () => {
  const current = (await teacher.get('/api/learning/curricula')).data.curricula.find(c => c.id === adopted.id);
  for (const stages of [[null, ...current.stages.slice(1)], [42, ...current.stages.slice(1)]]) {
    assert.equal((await teacher.put(`/api/learning/curricula/${adopted.id}`, { ...current, stages })).status, 400);
  }
});

test('学習デモseed：5社・3授業・8人の架空回答を追加し、再実行は非破壊', async () => {
  const { seedLearningDemo } = await import('../scripts/seed-learning.js');
  const before = env.q.one('SELECT COUNT(*) n FROM records').n;
  const seeded = seedLearningDemo();
  assert.equal(seeded.curriculumCount, 5);
  assert.equal(seeded.responseCount, 8);
  assert.equal(env.q.one('SELECT status FROM lessons WHERE id=?', seeded.activeId).status, 'active');
  assert.equal(env.q.one('SELECT status FROM lessons WHERE id=?', seeded.plannedId).status, 'planned');
  assert.equal(env.q.one('SELECT status FROM lessons WHERE id=?', seeded.completedId).status, 'completed');
  assert.equal(env.q.one('SELECT COUNT(*) n FROM records').n, before + 8);
  env.q.run('UPDATE curricula SET title=? WHERE id=?', '利用者が変更したタイトル', original.id);
  const counts = ['curricula', 'lessons', 'lesson_responses', 'records'].map(table => env.q.one(`SELECT COUNT(*) n FROM ${table}`).n);
  assert.equal(seedLearningDemo().skipped, true);
  assert.deepEqual(['curricula', 'lessons', 'lesson_responses', 'records'].map(table => env.q.one(`SELECT COUNT(*) n FROM ${table}`).n), counts);
  assert.equal(env.q.one('SELECT title FROM curricula WHERE id=?', original.id).title, '利用者が変更したタイトル');
});
