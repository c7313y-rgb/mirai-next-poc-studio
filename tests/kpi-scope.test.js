import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getDb, q } from '../server/db.js';
import { saveSettings } from '../server/settings.js';
import { computeKpis } from '../server/kpi.js';
import { buildExportDataset, renderExport, linkFillRate } from '../server/export.js';

const PERIOD = { from: '2026-09-01', to: '2026-09-30', today: '2026-10-01' };
const iso = (date) => `${date}T03:00:00.000Z`;
const get = (data, id) => data.kpis.find((k) => k.id === id);

beforeEach(() => {
  openDb(':memory:');
  saveSettings({ poc_start: '2026-08-01', poc_end: '2026-10-31', excluded_periods: [] });
  q.run("INSERT INTO schools(id,code,name,start_date) VALUES(1,'S1','第1高校','2026-08-01'),(2,'S2','第2高校','2026-08-01')");
  q.run("INSERT INTO classes(id,school_id,grade,name) VALUES(1,1,1,'A'),(2,2,1,'B')");
  q.run("INSERT INTO companies(id,code,name) VALUES(1,'C1','第1企業'),(2,'C2','第2企業')");
  q.run("INSERT INTO users(id,login_id,password_hash,role,school_id,class_id,pseudo_id) VALUES(1,'s1','test','student',1,1,'TEST-S1'),(2,'s2','test','student',2,2,'TEST-S2'),(3,'s3','test','student',1,1,'TEST-S3'),(4,'s4','test','student',1,1,'TEST-S4')");
  q.run("INSERT INTO users(id,login_id,password_hash,role,company_id) VALUES(5,'c1','test','company',1),(6,'c2','test','company',2)");
  q.run("INSERT INTO users(id,login_id,password_hash,role,school_id) VALUES(7,'t1','test','teacher',1)");
  q.run("INSERT INTO themes(id,company_id,title,status,published_at,created_at) VALUES(1,1,'テーマA','published',?,?),(2,2,'テーマB','published',?,?)", iso('2026-08-01'), iso('2026-08-01'), iso('2026-08-01'), iso('2026-08-01'));
  q.run("INSERT INTO distributions(id,theme_id,class_id,teacher_id,start_date,end_date) VALUES(1,1,1,7,'2026-09-01','2026-09-30'),(2,2,1,7,'2026-09-01','2026-09-30')");
});

afterEach(() => getDb().close());

function record({ user = 1, theme = 1, date = '2026-09-15', tags = ['情報・デジタル'], summary = '期間内の学び', text = '記録本文' } = {}) {
  const school = user === 2 ? 2 : 1;
  return Number(q.run("INSERT INTO records(user_id,school_id,class_id,type,theme_id,status,final_text,tags,summary,submitted_at) VALUES(?,?,?,?,?,'submitted',?,?,?,?)", user, school, school, theme ? 'theme' : 'reflection', theme, text, JSON.stringify(tags), summary, iso(date)).lastInsertRowid);
}

function survey(kind, user, answer, date, distribution = 0) {
  const id = q.run('INSERT INTO surveys(title,kind,questions) VALUES(?,?,?)', 'テスト調査', kind, '[]').lastInsertRowid;
  q.run('INSERT INTO survey_responses(survey_id,user_id,distribution_id,answers,created_at) VALUES(?,?,?,?,?)', id, user, distribution, JSON.stringify(answer), iso(date));
}

test('K-X1: 平均が目標以上でも、1テーマでも20件未満なら未達', async () => {
  for (let i = 0; i < 40; i++) record();
  let data = await computeKpis(PERIOD);
  assert.equal(get(data, 'K-X1').average, 20);
  assert.equal(get(data, 'K-X1').value, 0);
  assert.equal(get(data, 'K-X1').achieved, false);
  for (let i = 0; i < 20; i++) record({ theme: 2 });
  data = await computeKpis(PERIOD);
  assert.equal(get(data, 'K-X1').value, 20);
  assert.equal(get(data, 'K-X1').achieved, true);
  assert.equal(get(data, 'K-X1').detail.length, 2);
});

test('K-X2: 学校フィルタを適用し、別の学校のデータで不足を埋めない', async () => {
  record({ theme: null, tags: [] });
  record({ user: 2, text: '他校のみの記録' });
  const all = await computeKpis(PERIOD);
  const scoped = await computeKpis({ ...PERIOD, schoolId: 1 });
  assert.equal(get(all, 'K-X2').value, 1);
  assert.ok(get(scoped, 'K-X2').value < 1);
  assert.equal(get(scoped, 'K-X2').detail.find((d) => d.key === 'interest_tags').filled, 0);
  assert.equal(get(scoped, 'K-X2').detail.find((d) => d.key === 'theme').applicable, 0);
  const data = await buildExportDataset({ ...PERIOD, schoolId: 1 });
  assert.equal(data.meta.school_id, 1);
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].school_code, 'S1');
  assert.equal(JSON.stringify(data).includes('他校のみの記録'), false);
});

test('K-C3: 期間内に初回閲覧した生徒×テーマだけを分母・分子にする', async () => {
  q.run('INSERT INTO theme_views(theme_id,user_id,first_viewed_at) VALUES(1,1,?),(1,2,?),(1,3,?),(1,4,?)', iso('2026-08-31'), '2026-08-31T15:00:00.000Z', iso('2026-09-15'), '2026-09-30T15:00:00.000Z');
  q.run('INSERT INTO theme_interests(theme_id,user_id,created_at) VALUES(1,1,?),(1,2,?),(1,3,?),(1,4,?)', iso('2026-09-05'), iso('2026-09-10'), '2026-09-30T15:00:00.000Z', iso('2026-09-10'));
  const data = await computeKpis(PERIOD);
  assert.equal(get(data, 'K-C3').value, 0.5);
  assert.match(get(data, 'K-C3').note, /初回閲覧した 2組/);
  const scoped = await computeKpis({ ...PERIOD, schoolId: 1 });
  assert.equal(get(scoped, 'K-C3').value, 0);
});

test('K-C4: 期間外回答を除外し、各社の期間内最終回答で判定する', async () => {
  survey('continuation', 5, { continue: 'yes' }, '2026-08-31');
  survey('continuation', 5, { continue: 'yes' }, '2026-09-05');
  survey('continuation', 5, { continue: 'no' }, '2026-09-25');
  survey('continuation', 5, { continue: 'yes' }, '2026-10-01');
  survey('continuation', 6, { continue: 'yes' }, '2026-09-10');
  const data = await computeKpis(PERIOD);
  assert.equal(get(data, 'K-C4').value, 0.5);
  assert.match(get(data, 'K-C4').note, /回答 2社/);
});

test('K-S3: 選択開始日より前の開始2週コホートを維持する', async () => {
  record({ user: 1, date: '2026-08-05' });
  record({ user: 3, date: '2026-08-07' });
  record({ user: 1, date: '2026-09-25' });
  const data = await computeKpis({ ...PERIOD, schoolId: 1 });
  assert.equal(get(data, 'K-S3').value, 0.5);
  assert.match(get(data, 'K-S3').note, /提出者 2名中/);
  assert.match(get(data, 'K-S3').note, /2026-09-17〜2026-09-30/);
});

test('K-S1: 開始前に実証を始めた学校も、終了日までの開始済み校に数える', async () => {
  record({ user: 2, date: '2026-08-05' });
  const data = await computeKpis(PERIOD);
  assert.equal(get(data, 'K-S1').value, 2);
  assert.match(get(data, 'K-S1').note, /開始日で絞らない/);
});

test('K-S2: 開始日の途中週を完全週と混ぜず、完全週がない場合だけ暫定集計する', async () => {
  record({ date: '2026-09-01' });
  const data = await computeKpis(PERIOD);
  assert.equal(data.weeks[0].partial, true);
  assert.equal(get(data, 'K-S2').value, 0);
  const partial = await computeKpis({ ...PERIOD, to: '2026-09-03' });
  assert.equal(get(partial, 'K-S2').value, 0.25);
  assert.match(get(partial, 'K-S2').note, /途中週の暫定値/);
});

test('K-S4/K-S5: 選択期間終了後に届いた授業回答を含めない', async () => {
  survey('lesson', 7, { ease: 4 }, '2026-09-10', 1);
  survey('lesson', 7, { ease: 1 }, '2026-10-01', 2);
  const data = await computeKpis(PERIOD);
  assert.equal(get(data, 'K-S4').value, 0.5);
  assert.equal(get(data, 'K-S5').value, 4);
});

test('K-C1/K-C2: 開始前公開テーマを累計し、未来の配信を学校実績に含めない', async () => {
  q.run("UPDATE distributions SET start_date='2026-10-01',end_date='2026-10-31' WHERE theme_id=2");
  const all = await computeKpis(PERIOD);
  assert.equal(get(all, 'K-C1').value, 2);
  assert.equal(get(all, 'K-C2').value, 2);
  const scoped = await computeKpis({ ...PERIOD, schoolId: 1 });
  assert.equal(get(scoped, 'K-C1').value, 1);
  assert.equal(get(scoped, 'K-C2').value, 1);
  assert.match(get(scoped, 'K-C2').note, /開始日で絞らない/);
});

test('連携出力: 期間外の回答・未来のコメントを含めず、JSONにも必須関連項目を保持', async () => {
  const id = record();
  q.run('INSERT INTO comments(record_id,teacher_id,body,created_at) VALUES(?,?,?,?),(?,?,?,?)', id, 7, '期間内コメント', iso('2026-09-20'), id, 7, '未来のコメント', iso('2026-10-01'));
  survey('student', 1, { overall: 4 }, '2026-09-20');
  survey('student', 1, { overall: 1 }, '2026-10-01');
  const data = await buildExportDataset({ ...PERIOD, schoolId: 1 });
  assert.deepEqual(data.records[0].teacher_comments, ['期間内コメント']);
  assert.deepEqual(JSON.parse(data.records[0].survey_answers), { overall: 4 });
  const json = JSON.parse(renderExport(data, 'json').content);
  assert.equal(json.students[0].grade_class, '1年A組');
  assert.equal(json.students[0].records[0].theme.company_id, 1);
});

test('データなし: 関心率・継続利用率・連携充足率を0%と誤認させない', async () => {
  const data = await computeKpis(PERIOD);
  for (const id of ['K-C3', 'K-S3', 'K-X2']) {
    assert.equal(get(data, id).value, null);
    assert.equal(get(data, id).achieved, null);
  }
  assert.equal(linkFillRate({ records: [] }).rate, null);
});
