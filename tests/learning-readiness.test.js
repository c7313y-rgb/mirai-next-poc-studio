import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrap, client } from './helpers.js';

let env, teacher, student, company, curriculum, classId, studentId, companyId;
let drainJobs, mockProvider, originalAnalyze;
const response = { after: 4, learning: 'データを比べる大切さを学びました。', nextAction: '身近な課題を観察する。', interests: ['情報・デジタル'] };

before(async () => {
  env = await bootstrap();
  const { importUsers } = await import('../server/lib/users.js');
  importUsers([
    { role: 'teacher', login_id: 'ready-t', school_code: 'READY', school_name: '架空高校', teacher_classes: '2-A' },
    { role: 'student', login_id: 'ready-s', school_code: 'READY', grade: '2', class: 'A', attendance_no: '1' },
    { role: 'company', login_id: 'ready-c', company_code: 'READY-C', company_name: '架空企業', company_industry: '製造業' },
  ].map((r, i) => ({ ...r, __line: i + 2, password: 'readiness-pass-123' })));
  env.q.run('UPDATE users SET must_change_password=0');
  const login = async (id) => { const c = client(env.base); assert.equal((await c.login(id, 'readiness-pass-123')).status, 200); return c; };
  teacher = await login('ready-t'); student = await login('ready-s'); company = await login('ready-c');
  classId = env.q.one("SELECT id FROM classes WHERE name='A'").id;
  studentId = env.q.one("SELECT id FROM users WHERE login_id='ready-s'").id;
  companyId = env.q.one("SELECT id FROM companies WHERE code='READY-C'").id;
  const source = { title: '工場の課題を考える', sourceContent: '架空の工場で人と機械が一緒に働いています。安全や品質と生産性を両立するために、できる工夫を考えましょう。', audience: '高校2年生', subject: '総合的な探究の時間', duration: 50 };
  const original = (await company.post('/api/learning/curricula/generate', source)).data.curriculum;
  await company.post(`/api/learning/curricula/${original.id}/publish`, {});
  curriculum = (await teacher.post(`/api/learning/curricula/${original.id}/adopt`, {})).data.curriculum;
  await teacher.post(`/api/learning/curricula/${curriculum.id}/approve`, {});
  ({ drainJobs } = await import('../server/jobs.js'));
  ({ mockProvider } = await import('../server/ai/mock.js'));
  originalAnalyze = mockProvider.analyze;
});

after(async () => {
  if (!env) return;
  mockProvider.analyze = originalAnalyze;
  await drainJobs();
  await new Promise(resolve => env.server.close(resolve));
  fs.rmSync(env.dir, { recursive: true, force: true });
});

async function makeLesson({ baseline = true, complete = true } = {}) {
  const lesson = (await teacher.post('/api/learning/lessons', { curriculumId: curriculum.id, classId })).data.lesson;
  if (baseline) assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/baseline`, { before: 2 })).status, 200);
  if (complete) {
    await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'start' });
    for (let i = 1; i < lesson.stages.length; i++) await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'next' });
    await teacher.post(`/api/learning/lessons/${lesson.id}/progress`, { action: 'complete' });
  }
  return lesson;
}

test('授業前測定を別保存し、未回答・事後の後付け・授業途中の事後回答を拒否する', async () => {
  const planned = await makeLesson({ baseline: false, complete: false });
  assert.equal((await student.get(`/api/learning/lessons/${planned.id}`)).data.baseline, null);
  for (const before of [null, 0, 6, '3']) assert.equal((await student.put(`/api/learning/lessons/${planned.id}/baseline`, { before })).status, 400);
  assert.equal((await student.put(`/api/learning/lessons/${planned.id}/baseline`, { before: 2 })).status, 200);
  assert.equal((await student.put(`/api/learning/lessons/${planned.id}/baseline`, { before: 2 })).status, 200);
  assert.equal((await student.put(`/api/learning/lessons/${planned.id}/baseline`, { before: 5 })).status, 409);
  await teacher.post(`/api/learning/lessons/${planned.id}/progress`, { action: 'start' });
  assert.equal((await student.put(`/api/learning/lessons/${planned.id}/response`, response)).status, 409);
  const missed = await makeLesson({ baseline: false });
  assert.equal((await student.put(`/api/learning/lessons/${missed.id}/baseline`, { before: 2 })).status, 409);
  assert.equal((await student.put(`/api/learning/lessons/${missed.id}/response`, { ...response, before: 2 })).status, 409);
  const measured = await makeLesson();
  assert.equal((await student.put(`/api/learning/lessons/${measured.id}/response`, response)).status, 200);
  const detail = (await student.get(`/api/learning/lessons/${measured.id}`)).data;
  assert.equal(detail.response.before, 2);
  assert.equal(detail.baseline.source, 'baseline');
  assert.equal((await student.put(`/api/learning/lessons/${measured.id}/response`, { ...response, before: 5 })).status, 400);
});

test('既存の授業前後回答は保持し、終了後の回想回答として区別する', async () => {
  const lesson = await makeLesson({ baseline: false });
  env.q.run('INSERT INTO lesson_responses(lesson_id,user_id,before_score,after_score,learning,next_action,interests,submitted_at) VALUES(?,?,2,4,?,?,?,?)', lesson.id, studentId, '従来の学び', '従来の行動', '[]', new Date().toISOString());
  const detail = (await student.get(`/api/learning/lessons/${lesson.id}`)).data;
  assert.equal(detail.baseline.source, 'legacy_response');
  assert.equal(detail.response.learning, '従来の学び');
  assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/response`, response)).status, 200);
  assert.equal((await student.get(`/api/learning/lessons/${lesson.id}`)).data.baseline.source, 'legacy_response');
});

test('生徒APIは教師の進行メモ・企業の全文素材を返さない', async () => {
  const lesson = await makeLesson();
  const studentDetail = (await student.get(`/api/learning/lessons/${lesson.id}`)).data.lesson;
  const studentList = (await student.get('/api/learning/lessons')).data.lessons;
  for (const item of [studentDetail, ...studentList]) {
    assert.equal('sourceContent' in item, false);
    assert.equal('teacherId' in item, false);
    assert.ok(item.stages.every(s => !('teacherNote' in s)));
  }
  const teacherDetail = (await teacher.get(`/api/learning/lessons/${lesson.id}`)).data.lesson;
  assert.ok(teacherDetail.sourceContent);
  assert.ok(teacherDetail.stages[0].teacherNote);
});

test('授業の困りごとは即時検知され、AIと重複せず、本文修正だけでは要確認を消さない', async () => {
  const lesson = await makeLesson();
  const pending = [];
  mockProvider.analyze = async () => new Promise(resolve => pending.push(resolve));
  try {
    assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/response`, { ...response, learning: '学校に行きたくない。助けて。' })).status, 200);
    const recordId = env.q.one('SELECT record_id FROM lesson_responses WHERE lesson_id=?', lesson.id).record_id;
    let record = env.q.one('SELECT * FROM records WHERE id=?', recordId);
    assert.equal(record.ai_status, 'pending');
    assert.equal(record.concern_flag, 1);
    assert.equal(env.q.one("SELECT COUNT(*) n FROM alerts WHERE record_id=? AND kind='concern'", recordId).n, 1);
    assert.equal((await student.put(`/api/learning/lessons/${lesson.id}/response`, { ...response, learning: '先生と相談し、次の学びを考える。' })).status, 200);
    assert.equal(pending.length, 2);
    pending[1]({ feedback: '新しい記録へのコメント', tags: ['教育・子ども'], summary: '新しい要約', concern: { flag: false, reason: null } });
    pending[0]({ feedback: '古い記録へのコメント', tags: [], summary: '古い要約', concern: { flag: true, reason: '古い検知' } });
    await drainJobs();
    record = env.q.one('SELECT * FROM records WHERE id=?', recordId);
    assert.equal(record.feedback, '新しい記録へのコメント', '遅い旧解析で新記録を上書きしない');
    assert.equal(record.concern_flag, 1, '生徒の修正で未対応の要確認を消さない');
    assert.ok(JSON.parse(record.tags).includes('情報・デジタル'), '本人が選んだ関心を保持');
    const alerts = env.q.all("SELECT * FROM alerts WHERE record_id=? AND kind='concern'", recordId);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].status, 'open');
    assert.equal((await teacher.post(`/api/teacher/alerts/${alerts[0].id}/handle`, { note: '架空テストで確認済み' })).status, 200);
    mockProvider.analyze = originalAnalyze;
    await student.put(`/api/learning/lessons/${lesson.id}/response`, response);
    await drainJobs();
    assert.equal(env.q.one('SELECT concern_flag FROM records WHERE id=?', recordId).concern_flag, 0);
    assert.equal(env.q.one('SELECT status FROM alerts WHERE id=?', alerts[0].id).status, 'handled');
  } finally {
    mockProvider.analyze = originalAnalyze;
  }
});

test('正式出力は企業業種と教科を分離し、アンケート自由記述を含めない', async () => {
  const { buildExportDataset, renderExport, linkFillRate } = await import('../server/export.js');
  const survey = env.q.one("SELECT id FROM surveys WHERE kind='student'");
  env.q.run('INSERT INTO survey_responses(survey_id,user_id,answers) VALUES(?,?,?)', survey.id, studentId, JSON.stringify({ overall: 3, comment: '共有合意のない固有の自由記述' }));
  const data = await buildExportDataset({ from: '2020-01-01', to: '2030-01-01' });
  assert.equal(data.meta.schema, 'mirai-next-link/0.3');
  assert.ok(data.records.every(r => r.company_industry === '製造業' && r.subject === '総合的な探究の時間'));
  assert.equal(linkFillRate(data).detail.find(d => d.key === 'company_industry').ok, true);
  for (const format of ['csv', 'json']) {
    const output = renderExport(data, format).content;
    assert.match(output, /製造業/);
    assert.match(output, /総合的な探究の時間/);
    assert.equal(output.includes('survey_answers'), false);
    assert.equal(output.includes('共有合意のない固有の自由記述'), false);
  }
  env.q.run('UPDATE companies SET industry=NULL WHERE id=?', companyId);
  const missing = linkFillRate(await buildExportDataset({ from: '2020-01-01', to: '2030-01-01' }));
  assert.equal(missing.detail.find(d => d.key === 'company_industry').ok, false);
  assert.ok(missing.rate < 1);
  assert.equal(missing.completeRecordRate, 0);
  env.q.run('UPDATE companies SET industry=? WHERE id=?', '製造業', companyId);
});
