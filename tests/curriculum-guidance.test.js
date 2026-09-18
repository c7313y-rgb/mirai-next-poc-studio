import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bootstrap, client } from './helpers.js';

let env, company, otherCompany, teacher, student, classId;
let original, adopted, lesson;
let generateCurriculum, extractMaterial, buildAlignment;
const source = {
  title: '工場の廃棄熱を地域で生かす', audience: '高校2年生', subject: '総合的な探究の時間', duration: 50,
  schoolLevel: 'high', guidelineId: 'high_inquiry',
  sourceContent: `${'工場では身近な製品を作っています。'.repeat(70)}\n調査では毎日80度の廃棄熱が出ています。\n課題：廃棄熱の回収には50万円の予算制約があります。\n問い：地域の入浴施設で熱を生かすには、誰と何を確かめる必要がありますか？`,
};

before(async () => {
  env = await bootstrap();
  ({ generateCurriculum } = await import('../server/curriculum.js'));
  ({ extractMaterial, buildAlignment } = await import('../server/curriculum-guidance.js'));
  const { importUsers } = await import('../server/lib/users.js');
  importUsers([
    { role: 'teacher', login_id: 'guide-t', school_code: 'GUIDE', school_name: '架空高校', teacher_classes: '2-A' },
    { role: 'student', login_id: 'guide-s', school_code: 'GUIDE', grade: '2', class: 'A', attendance_no: '1' },
    { role: 'company', login_id: 'guide-c', company_code: 'GUIDE-C', company_name: '架空企業', company_industry: '製造業' },
    { role: 'company', login_id: 'guide-other', company_code: 'GUIDE-OTHER', company_name: '別企業', company_industry: '食品業' },
  ].map((r, i) => ({ ...r, __line: i + 2, password: 'guidance-pass-123' })));
  env.q.run('UPDATE users SET must_change_password=0');
  const login = async id => { const c = client(env.base); assert.equal((await c.login(id, 'guidance-pass-123')).status, 200); return c; };
  company = await login('guide-c'); otherCompany = await login('guide-other'); teacher = await login('guide-t'); student = await login('guide-s');
  classId = env.q.one("SELECT id FROM classes WHERE name='A'").id;
});
after(async () => {
  if (!env) return;
  await new Promise(resolve => env.server.close(resolve));
  const { getDb } = await import('../server/db.js');
  getDb().close();
  fs.rmSync(env.dir, { recursive: true, force: true });
});

test('全文の末尾にある課題・問い・数値を根拠番号付きで教材化する', () => {
  const material = extractMaterial(source.sourceContent);
  assert.equal(material.processedCharacters, source.sourceContent.length);
  assert.ok(material.fragments.some(fragment => fragment.start > 700 && fragment.text.includes('50万円')));
  for (const fragment of material.fragments) assert.equal(source.sourceContent.slice(fragment.start, fragment.end), fragment.text);
  const curriculum = generateCurriculum(source);
  assert.ok(curriculum.stages.some(stage => stage.activity.includes('50万円')));
  assert.ok(curriculum.stages.some(stage => stage.activity.includes('地域の入浴施設')));
  assert.match(curriculum.stages[1].activity, /\[S\d+\]/);
  assert.equal(curriculum.sourceContent, source.sourceContent);
  assert.equal(curriculum.stages.reduce((sum, s) => sum + s.minutes, 0), 50);
});

test('中学総合・高校総合探究・情報Ⅰは別の焦点と公式出典を持つ候補になる', () => {
  const high = buildAlignment(source);
  const middle = buildAlignment({ ...source, schoolLevel: 'middle', guidelineId: 'middle_integrated', subject: '総合的な学習の時間' });
  const information = buildAlignment({ ...source, guidelineId: 'high_information', subject: '情報Ⅰ' });
  for (const alignment of [high, middle, information]) {
    assert.equal(alignment.pillars.length, 3);
    assert.equal(alignment.processes.length, 4);
    assert.equal(alignment.review.status, 'pending');
    assert.ok(alignment.sourceReferences.every(ref => new URL(ref.url).hostname === 'www.mext.go.jp' && ref.section));
    assert.match(alignment.note, /自動適合判定.*ではありません/);
  }
  assert.notEqual(high.focus, middle.focus);
  assert.match(information.pillars[0].objective, /個人情報/);
  assert.match(middle.sourceReferences[0].section, /付録4/);
});

test('企業は対応案を編集して提供でき、他社・生徒は変更できない', async () => {
  assert.equal((await student.get('/api/learning/curriculum-guidance')).status, 403);
  const catalog = (await company.get('/api/learning/curriculum-guidance')).data;
  assert.equal(catalog.profiles.length, 3);
  assert.equal((await company.post('/api/learning/curricula/generate', { ...source, schoolLevel: 'middle' })).status, 400);
  original = (await company.post('/api/learning/curricula/generate', source)).data.curriculum;
  assert.equal(original.alignment.review.status, 'pending');
  const changed = { ...original, alignment: { ...original.alignment, sourceReferences: [{ url: 'https://example.com/fake', title: '偽の根拠' }], pillars: original.alignment.pillars.map((p, i) => i ? p : { ...p, evidence: '資料番号付きの廃棄熱調査表' }) } };
  assert.equal((await otherCompany.put(`/api/learning/curricula/${original.id}`, changed)).status, 403);
  assert.equal((await student.post(`/api/learning/curricula/${original.id}/guidance-preview`, source)).status, 403);
  original = (await company.put(`/api/learning/curricula/${original.id}`, changed)).data.curriculum;
  assert.equal(original.alignment.pillars[0].evidence, '資料番号付きの廃棄熱調査表');
  assert.ok(original.alignment.sourceReferences.every(ref => ref.url.startsWith('https://www.mext.go.jp/')));
  const invalid = { ...original, alignment: { ...original.alignment, processes: [{ ...original.alignment.processes[0], stageIndex: 99 }, ...original.alignment.processes.slice(1)] } };
  assert.equal((await company.put(`/api/learning/curricula/${original.id}`, invalid)).status, 400);
  await company.post(`/api/learning/curricula/${original.id}/publish`, {});
});

test('教員採用で対応案を保持し、自校目標と明示確認を保存した後だけ承認できる', async () => {
  adopted = (await teacher.post(`/api/learning/curricula/${original.id}/adopt`, {})).data.curriculum;
  assert.equal(adopted.alignment.pillars[0].evidence, '資料番号付きの廃棄熱調査表');
  assert.equal(adopted.alignment.review.status, 'pending');
  assert.equal((await teacher.post(`/api/learning/curricula/${adopted.id}/approve`, {})).status, 409);
  assert.equal((await teacher.post(`/api/learning/curricula/${adopted.id}/approve`, { alignmentConfirmed: true })).status, 409);
  adopted = (await teacher.put(`/api/learning/curricula/${adopted.id}`, { ...adopted, alignment: { ...adopted.alignment, schoolGoal: '地域の未利用資源を根拠に基づいて調べて提案する', unitPosition: '2学期地域探究の第1時。次時に聞き取り調査を実施する' } })).data.curriculum;
  assert.equal((await company.post(`/api/learning/curricula/${adopted.id}/approve`, { alignmentConfirmed: true })).status, 403);
  adopted = (await teacher.post(`/api/learning/curricula/${adopted.id}/approve`, { alignmentConfirmed: true, reviewNote: '校内の単元計画と評価資料を確認' })).data.curriculum;
  assert.equal(adopted.alignment.review.status, 'confirmed');
  assert.ok(adopted.alignment.review.confirmedBy);
  assert.ok(adopted.alignment.review.confirmedAt);
  const created = await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId });
  assert.equal(created.status, 201);
  lesson = created.data.lesson;
  assert.equal(lesson.alignment.schoolGoal, adopted.alignment.schoolGoal);
});

test('編集すると確認を解除し、再承認前は配信不可。作成済授業の根拠は変わらない', async () => {
  const previous = lesson.alignment.schoolGoal;
  const edited = (await teacher.put(`/api/learning/curricula/${adopted.id}`, { ...adopted, alignment: { ...adopted.alignment, schoolGoal: '別の地域課題から問いを考える' } })).data.curriculum;
  assert.equal(edited.status, 'draft');
  assert.equal(edited.alignment.review.status, 'pending');
  assert.equal(edited.alignment.review.confirmedBy, null);
  assert.equal((await teacher.post('/api/learning/lessons', { curriculumId: adopted.id, classId })).status, 403);
  assert.equal((await teacher.get(`/api/learning/lessons/${lesson.id}`)).data.lesson.alignment.schoolGoal, previous);
  assert.equal('alignment' in (await student.get(`/api/learning/lessons/${lesson.id}`)).data.lesson, false, '教員確認者IDなどの内部情報は生徒へ返さない');
  const preview = await teacher.post(`/api/learning/curricula/${adopted.id}/guidance-preview`, { ...source, schoolLevel: 'middle', guidelineId: 'middle_integrated' });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.alignment.schoolLevel, 'middle');
  assert.equal((await company.get('/api/learning/curricula')).data.curricula[0].alignment.schoolLevel, 'high', '教員の変更は企業原本に影響しない');
});

test('既存DBに列を追加しても教材・授業を保持し、従来教材は要確認候補へ補完する', async () => {
  const { getDb, openDb } = await import('../server/db.js');
  const count = env.q.one('SELECT COUNT(*) n FROM curricula').n;
  getDb().close();
  const file = path.join(env.dir, 'test.db');
  const legacy = new DatabaseSync(file);
  legacy.exec('ALTER TABLE curricula DROP COLUMN alignment');
  legacy.close();
  openDb(file);
  assert.equal(env.q.one('SELECT COUNT(*) n FROM curricula').n, count);
  assert.equal(env.q.one('SELECT COUNT(*) n FROM lessons').n, 1);
  const dto = (await company.get('/api/learning/curricula')).data.curricula[0];
  assert.equal(dto.alignment.review.status, 'pending');
  assert.equal(dto.alignment.pillars.length, 3);
});
