// Synthetic learning demo. Run after seed-demo; reruns preserve all existing data.
import { pathToFileURL } from 'node:url';
import { q, tx, nowIso } from '../server/db.js';
import { generateCurriculum, insertCurriculum, publishCurriculum } from '../server/curriculum.js';
import { jstDate, addDays } from '../server/lib/time.js';

const SEED_KEY = 'learning_demo_seed_v1';
const examples = [
  {
    code: 'CO-01', title: '人とロボットが協力する、未来の工場を考えよう', subject: 'ものづくり・工学', duration: 50,
    sourceContent: '【架空の企業事例・デモ用】みらい精工は、小さな金属部品を作る工場です。検品と箱詰めには同じ動作の繰り返しがあり、繁忙期には作業者の負担が増えます。一方、形が少し違う部品への対応や不具合の原因を考える仕事には、人の観察と判断が必要です。ロボット導入には費用、設置場所、安全確認、担当者の学び直しが必要になります。作業の速さだけでなく、働く人の安心や品質も大切にしながら、人とロボットの役割分担を提案してください。',
  },
  {
    code: 'CO-02', title: '規格外の野菜から、地域に選ばれる新商品をつくる', subject: '食・農業', duration: 100,
    sourceContent: '【架空の企業事例・デモ用】あおば食品は地元農家の野菜を使う食品会社です。味に問題がなくても大きさや形が違う野菜が販売しにくくなることがあります。加工には人手、衛生管理、包装、運搬の費用がかかり、安く販売するだけでは事業を続けられません。高校生、子育て世帯、高齢者などの生活を想像し、誰にどんな価値を届けるか考えてください。食品ロスを減らす目標と、おいしさ、買いやすさ、事業の継続を両立する商品を提案します。',
  },
  {
    code: 'CO-03', title: 'バスが減るまちで、移動の選択肢を増やそう', subject: '観光・交通', duration: 50,
    sourceContent: '【架空の企業事例・デモ用】さくら地域交通は、通学、通院、買い物を支える路線バスを運営しています。利用者の減少と運転手の不足で、運行回数の見直しが必要です。利用者が少ない時間帯でもバスを必要とする人がいます。予約型の乗り合い、地域の施設との連携、路線や時刻の工夫などの方法がありますが、予約が苦手な人への配慮も必要です。移動を必要とする人の立場、運営費、安全性を比べ、地域で続けられる仕組みを考えてください。',
  },
  {
    code: 'CO-04', title: '介護の現場で、人にしかできない仕事を見つける', subject: '医療・看護・福祉', duration: 50,
    sourceContent: '【架空の企業事例・デモ用】ひかりケアサービスでは、高齢者の生活を支えるために介護職、看護職、家族が協力しています。記録や見守りの一部を技術で助けることができますが、本人の希望を聞くこと、安心できる声かけ、個人の尊厳への配慮が欠かせません。機器を使う費用や、利用者が操作に慣れる時間も必要です。利用者、働く人、家族の視点から、技術が役立つ場面と人との対話が必要な場面を整理し、よりよい支援を提案してください。',
  },
  {
    code: 'CO-05', title: '学校の困りごとを、データと小さな仕組みで改善する', subject: '情報・デジタル', duration: 100,
    sourceContent: '【架空の企業事例・デモ用】つばさデジタルは、地域の組織が日々の仕事を改善する仕組みを作っています。学校にも、提出物の確認、教室の予約、忘れ物の連絡など、同じ作業を繰り返す場面があります。すべてを自動化する前に、誰が何に困っているかを調べ、必要な情報を最小限にすることが大切です。個人情報を集めすぎず、使い慣れない人にもわかりやすい仕組みを考えてください。試作品を短く説明し、使った人の声で改善する方法も提案します。',
  },
];

export function seedLearningDemo() {
  if (q.one('SELECT value FROM settings WHERE key=?', SEED_KEY)) return { skipped: true };
  const teacher = q.one("SELECT u.* FROM users u JOIN schools s ON s.id=u.school_id WHERE u.login_id='t-a' AND u.role='teacher' AND s.code='DEMO-A'");
  const classRow = teacher && q.one("SELECT c.* FROM classes c JOIN teacher_classes tc ON tc.class_id=c.id WHERE tc.teacher_id=? AND c.grade=2 AND c.name='A'", teacher.id);
  const companies = examples.map(e => q.one('SELECT * FROM companies WHERE code=?', e.code));
  const students = classRow && q.all("SELECT * FROM users WHERE class_id=? AND role='student' AND active=1 AND login_id LIKE 's-aa-%' ORDER BY attendance_no LIMIT 8", classRow.id);
  if (!teacher || !classRow || companies.some(c => !c) || students.length !== 8) {
    throw new Error('デモ基本データが見つかりません。先に seed-demo.js を実行してください。実データ環境では実行しないでください。');
  }
  return tx(() => {
    const curricula = examples.map((example, i) => {
      const draft = insertCurriculum(generateCurriculum({ ...example, audience: '高校2年生・総合的な探究の時間' }), companies[i].id);
      return publishCurriculum(draft.id);
    });
    const copies = [0, 1, 4].map(i => insertCurriculum(curricula[i], curricula[i].companyId, {
      sourceId: curricula[i].id, themeId: curricula[i].themeId,
      teacherId: teacher.id, schoolId: teacher.school_id, status: 'approved',
    }));
    const today = jstDate();
    const makeLesson = (copy, status, date, stageIndex) => {
      const at = `${date}T00:00:00.000Z`;
      const lessonId = Number(q.run('INSERT INTO lessons(curriculum_id,class_id,teacher_id,snapshot,status,stage_index,scheduled_at,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?)',
        copy.id, classRow.id, teacher.id, JSON.stringify(copy), status, stageIndex, at,
        status === 'planned' ? null : at, status === 'completed' ? `${date}T00:50:00.000Z` : null).lastInsertRowid);
      q.run('INSERT INTO distributions(theme_id,class_id,teacher_id,start_date,end_date) VALUES(?,?,?,?,?)', copy.themeId, classRow.id, teacher.id, date, addDays(date, 30));
      return lessonId;
    };
    const completedId = makeLesson(copies[0], 'completed', addDays(today, -7), 4);
    const activeId = makeLesson(copies[0], 'active', today, 0);
    const plannedId = makeLesson(copies[1], 'planned', addDays(today, 7), 0);
    const learnings = [
      '速さだけでなく安全や品質も考えて、人とロボットの役割を分ける大切さがわかった。',
      '同じ作業でも、人が判断する部分と機械が繰り返す部分に分けて考えられた。',
      '工場で働く人の声を聞いてから仕組みを変えることが大切だと気づいた。',
      '費用だけで決めず、働く人の学び直しも計画に入れる必要があると知った。',
      'グループで異なる意見を比べると、自分の提案で見落としていた条件がわかった。',
      'ロボットを入れる目的を、作業時間と負担を減らすことに分けて考えられた。',
      '観察して課題を見つける仕事に関心を持った。データだけでなく現場を見ることも大切だ。',
      'ものづくりには、設計や製造だけでなく説明や話し合いの力も必要だとわかった。',
    ];
    const at = `${addDays(today, -7)}T01:00:00.000Z`;
    students.forEach((student, i) => {
      const nextAction = ['身近な繰り返し作業を一つ選び、人が判断する場面をメモする。', '工場で働く人のインタビューを読み、必要な力を三つ書き出す。'][i % 2];
      const tags = JSON.stringify(i % 2 ? ['ものづくり・工学', '情報・デジタル'] : ['ものづくり・工学']);
      const recordId = Number(q.run("INSERT INTO records(user_id,school_id,class_id,type,theme_id,ocr_status,final_text,status,ai_status,tags,summary,created_at,submitted_at) VALUES(?,?,?,'theme',?,'none',?,'submitted','none',?,?,?,?)",
        student.id, student.school_id, student.class_id, copies[0].themeId, `${learnings[i]}\n次の行動：${nextAction}`, tags, learnings[i], at, at).lastInsertRowid);
      q.run('INSERT INTO lesson_responses(lesson_id,user_id,record_id,before_score,after_score,learning,next_action,interests,submitted_at) VALUES(?,?,?,?,?,?,?,?,?)',
        completedId, student.id, recordId, 2 + (i % 2), 4 + (i % 2), learnings[i], nextAction, tags, at);
    });
    const result = { skipped: false, curriculumCount: curricula.length, teacherCopyCount: copies.length, completedId, activeId, plannedId, responseCount: students.length };
    q.run('INSERT INTO settings(key,value) VALUES(?,?)', SEED_KEY, JSON.stringify({ ...result, seededAt: nowIso(), synthetic: true }));
    return result;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = seedLearningDemo();
    console.log(result.skipped ? '授業デモは登録済みです。既存データを維持しました。' : `架空の授業デモを追加しました：企業教材 ${result.curriculumCount}件／授業3件／振り返り${result.responseCount}件。`);
    if (!result.skipped) console.log('教員 t-a／生徒 s-aa-01／企業 c-01（既存デモアカウント）で確認できます。');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
