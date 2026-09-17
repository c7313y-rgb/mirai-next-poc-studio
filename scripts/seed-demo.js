// デモ・操作確認用データ（実データを入れた環境では実行しないこと）
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';
import { openDb, q } from '../server/db.js';
import { hashPassword } from '../server/lib/password.js';
import { importUsers } from '../server/lib/users.js';
import { saveSettings } from '../server/settings.js';
import { DEFAULT_SURVEYS } from '../server/lib/surveys.js';
import { jstDate, addDays } from '../server/lib/time.js';
import { mockProvider } from '../server/ai/mock.js';

const dbFile = path.join(config.dataDir, 'mirai-next.db');
if (fs.existsSync(dbFile)) {
  if (!process.argv.includes('--force')) { console.error('DBが既に存在します。上書きする場合は npm run seed:demo -- --force'); process.exit(1); }
  for (const f of ['', '-wal', '-shm']) fs.rmSync(dbFile + f, { force: true });
  fs.rmSync(path.join(config.dataDir, 'uploads'), { recursive: true, force: true });
}
openDb();
const today = jstDate();
const pocStart = addDays(today, -42);
saveSettings({ poc_start: pocStart, poc_end: addDays(today, 70), excluded_periods: [] });
for (const s of DEFAULT_SURVEYS) q.run('INSERT INTO surveys(title, kind, questions) VALUES(?,?,?)', s.title, s.kind, JSON.stringify(s.questions));

const PW = 'demo1234';
const rows = [];
const schools = [['DEMO-A', 'デモ第一高等学校'], ['DEMO-B', 'デモ南高等学校'], ['DEMO-C', 'デモ総合高等学校']];
let line = 2;
schools.forEach(([code, name], si) => {
  const classes = si === 0 ? ['A', 'B'] : ['A'];
  rows.push({ __line: line++, role: 'teacher', login_id: `t-${code.slice(-1).toLowerCase()}`, password: PW, school_code: code, school_name: name, display_name: `${name.slice(2, 4)}先生`, teacher_classes: classes.map((c) => `2-${c}`).join('|') });
  for (const c of classes) for (let n = 1; n <= 12; n++) {
    rows.push({ __line: line++, role: 'student', login_id: `s-${code.slice(-1).toLowerCase()}${c.toLowerCase()}-${String(n).padStart(2, '0')}`, password: PW, school_code: code, school_name: name, grade: '2', class: c, attendance_no: String(n) });
  }
});
const companies = [
  ['CO-01', '株式会社みらい精工', 'ものづくり・工学'], ['CO-02', 'あおば食品株式会社', '食・農業'], ['CO-03', 'さくら地域交通株式会社', '観光・交通'],
  ['CO-04', 'ひかりケアサービス株式会社', '医療・看護・福祉'], ['CO-05', 'つばさデジタル株式会社', '情報・デジタル'],
];
companies.forEach(([code, name, ind], i) => rows.push({ __line: line++, role: 'company', login_id: `c-${String(i + 1).padStart(2, '0')}`, password: PW, company_code: code, company_name: name, company_industry: ind, display_name: `${name} 人事担当` }));
const res = importUsers(rows);
if (res.errors.length) { console.error(res.errors); process.exit(1); }
q.run("UPDATE users SET must_change_password=0");
q.run("INSERT INTO users(login_id, password_hash, role, display_name) VALUES('admin', ?, 'admin', '運営（デモ）')", hashPassword(PW));
q.run('UPDATE schools SET start_date=?', pocStart);

const themeDefs = [
  [1, '工場の「人手不足」をロボットと人で解決するには？', ['ロボットに任せたい仕事・人がやるべき仕事は？', 'あなたの身近で人手が足りない場所は？', '10年後の工場で働く人は何をしている？']],
  [2, '地元の野菜を、高校生が買いたくなる商品にする', ['なぜ地元の野菜は売れ残るのか？', '高校生が「買いたい」と思う条件は？', 'あなたならどんな商品にする？']],
  [3, '路線バスがなくなる町で、移動をどう守る？', ['バスが1日3本になったら誰が困る？', '移動の手段は他に何がある？', '町の人の声をどう集める？']],
  [4, '「介護の仕事」のイメージは本当？', ['介護の仕事にどんなイメージを持っている？', 'テクノロジーで変えられる部分はどこ？', '自分の家族に置き換えて考えると？']],
  [5, 'AIで学校の困りごとを1つ減らす', ['学校で「もったいない時間」はどこ？', 'AIに任せていいこと・だめなことは？', '先生と生徒の両方が得する仕組みは？']],
];
const themeIds = themeDefs.map(([co, title, qs]) => Number(q.run(
  "INSERT INTO themes(company_id, title, summary, questions, worksheet, materials, field, status, published_at) VALUES(?,?,?,?,?,?,?, 'published', ?)",
  co, title, `${companies[co - 1][1]}の現場で実際に起きている課題をもとに、自分ならどうするかを考えます。`, JSON.stringify(qs),
  '導入5分：企業からの問いかけ動画\n個人ワーク15分：問いを手帳に書く\nグループ20分：アイデア共有\n振り返り10分：手帳に今日の気づきを書く',
  JSON.stringify([{ label: '企業紹介動画（3分）', url: 'https://example.com/video' }]), companies[co - 1][2], new Date(Date.now() - 45 * 86400_000).toISOString(),
).lastInsertRowid));

const classes = q.all('SELECT c.*, s.code FROM classes c JOIN schools s ON s.id=c.school_id');
const teachers = q.all("SELECT u.id, tc.class_id FROM users u JOIN teacher_classes tc ON tc.teacher_id=u.id");
classes.forEach((c, i) => {
  const tid = teachers.find((t) => t.class_id === c.id).id;
  for (let k = 0; k < 3; k++) {
    const th = themeIds[(i + k) % themeIds.length];
    const d = q.run('INSERT INTO distributions(theme_id, class_id, teacher_id, start_date, end_date) VALUES(?,?,?,?,?)', th, c.id, tid, addDays(pocStart, k * 14), addDays(today, 30));
    if (k < 2) q.run('INSERT INTO survey_responses(survey_id, user_id, distribution_id, answers, created_at) VALUES((SELECT id FROM surveys WHERE kind=\'lesson\'),?,?,?,?)', tid, d.lastInsertRowid, JSON.stringify({ ease: 3 + ((i + k) % 3), reaction: 4, prep_minutes: '15〜30分', comment: 'テーマの問いが具体的で進めやすかった' }), new Date().toISOString());
  }
});

const texts = [
  '今日の探究で工場の人手不足の話を聞いた。ロボットに任せる仕事と人がやる仕事を分けるのがおもしろいと思った。',
  '地元の野菜が売れ残る理由は、見た目と値段だけじゃないと思った。高校生向けのパッケージを考えてみたい。',
  'バスが減るとおばあちゃんが病院に行けなくなる。移動を守る仕組みを町の人と一緒に考えたい。',
  '介護の仕事は大変なイメージだったけど、テクノロジーで変えられる部分もあると知った。',
  'AIで学校の困りごとを減らせるか考えた。提出物の管理は自動化できそう。プログラムを作ってみたい。',
  '部活の大会で負けてくやしかった。でも最後まで声を出せた。次の練習メニューを自分で考える。',
  '職場体験で保育園に行った。子どもに合わせて説明を変える先生がすごかった。',
  '最近眠れない日が続いていてつらい。部活と勉強の両立がしんどい。',
];
const students = q.all("SELECT * FROM users WHERE role='student' ORDER BY id");
const rnd = (() => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
for (const [idx, st] of students.entries()) {
  const engagement = rnd();
  const classThemes = q.all('SELECT DISTINCT theme_id FROM distributions WHERE class_id=?', st.class_id).map((x) => x.theme_id);
  for (const th of classThemes) {
    if (rnd() < 0.85) {
      q.run('INSERT INTO theme_views(theme_id, user_id, first_viewed_at, view_count) VALUES(?,?,?,?)', th, st.id, new Date(Date.now() - rnd() * 40 * 86400_000).toISOString(), 1 + Math.floor(rnd() * 3));
      if (rnd() < 0.42) q.run('INSERT INTO theme_interests(theme_id, user_id, created_at) VALUES(?,?,?)', th, st.id, new Date().toISOString());
    }
  }
  for (let d = 41; d >= 0; d -= 3) {
    if (rnd() > engagement * (d > 28 ? 0.9 : 0.55)) continue;
    let ti = Math.floor(rnd() * 7);
    const type = ti < 5 ? 'theme' : ti === 6 ? 'experience' : 'reflection';
    const themeId = type === 'theme' ? classThemes[Math.floor(rnd() * classThemes.length)] : null;
    const text = type === 'theme' ? texts[(themeIds.indexOf(themeId) + 5) % 5] : texts[ti];
    const a = await mockProvider.analyze({ text });
    const at = new Date(Date.now() - d * 86400_000 - rnd() * 8 * 3600_000).toISOString();
    q.run(`INSERT INTO records(user_id, school_id, class_id, type, theme_id, experience_date, ocr_status, ocr_text, final_text, status, ai_status, feedback, tags, summary, created_at, submitted_at)
      VALUES(?,?,?,?,?,?, 'done', ?, ?, 'submitted', 'done', ?, ?, ?, ?, ?)`, st.id, st.school_id, st.class_id, type, themeId, type === 'experience' ? at.slice(0, 10) : null, text, text, a.feedback, JSON.stringify(a.tags), a.summary, at, at);
  }
  if (idx === 3) {
    const at = new Date(Date.now() - 86400_000).toISOString();
    const rec = q.run(`INSERT INTO records(user_id, school_id, class_id, type, ocr_status, ocr_text, final_text, status, ai_status, feedback, tags, summary, concern_flag, concern_reason, created_at, submitted_at)
      VALUES(?,?,?, 'reflection', 'done', ?, ?, 'submitted', 'done', ?, '[]', ?, 1, ?, ?, ?)`, st.id, st.school_id, st.class_id, texts[7], texts[7], '書いてくれてありがとう。無理しすぎないでね。', '睡眠不足と両立のしんどさ', '心身の不調・困りごとを示す可能性のある記述', at, at);
    q.run("INSERT INTO alerts(school_id, class_id, student_id, record_id, kind, reason) VALUES(?,?,?,?, 'concern', '心身の不調・困りごとを示す可能性のある記述')", st.school_id, st.class_id, st.id, rec.lastInsertRowid);
  }
  if (rnd() < 0.55) q.run("INSERT INTO survey_responses(survey_id, user_id, answers) VALUES((SELECT id FROM surveys WHERE kind='student'),?,?)", st.id, JSON.stringify({ overall: 3 + Math.floor(rnd() * 3), theme: 3 + Math.floor(rnd() * 3), ease: 4, comment: rnd() < 0.5 ? '撮るだけなので続けやすい' : 'テーマをもっと選びたい' }));
}
const contUsers = q.all("SELECT id, company_id FROM users WHERE role='company' ORDER BY id");
contUsers.slice(0, 3).forEach((u, i) => q.run("INSERT INTO survey_responses(survey_id, user_id, answers) VALUES((SELECT id FROM surveys WHERE kind='continuation'),?,?)", u.id, JSON.stringify({ continue: i < 2 ? 'yes' : 'maybe', value: 4, burden: 4, request: '生徒の声をもう少し具体的に知りたい' })));
q.run("INSERT INTO voice_summaries(theme_id, summary, source_count, status, generated_at, approved_at) VALUES(?,?,?, 'approved', ?, ?)", themeIds[0], JSON.stringify({ summary: '人手不足をロボットだけで解決するのではなく、人が担う仕事の価値を考える生徒が多く見られました。', points: ['ロボットと人の役割分担への関心', '身近な職場の人手不足への気づき', '将来の働き方への具体的な想像'], suggestion: '現場で働く人の1日の動画があると、問いが深まりやすくなります。' }), 12, new Date().toISOString(), new Date().toISOString());

q.run("INSERT OR REPLACE INTO settings(key,value) VALUES('demo_user_ids',?)", JSON.stringify(q.all('SELECT id FROM users').map(u => u.id)));
console.log('デモデータを作成しました（DEMO_MODE=trueで利用可・パスワードはすべて demo1234）');
console.log('  運営: admin / 教員: t-a（第一高2年A・B）, t-b, t-c / 生徒: s-aa-01 など / 企業: c-01〜c-05');
