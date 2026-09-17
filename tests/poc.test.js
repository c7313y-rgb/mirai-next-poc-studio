import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrap, client, TINY_JPEG } from './helpers.js';

let env, admin;
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const shift = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const CSV = [
  'role,login_id,password,school_code,school_name,grade,class,attendance_no,student_key,company_code,company_name,company_industry,display_name,teacher_classes',
  'teacher,t1,password1,S1,テスト高校,,,,,,,,担任A,2-A',
  'teacher,t2,password2,S1,テスト高校,,,,,,,,担任B,2-B',
  'student,s1,password1,S1,テスト高校,2,A,1,,,,,,',
  'student,s2,password2,S1,テスト高校,2,A,2,,,,,,',
  'student,s3,password3,S1,テスト高校,2,B,1,,,,,,',
  'company,c1,password1,,,,,,,CO1,テスト株式会社,情報・デジタル,人事,',
].join('\n');

before(async () => {
  env = await bootstrap();
  const { hashPassword } = await import('../server/lib/password.js');
  env.q.run("INSERT INTO users(login_id, password_hash, role) VALUES('admin', ?, 'admin')", hashPassword('adminpass123'));
  const { saveSettings } = await import('../server/settings.js');
  saveSettings({ poc_start: shift(today, -20), poc_end: shift(today, 60), excluded_periods: [] });
  admin = client(env.base);
  assert.equal((await admin.login('admin', 'adminpass123')).status, 200);
});

after(async () => {
  const { stopWorker } = await import('../server/jobs.js');
  stopWorker();
  env.server.close();
  fs.rmSync(env.dir, { recursive: true, force: true });
});

test('CSV一括登録：生徒の氏名はエラーで全件ロールバック', async () => {
  const bad = CSV.replace('student,s1,password1,S1,テスト高校,2,A,1,,,,,,', 'student,s1,password1,S1,テスト高校,2,A,1,,,,,山田太郎,');
  const r = await admin.post('/api/admin/users/import', { csv: bad });
  assert.equal(r.status, 422);
  assert.ok(r.data.errors.some((e) => e.error.includes('氏名')));
  assert.equal(env.q.one("SELECT COUNT(*) c FROM users WHERE role='student'").c, 0);
});

test('CSV一括登録：QR付きの資格情報が返り、仮名IDは氏名を含まない', async () => {
  const r = await admin.post('/api/admin/users/import', { csv: CSV });
  assert.equal(r.status, 200);
  assert.equal(r.data.created, 6);
  const s1 = r.data.credentials.find((c) => c.loginId === 's1');
  assert.match(s1.qrSvg, /<svg/);
  const u = env.q.one("SELECT pseudo_id FROM users WHERE login_id='s1'");
  assert.match(u.pseudo_id, /^MN-[A-Z0-9]{10}$/);
  for (const [id, password] of [['t1', 'password1'], ['t2', 'password2'], ['c1', 'password1']]) {
    const account = client(env.base);
    assert.equal((await account.login(id, password)).status, 200);
    assert.equal((await account.post('/api/auth/password', { current: password, next: password + '-updated' })).status, 200);
  }
});

test('CSRFヘッダなしの更新系APIは拒否', async () => {
  const c = client(env.base);
  const r = await c.post('/api/auth/login', { loginId: 's1', password: 'password1' }, { csrf: false });
  assert.equal(r.status, 403);
});

test('生徒：撮影→AI読み取り→確認修正→提出→フィードバック・要確認アラート', async () => {
  const { enqueue, drainJobs } = await import('../server/jobs.js');
  // 公開テーマと配信
  const coId = env.q.one("SELECT id FROM companies WHERE code='CO1'").id;
  const th = await admin.post('/api/admin/themes', { companyId: coId, title: 'AIで学校の困りごとを減らす', summary: '概要', questions: ['問い1'], field: '情報・デジタル' });
  assert.equal((await admin.post(`/api/admin/themes/${th.data.id}/status`, { status: 'published' })).status, 200);
  const t1 = client(env.base);
  await t1.login('t1', 'password1-updated');
  const cls = await t1.get('/api/teacher/classes');
  const classA = cls.data.classes[0].id;
  assert.equal((await t1.post('/api/teacher/distributions', { themeId: th.data.id, classIds: [classA], startDate: shift(today, -1), endDate: shift(today, 10) })).status, 201);

  const s1 = client(env.base);
  await s1.login('s1', 'password1');
  const home = await s1.get('/api/student/home');
  assert.equal(home.data.themes.length, 1);
  const detail = await s1.get(`/api/student/themes/${th.data.id}`);
  assert.equal(detail.status, 200);
  await s1.post(`/api/student/themes/${th.data.id}/interest`, { on: true });

  const form = new FormData();
  form.append('images', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'page.jpg');
  const up = await s1.post('/api/student/records', undefined, { form });
  assert.equal(up.status, 201);
  await drainJobs();
  const rec = await s1.get(`/api/student/records/${up.data.id}`);
  assert.equal(rec.data.record.ocrStatus, 'done');
  assert.ok(rec.data.record.ocrText.length > 0);

  // 画像は暗号化保存されている
  const img = env.q.one('SELECT * FROM record_images WHERE record_id=?', up.data.id);
  assert.equal(img.encrypted, 1);

  const sub = await s1.post(`/api/student/records/${up.data.id}/submit`, { type: 'theme', themeId: th.data.id, text: 'AIのプログラムを作りたい。でも最近眠れないのがつらい。' });
  assert.equal(sub.status, 200);
  await drainJobs();
  const list = await s1.get('/api/student/records');
  assert.ok(list.data.records[0].feedback);
  assert.ok(list.data.records[0].tags.includes('情報・デジタル'));

  const dash = await t1.get(`/api/teacher/classes/${classA}/dashboard`);
  assert.equal(dash.status, 200);
  assert.ok(dash.data.alerts.some((a) => a.kind === 'concern'));
  assert.equal(dash.data.cards.activeThisWeek, 1);
  void enqueue;
});

test('権限：担当外クラス・企業の画像閲覧・未配信テーマは拒否（CM-02）', async () => {
  const t2 = client(env.base);
  await t2.login('t2', 'password2-updated');
  const classA = env.q.one("SELECT c.id FROM classes c WHERE c.name='A'").id;
  assert.equal((await t2.get(`/api/teacher/classes/${classA}/dashboard`)).status, 403);
  const s1id = env.q.one("SELECT id FROM users WHERE login_id='s1'").id;
  assert.equal((await t2.get(`/api/teacher/students/${s1id}`)).status, 403);

  const imgId = env.q.one('SELECT id FROM record_images LIMIT 1').id;
  const c1 = client(env.base);
  await c1.login('c1', 'password1-updated');
  assert.equal((await c1.get(`/api/files/images/${imgId}`)).status, 403);
  assert.equal((await c1.get('/api/teacher/classes')).status, 403);

  const s3 = client(env.base);
  await s3.login('s3', 'password3');
  const themeId = env.q.one('SELECT id FROM themes LIMIT 1').id;
  assert.equal((await s3.get(`/api/student/themes/${themeId}`)).status, 404);
  assert.equal((await s3.get(`/api/files/images/${imgId}`)).status, 403);
});

test('企業レポート：少人数の学校別数値は非表示、個人の文章は含まない', async () => {
  const c1 = client(env.base);
  await c1.login('c1', 'password1-updated');
  const r = await c1.get('/api/company/report');
  assert.equal(r.status, 200);
  const t = r.data.themes[0];
  assert.equal(t.views, 1);
  assert.equal(t.bySchool[0].suppressed, true);
  assert.ok(!JSON.stringify(r.data).includes('眠れない'));
  assert.ok(!JSON.stringify(r.data).includes('テスト高校'));
});

test('授業後アンケート・KPI集計', async () => {
  const t1 = client(env.base);
  await t1.login('t1', 'password1-updated');
  const pend = await t1.get('/api/teacher/lesson-surveys');
  assert.equal(pend.data.pending.length, 1);
  const bad = await t1.post('/api/teacher/lesson-surveys', { distributionId: pend.data.pending[0].distributionId, answers: { ease: 9 } });
  assert.equal(bad.status, 400);
  const ok = await t1.post('/api/teacher/lesson-surveys', { distributionId: pend.data.pending[0].distributionId, answers: { ease: 4, reaction: 5, prep_minutes: '15分未満' } });
  assert.equal(ok.status, 200);

  const k = await admin.get('/api/admin/kpi');
  const get = (id) => k.data.kpis.find((x) => x.id === id);
  assert.equal(get('K-S1').value, 1);
  assert.equal(get('K-S4').value, 1);
  assert.equal(get('K-S5').value, 4);
  assert.equal(get('K-C1').value, 1);
  assert.equal(get('K-C3').value, 1);
  assert.equal(get('K-X1').value, 1);
});

test('副担任mirAI連携データ：画像・要確認フラグを含まず、必須項目を出力', async () => {
  const { buildExportDataset, renderExport, linkFillRate } = await import('../server/export.js');
  const ds = await buildExportDataset({ from: shift(today, -5), to: today, withAiSummary: true });
  assert.equal(ds.records.length, 1);
  const json = renderExport(ds, 'json').content;
  assert.ok(!/concern|image|record_images/.test(json));
  const csv = renderExport(ds, 'csv').content;
  assert.ok(csv.startsWith('\uFEFFpseudo_id'));
  const fill = linkFillRate(ds);
  assert.equal(fill.rate, 1);
});

test('CSVインジェクション対策', async () => {
  const { toCsv } = await import('../server/lib/csv.js');
  const out = toCsv([{ label: 'a', key: 'a' }], [{ a: '=HYPERLINK("x")' }]);
  assert.ok(out.includes(`"'=HYPERLINK(""x"")"`));
});
