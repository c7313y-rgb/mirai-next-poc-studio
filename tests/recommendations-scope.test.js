import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrap, client } from './helpers.js';

let env, student, emptyStudent, company, ownUser, otherUser, teacherId, foodId, digitalId;
const unavailableIds = [];
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const shift = n => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function record(user, tags, { status = 'submitted', time = new Date().toISOString(), text = '' } = {}) {
  env.q.run('INSERT INTO records(user_id,school_id,class_id,status,tags,submitted_at,final_text) VALUES(?,?,?,?,?,?,?)', user.id, user.school_id, user.class_id, status, JSON.stringify(tags), status === 'submitted' ? time : null, text);
}

before(async () => {
  env = await bootstrap();
  const { importUsers } = await import('../server/lib/users.js');
  importUsers([
    { role: 'teacher', login_id: 'rec-t', school_code: 'REC', school_name: '推薦テスト高校', teacher_classes: '2-A;2-B;2-C' },
    { role: 'student', login_id: 'rec-own', school_code: 'REC', grade: '2', class: 'A', attendance_no: '1' },
    { role: 'student', login_id: 'rec-other', school_code: 'REC', grade: '2', class: 'A', attendance_no: '2' },
    { role: 'student', login_id: 'rec-b', school_code: 'REC', grade: '2', class: 'B', attendance_no: '1' },
    { role: 'student', login_id: 'rec-empty', school_code: 'REC', grade: '2', class: 'C', attendance_no: '1' },
    { role: 'company', login_id: 'rec-c', company_code: 'REC-C', company_name: '推薦テスト企業', company_industry: '製造業' },
  ].map((row, i) => ({ ...row, __line: i + 2, password: 'recommendation-test-123' })));
  env.q.run('UPDATE users SET must_change_password=0');
  const login = async id => { const c = client(env.base); assert.equal((await c.login(id, 'recommendation-test-123')).status, 200); return c; };
  student = await login('rec-own'); emptyStudent = await login('rec-empty'); company = await login('rec-c');
  ownUser = env.q.one("SELECT * FROM users WHERE login_id='rec-own'");
  otherUser = env.q.one("SELECT * FROM users WHERE login_id='rec-other'");
  teacherId = env.q.one("SELECT id FROM users WHERE login_id='rec-t'").id;
  const companyId = env.q.one("SELECT id FROM companies WHERE code='REC-C'").id;
  const classB = env.q.one("SELECT class_id FROM users WHERE login_id='rec-b'").class_id;
  const theme = (title, { classId = ownUser.class_id, status = 'published', start = shift(-1), end = shift(1) } = {}) => {
    const id = Number(env.q.run('INSERT INTO themes(company_id,title,summary,status) VALUES(?,?,?,?)', companyId, title, title, status).lastInsertRowid);
    env.q.run('INSERT INTO distributions(theme_id,class_id,teacher_id,start_date,end_date) VALUES(?,?,?,?,?)', id, classId, teacherId, start, end);
    return id;
  };
  foodId = theme('農業と野菜'); digitalId = theme('AIとデータの活用');
  unavailableIds.push(theme('他クラスだけのAI', { classId: classB }), theme('下書きのAI', { status: 'draft' }), theme('終了したAI', { start: shift(-3), end: shift(-1) }), theme('未来のAI', { start: shift(1), end: shift(3) }));
});

after(async () => {
  if (!env) return;
  await new Promise(resolve => env.server.close(resolve));
  fs.rmSync(env.dir, { recursive: true, force: true });
});

test('推薦APIは本人の提出タグと配信中の公開テーマだけを使い、他者・下書き・配信外を混ぜない', async () => {
  record(ownUser, ['情報・デジタル']);
  record(ownUser, ['食・農業'], { status: 'draft' });
  for (let i = 0; i < 3; i++) record(otherUser, ['食・農業'], { text: '他生徒だけの個人的な本文' });
  const response = await student.get(`/api/student/home?userId=${otherUser.id}&classId=${otherUser.class_id}`);
  assert.equal(response.status, 200);
  const { recommendations } = response.data;
  assert.deepEqual(recommendations.themes.map(t => t.id).sort((a,b) => a-b), [foodId,digitalId].sort((a,b) => a-b));
  assert.equal(recommendations.themes[0].id, digitalId);
  assert.deepEqual(recommendations.themes[0].matchTags, [{ tag: '情報・デジタル', count: 1 }]);
  assert.equal(recommendations.themes.find(t => t.id === foodId).matchScore, 0);
  assert.equal(recommendations.basisRecordCount, 1);
  assert.equal(JSON.stringify(response.data).includes('他生徒だけの個人的な本文'), false);
  for (const id of unavailableIds) assert.equal((await student.get(`/api/student/themes/${id}`)).status, 404);
  assert.equal((await company.get('/api/student/home')).status, 403);
});

test('推薦APIの根拠は直近100件に限り、古いタグを説明に混ぜない', async () => {
  env.q.run('DELETE FROM records WHERE user_id=?', ownUser.id);
  record(ownUser, ['食・農業'], { time: '2020-01-01T00:00:00Z' });
  for (let i = 0; i < 100; i++) record(ownUser, ['情報・デジタル'], { time: new Date(Date.now() + i * 1000).toISOString() });
  const { data } = await student.get('/api/student/home');
  assert.equal(data.recommendations.basisRecordCount, 100);
  assert.deepEqual(data.recommendations.themes[0].matchTags, [{ tag: '情報・デジタル', count: 100 }]);
  assert.equal(data.recommendations.themes.find(t => t.id === foodId).matchScore, 0);
});

test('記録も配信もない生徒のホームは空配列と説明を返す', async () => {
  const { status, data } = await emptyStudent.get('/api/student/home');
  assert.equal(status, 200);
  assert.deepEqual(data.themes, []);
  assert.deepEqual(data.recommendations.themes, []);
  assert.equal(data.recommendations.basisRecordCount, 0);
  assert.match(data.recommendations.note, /能力・職業適性の判定ではありません/);
});
