import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
test('探究デモは既存記録を維持し冪等、本人申告や継続率を生成せず、本番・別学校では拒否する', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-journey-seed-'));
  process.env.DATA_DIR = dir;
  const { openDb, getDb, q } = await import('../server/db.js');
  const { ensureJourneySchema } = await import('../server/journey.js');
  openDb(path.join(dir, 'mirai-next.db'));
  try {
    q.run("INSERT INTO schools(id,code,name) VALUES(1,'DEMO-A','架空の学校')");
    q.run("INSERT INTO classes(id,school_id,grade,name) VALUES(1,1,2,'A')");
    q.run("INSERT INTO users(id,login_id,password_hash,role,school_id,class_id) VALUES(1,'s-aa-01','unused-test-hash','student',1,1)");
    q.run("INSERT INTO users(id,login_id,password_hash,role,school_id) VALUES(2,'t-a','unused-test-hash','teacher',1)");
    q.run('INSERT INTO teacher_classes(teacher_id,class_id) VALUES(2,1)');
    q.run("INSERT INTO settings(key,value) VALUES('demo_user_ids','[1,2]')");
    ensureJourneySchema();
    const originalFields = JSON.stringify({ purpose: '既存の入力は残す', interest: '自分が書いた内容' });
    q.run("INSERT INTO journey_entries(user_id,stage,entry_date,fields,voluntary,created_at,updated_at) VALUES(1,1,'2026-09-01',?,1,'2026-09-01','2026-09-01')", originalFields);
    const run = patch => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/seed-journey.js'], { cwd: root, env: { ...process.env, DATA_DIR: dir, NODE_ENV: 'development', DEMO_MODE: 'true', ...patch }, encoding: 'utf8' });
    const first = run({}); assert.equal(first.status, 0, first.stderr);
    assert.equal(q.one('SELECT COUNT(*) n FROM journey_entries').n, 5);
    assert.equal(q.one('SELECT fields FROM journey_entries WHERE id=1').fields, originalFields);
    for (const row of q.all('SELECT fields,voluntary FROM journey_entries WHERE id!=1')) {
      assert.equal(row.voluntary, 0);
      assert.ok(Object.values(JSON.parse(row.fields)).every(value => value.startsWith('【架空デモ】')));
    }
    assert.equal(q.one('SELECT COUNT(*) n FROM journey_notes').n, 1);
    assert.match(q.one('SELECT body FROM journey_notes').body, /^【架空デモ】/);
    assert.equal(q.one('SELECT COUNT(*) n FROM journey_teacher_surveys').n, 0);
    assert.equal(run({}).status, 0);
    assert.equal(q.one('SELECT COUNT(*) n FROM journey_entries').n, 5);
    assert.equal(q.one('SELECT COUNT(*) n FROM journey_notes').n, 1);
    assert.equal(run({ NODE_ENV: 'production' }).status, 1);
    assert.equal(run({ DEMO_MODE: 'false' }).status, 1);
    q.run("UPDATE schools SET code='REAL-SCHOOL' WHERE id=1");
    assert.equal(run({}).status, 1, '登録済みマーカーがあっても別学校は拒否');
    assert.equal(q.one('SELECT COUNT(*) n FROM journey_entries').n, 5);
  } finally { getDb().close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
