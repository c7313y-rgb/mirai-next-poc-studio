import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrap, client } from './helpers.js';

let env, company, schoolId, classId, companyId;
const students = [];
const at = new Date().toISOString();

before(async () => {
  env = await bootstrap();
  const { hashPassword } = await import('../server/lib/password.js');
  const password = hashPassword('company-test-password');
  schoolId = Number(env.q.run("INSERT INTO schools(code,name) VALUES('PRIVACY','デモ校')").lastInsertRowid);
  classId = Number(env.q.run("INSERT INTO classes(school_id,grade,name) VALUES(?,2,'A')", schoolId).lastInsertRowid);
  companyId = Number(env.q.run("INSERT INTO companies(code,name) VALUES('PRIVACY','デモ企業')").lastInsertRowid);
  env.q.run("INSERT INTO users(login_id,password_hash,role,company_id) VALUES('privacy-company',?,'company',?)", password, companyId);
  for (let i = 0; i < 6; i++) {
    students.push(Number(env.q.run("INSERT INTO users(login_id,password_hash,role,school_id,class_id,attendance_no) VALUES(?,?,'student',?,?,?)", `privacy-student-${i}`, password, schoolId, classId, i + 1).lastInsertRowid));
  }
  company = client(env.base);
  assert.equal((await company.login('privacy-company', 'company-test-password')).status, 200);
});

after(async () => {
  const { stopWorker } = await import('../server/jobs.js');
  stopWorker();
  env.server.close();
  fs.rmSync(env.dir, { recursive: true, force: true });
});

function theme(title) {
  return Number(env.q.run("INSERT INTO themes(company_id,title,status,published_at) VALUES(?,?,'published',?)", companyId, title, at).lastInsertRowid);
}

function record(themeId, studentIndex, tags, status = 'submitted') {
  return Number(env.q.run("INSERT INTO records(user_id,school_id,class_id,type,theme_id,status,tags,submitted_at) VALUES(?,?,?,'theme',?,?,?,?)", students[studentIndex], schoolId, classId, themeId, status, JSON.stringify(tags), at).lastInsertRowid);
}

function voice(themeId, sourceCount, status = 'approved') {
  env.q.run('INSERT INTO voice_summaries(theme_id,summary,source_count,status,generated_at) VALUES(?,?,?,?,?) ON CONFLICT(theme_id) DO UPDATE SET source_count=excluded.source_count,status=excluded.status', themeId, JSON.stringify({ summary: '承認された匿名の声' }), sourceCount, status, at);
}

async function report(themeId) {
  const result = await company.get('/api/company/report');
  assert.equal(result.status, 200);
  return result.data.themes.find((item) => item.id === themeId);
}

test('企業レポート：同じ生徒の多数提出や未提出の下書きではタグ・声を公開しない', async () => {
  const id = theme('1人の多数記録');
  for (let i = 0; i < 8; i++) record(id, 0, ['情報・デジタル']);
  for (let i = 1; i < 5; i++) record(id, i, ['情報・デジタル'], 'draft');
  voice(id, 8);
  env.q.run('INSERT INTO theme_views(theme_id,user_id,first_viewed_at) VALUES(?,?,?)', id, students[0], at);
  const result = await report(id);
  assert.equal(result.views, 1);
  assert.equal(result.records, 8);
  assert.equal(result.bySchool[0].suppressed, true);
  assert.deepEqual(result.tags, []);
  assert.equal(result.voice, null);
});

test('企業レポート：5人以上が記録したタグだけを返し、タグごとの少人数を抑制する', async () => {
  const id = theme('タグごとの人数');
  for (let i = 0; i < 5; i++) record(id, i, ['情報・デジタル', ...(i < 4 ? ['環境・エネルギー'] : [])]);
  record(id, 0, ['情報・デジタル', '1人だけのタグ']);
  const result = await report(id);
  assert.deepEqual(result.tags, [{ tag: '情報・デジタル', count: 6 }]);
  assert.equal(result.voice, null);
});

test('企業レポート：声には提出者数・要約元件数・運営承認の全条件が必要', async () => {
  const id = theme('声の公開条件');
  const ids = students.slice(0, 5).map((_, i) => record(id, i, ['情報・デジタル']));
  voice(id, 4);
  assert.equal((await report(id)).voice, null);
  voice(id, 5, 'pending_review');
  assert.equal((await report(id)).voice, null);
  voice(id, 5);
  assert.equal((await report(id)).voice.sourceCount, 5);
  env.q.run('DELETE FROM records WHERE id=?', ids[4]);
  assert.equal((await report(id)).voice, null);
});

test('企業レポート：少人数の閾値設定をタグと声にも反映する', async () => {
  const { saveSettings } = await import('../server/settings.js');
  const id = theme('閾値6人');
  for (let i = 0; i < 5; i++) record(id, i, ['情報・デジタル']);
  voice(id, 6);
  saveSettings({ school_min_cell: 6 });
  try {
    assert.deepEqual((await report(id)).tags, []);
    assert.equal((await report(id)).voice, null);
    record(id, 5, ['情報・デジタル']);
    const result = await report(id);
    assert.deepEqual(result.tags, [{ tag: '情報・デジタル', count: 6 }]);
    assert.equal(result.voice.sourceCount, 6);
  } finally {
    saveSettings({ school_min_cell: 5 });
  }
});
