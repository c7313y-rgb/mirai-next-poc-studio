// Append fictional four-step examples only to the explicitly marked development demo.
import { pathToFileURL } from 'node:url';
import { config } from '../server/config.js';
import { q, tx, nowIso, parseJson } from '../server/db.js';
import { ensureJourneySchema } from '../server/journey.js';
import { jstDate, addDays } from '../server/lib/time.js';

const SEED_KEY = 'journey_demo_seed_v1';
export function seedJourneyDemo() {
  // Validate the environment and identities before checking idempotency or creating tables.
  if (!config.demoMode || process.env.DEMO_MODE !== 'true' || config.isProd || process.env.NODE_ENV === 'production') {
    throw new Error('探究デモは DEMO_MODE=true の非production環境でのみ追加できます。');
  }
  const student = q.one("SELECT u.* FROM users u JOIN schools s ON s.id=u.school_id WHERE u.login_id='s-aa-01' AND u.role='student' AND u.active=1 AND s.code='DEMO-A'");
  const teacher = q.one("SELECT u.* FROM users u JOIN schools s ON s.id=u.school_id WHERE u.login_id='t-a' AND u.role='teacher' AND u.active=1 AND s.code='DEMO-A'");
  const demoIds = parseJson(q.one("SELECT value FROM settings WHERE key='demo_user_ids'")?.value, []);
  if (!student || !teacher || student.school_id !== teacher.school_id || !Array.isArray(demoIds) || !demoIds.includes(student.id) || !demoIds.includes(teacher.id) || !q.one('SELECT 1 FROM teacher_classes WHERE teacher_id=? AND class_id=?', teacher.id, student.class_id)) {
    throw new Error('DEMO-Aの既知のデモ生徒・担当教員が確認できません。先にデモ基本データを用意してください。');
  }
  if (q.one('SELECT value FROM settings WHERE key=?', SEED_KEY)) return { skipped: true };
  ensureJourneySchema();
  const today = jstDate();
  const examples = [
    { stage: 1, date: addDays(today, -18), fields: {
      purpose: '【架空デモ】食べられる野菜が売れ残るのはなぜか、作る人と買う人の両方の立場から考えたい。',
      interest: '【架空デモ】手帳を読み返すと、給食や買い物の場面で食べ物が残ることを何度も気にしていた。自分は「もったいない」を仕組みから考えることに関心がありそうだ。',
    } },
    { stage: 2, date: addDays(today, -14), fields: {
      theme: '【架空デモ】規格外の野菜が生まれる理由と、無理なく届け続ける方法を探究テーマに選ぶ。安くすれば解決するのかを確かめたい。',
      plan: '【架空デモ】架空のフィールドワーク計画として、野菜を分ける作業を観察し、作り手役に「選別で迷う場面」「運ぶ手間」「続けるための条件」を聞く。実際の受入先や訪問予約はまだない。',
    } },
    { stage: 3, date: addDays(today, -7), fields: {
      observation: '【架空デモ】模擬体験の設定では、形の違う野菜を別に詰める作業にも時間がかかっていた。作り手役から、届け先を増やすほど運ぶ手間も増えると聞いた。実際の訪問実績ではない。',
      emotionShift: '【架空デモ】最初は「捨てずに安く売ればよい」と考えていた。手間を聞いて、善意だけでは続けられないことに戸惑った。作る人の負担も含めて考え直したくなった。',
      notebookQuestion: '【架空デモ】今夜は紙の手帳に、「私の案で誰の負担が増えるのか」「続けられる条件は何か」を書き、事実と自分の気持ちを分けて整理する。',
    } },
    { stage: 4, date: addDays(today, -1), fields: {
      nextAction: '【架空デモ】次の一歩として、家庭で野菜を選ぶときの理由を一週間観察し、買う人に役立つ情報を三つ考える。手帳の記録を先生と見て、調べる範囲を相談する。',
      aspirationBasis: '【架空デモ】食べ物を無駄にしない仕組みに関わりたいと思う。模擬体験で作り手の手間を知り、値段だけで判断できないと気づいたことが理由。ただし進路や職業を決めたわけではなく、まず小さく確かめたい。',
    } },
  ];
  return tx(() => {
    const at = nowIso();
    const entryIds = examples.map(e => Number(q.run('INSERT INTO journey_entries(user_id,stage,entry_date,fields,record_ids,voluntary,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)', student.id, e.stage, e.date, JSON.stringify(e.fields), '[]', at, at).lastInsertRowid));
    const noteId = Number(q.run("INSERT INTO journey_notes(student_id,teacher_id,body,planned_date,status,created_at,updated_at) VALUES(?,?,?,?,'planned',?,?)", student.id, teacher.id, '【架空デモ】次の面談では、作り手の手間を聞いて考えが変わった場面を、紙の手帳を見ながら話しましょう。答えを急がず、次に確かめたいことを一つ選んでみてください。', addDays(today, 7), at, at).lastInsertRowid);
    const result = { skipped: false, entryCount: 4, noteCount: 1, entryIds, noteId };
    q.run('INSERT INTO settings(key,value) VALUES(?,?)', SEED_KEY, JSON.stringify({ ...result, synthetic: true, voluntaryExcluded: true, seededAt: at }));
    return result;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = seedJourneyDemo();
    console.log(result.skipped ? '探究デモは登録済みです。既存記録を維持しました。' : '【架空デモ】探究4段階の記録4件と共有面談メモ1件を追加しました。既存記録は保持しました。');
    if (!result.skipped) console.log('自発的記述・教員継続希望の実績は生成していません。生徒 s-aa-01／教員 t-a で確認できます。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
