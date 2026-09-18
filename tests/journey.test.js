import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrap, client } from './helpers.js';
let env, student, otherStudent, teacher, sameSchoolTeacher, otherTeacher, company, studentId, recordId, otherRecordId;
const entryBody = (patch = {}) => ({ stage: 1, entryDate: '2026-09-01', fields: { purpose: '地域で暮らす人の考えを知りたい。', interest: '手帳に何度も川のことを書いていた。' }, recordIds: [], referenceUrl: '', referenceCheckedAt: '', voluntary: true, ...patch });
before(async () => {
  env = await bootstrap();
  const { importUsers } = await import('../server/lib/users.js');
  const rows = [
    { role: 'teacher', login_id: 'journey-ta', school_code: 'JA', school_name: '架空A校', teacher_classes: '2-A', display_name: '担当の先生' },
    { role: 'teacher', login_id: 'journey-tx', school_code: 'JA', teacher_classes: '2-B' },
    { role: 'teacher', login_id: 'journey-tb', school_code: 'JB', school_name: '架空B校', teacher_classes: '2-A' },
    { role: 'student', login_id: 'journey-sa', school_code: 'JA', grade: '2', class: 'A', attendance_no: '1' },
    { role: 'student', login_id: 'journey-sb', school_code: 'JB', grade: '2', class: 'A', attendance_no: '1' },
    { role: 'company', login_id: 'journey-company', company_code: 'JCO', company_name: '架空の会社' },
  ].map((r, i) => ({ __line: i + 1, password: 'journey-test-password', ...r }));
  assert.deepEqual(importUsers(rows).errors, []);
  env.q.run('UPDATE users SET must_change_password=0');
  const login = async id => { const c = client(env.base); assert.equal((await c.login(id, 'journey-test-password')).status, 200); return c; };
  student = await login('journey-sa'); otherStudent = await login('journey-sb'); teacher = await login('journey-ta');
  sameSchoolTeacher = await login('journey-tx'); otherTeacher = await login('journey-tb'); company = await login('journey-company');
  const makeRecord = id => { const u = env.q.one('SELECT * FROM users WHERE login_id=?', id); return Number(env.q.run("INSERT INTO records(user_id,school_id,class_id,type,ocr_status,final_text,status,submitted_at) VALUES(?,?,?,'reflection','none','川を見て考えたことを手帳に書いた。','submitted','2026-09-01T00:00:00Z')", u.id, u.school_id, u.class_id).lastInsertRowid); };
  studentId = env.q.one("SELECT id FROM users WHERE login_id='journey-sa'").id;
  recordId = makeRecord('journey-sa'); otherRecordId = makeRecord('journey-sb');
});
after(async () => { if (!env) return; await new Promise(resolve => env.server.close(resolve)); fs.rmSync(env.dir, { recursive: true, force: true }); });

test('探究4STEP：未認証と企業を拒否し、本人と担当教員の入口を提供する', async () => {
  assert.equal((await client(env.base).get('/api/journey')).status, 401);
  assert.equal((await company.get('/api/journey')).status, 403);
  assert.equal((await company.get('/api/journey/metrics')).status, 403);
  const home = await student.get('/api/journey');
  assert.equal(home.status, 200); assert.equal(home.data.stages.length, 4);
  assert.deepEqual(home.data.records.map(r => r.id), [recordId]);
  const students = (await teacher.get('/api/journey')).data.students;
  assert.deepEqual(students.map(s => s.id), [studentId]);
});

test('探究記録：不正な日付・問い・根拠・URLは保存しない', async () => {
  const invalid = [
    { stage: 5 }, { entryDate: '2026-02-30' }, { fields: { purpose: '', interest: '興味' } },
    { fields: { purpose: '目的', interest: '関心', private: '未定義の項目' } },
    { recordIds: [otherRecordId] }, { recordIds: [recordId, recordId] },
    { referenceUrl: 'javascript:alert(1)', referenceCheckedAt: '2026-09-01' },
    { referenceUrl: 'https://example.invalid', referenceCheckedAt: '' },
    { referenceUrl: 'https://name:secret@example.invalid', referenceCheckedAt: '2026-09-01' },
  ];
  for (const patch of invalid) assert.equal((await student.post('/api/journey/entries', entryBody(patch))).status, 400);
  assert.equal((await student.get('/api/journey')).data.entries.length, 0);
});

test('探究記録：本人の更新・保存・根拠リンクと更新競合を検証する', async () => {
  const body = entryBody({ recordIds: [recordId], referenceUrl: 'https://example.invalid/reference', referenceCheckedAt: '2026-09-01' });
  const saved = await student.post('/api/journey/entries', body);
  assert.equal(saved.status, 201); const entry = saved.data.entry;
  assert.equal(entry.version, 1);
  assert.equal((await otherStudent.put(`/api/journey/entries/${entry.id}`, { ...body, version: 1 })).status, 404);
  assert.equal((await teacher.put(`/api/journey/entries/${entry.id}`, { ...body, version: 1 })).status, 403);
  const updated = await student.put(`/api/journey/entries/${entry.id}`, { ...body, fields: { ...body.fields, purpose: '地域の人に直接話を聞きたい。' }, version: 1 });
  assert.equal(updated.status, 200); assert.equal(updated.data.entry.version, 2);
  assert.equal((await student.put(`/api/journey/entries/${entry.id}`, { ...body, version: 1 })).status, 409);
  const home = (await student.get('/api/journey')).data;
  assert.equal(home.entries.length, 1); assert.equal(home.entries[0].fields.purpose, '地域の人に直接話を聞きたい。');
  assert.deepEqual(home.entries[0].recordIds, [recordId]);
  assert.equal(home.metrics.before.records, 1);
});

test('教員面談：担当クラスのみ閲覧・声かけ記録、共有文言だけを生徒へ返す', async () => {
  for (const c of [sameSchoolTeacher, otherTeacher, otherStudent, company]) assert.equal((await c.get(`/api/journey/students/${studentId}`)).status, 403);
  assert.equal((await teacher.get(`/api/journey/students/${studentId}`)).status, 200);
  const body = { body: '川の観察で感じた変化を、手帳を見ながら話しましょう。', plannedDate: '2026-09-25', status: 'planned' };
  assert.equal((await otherTeacher.post(`/api/journey/students/${studentId}/notes`, body)).status, 403);
  const saved = await teacher.post(`/api/journey/students/${studentId}/notes`, body);
  assert.equal(saved.status, 201);
  const notes = (await student.get('/api/journey')).data.notes;
  assert.equal(notes[0].body, body.body); assert.equal(notes[0].status, 'planned');
  assert.equal((await otherStudent.get('/api/journey')).data.notes.length, 0);
  assert.equal((await sameSchoolTeacher.put(`/api/journey/notes/${saved.data.id}`, { ...body, status: 'done' })).status, 403);
  assert.equal((await teacher.put(`/api/journey/notes/${saved.data.id}`, { ...body, status: 'done' })).status, 200);
  assert.equal((await student.get('/api/journey')).data.notes[0].status, 'done');
  assert.ok(env.q.one("SELECT id FROM audit_logs WHERE action='journey_student_view'"));
});

test('探究の気になる記述も安全網へつなぎ、企業に個別情報を公開しない', async () => {
  const body = entryBody({ stage: 3, entryDate: '2026-09-10', fields: { observation: '人の話を聞いた。', emotionShift: '最近眠れない。つらい気持ちも先生に伝えたい。', notebookQuestion: 'いま困っていることを紙に書いてみる。' }, voluntary: false });
  const saved = await student.post('/api/journey/entries', body); assert.equal(saved.status, 201);
  assert.ok(env.q.one("SELECT id FROM alerts WHERE student_id=? AND kind='concern' AND reason LIKE '探究4STEP%'", studentId));
  const home = (await student.get('/api/journey')).data;
  assert.equal(home.metrics.after.records, 0, '自発的と申告していない記録は測定へ混ぜない');
  assert.equal(JSON.stringify(home).includes('concern_flag'), false);
  assert.equal((await company.get(`/api/journey/students/${studentId}`)).status, 403);
});

test('新評価：測定期間・前後N・教員継続80%と回答率を別々に集計する', async () => {
  await student.post('/api/journey/entries', entryBody({ stage: 4, entryDate: '2026-09-12', fields: { nextAction: '地域の清掃に参加して観察を続ける。', aspirationBasis: '現場で聞いた声と手帳の記録から考えた。' } }));
  assert.equal((await teacher.put('/api/journey/teacher-survey', { continuation: 'yes', workload: 'lighter', note: '対話の入口が分かった。' })).status, 200);
  let metrics = (await teacher.get('/api/journey/metrics')).data;
  assert.equal(metrics.writing.studentCount, 1); assert.equal(metrics.writing.pairedStudents, 1);
  assert.equal(metrics.continuation.target, .8); assert.equal(metrics.continuation.rate, 1); assert.equal(metrics.continuation.responseRate, .5);
  await sameSchoolTeacher.put('/api/journey/teacher-survey', { continuation: 'no', workload: 'heavier', note: '' });
  await otherTeacher.put('/api/journey/teacher-survey', { continuation: 'yes', workload: 'same', note: '' });
  metrics = (await teacher.get('/api/journey/metrics')).data;
  assert.deepEqual(metrics.workload, { respondents: 2, lighter: 1, same: 0, heavier: 1 });
  assert.equal(metrics.continuation.respondents, 2); assert.equal(metrics.continuation.rate, .5); assert.equal(metrics.continuation.responseRate, 1);
  const period = (await teacher.get('/api/journey/metrics?from=2026-09-10&to=2026-09-15')).data;
  assert.equal(period.writing.before.records, 0); assert.equal(period.writing.after.records, 1); assert.equal(period.writing.pairedStudents, 0);
  assert.equal((await teacher.get('/api/journey/metrics?from=2026-09-20&to=2026-09-01')).status, 400);
  assert.equal((await student.get('/api/journey/metrics')).status, 403);
});
