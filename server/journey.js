import { getDb, q, parseJson } from './db.js';

export const JOURNEY_STAGES = [
  { id: 1, title: '気づく', subtitle: '日々の記録から、自分の関心を見つける', prompt: '手帳のどの場面に、あなたらしい関心が表れていますか。まだ分からないことも残してみましょう。', fields: [{ key: 'purpose', label: 'いま考えてみたいこと・探究の目的' }, { key: 'interest', label: '気になっていることと、そう思った場面' }] },
  { id: 2, title: '選ぶ・計画する', subtitle: '企業や地域のテーマと、自分の問いをつなぐ', prompt: '誰の、どんな現実を知りたいですか。現場で確かめることを、自分で一つ選んでみましょう。', fields: [{ key: 'theme', label: '自分で選んだテーマと、その理由' }, { key: 'plan', label: '体験計画：いつ・どこで・誰に・何を確かめるか' }] },
  { id: 3, title: '体験して、揺さぶられる', subtitle: '見た事実と心の動きを分け、手帳に戻す', prompt: '実際に見聞きしたことと、あなたの感じ方を分けてみましょう。予想と違ったことは、手帳にどう残しますか。', fields: [{ key: 'observation', label: '現場で見たこと・聞いたこと（事実）' }, { key: 'emotionShift', label: '感情や「当たり前」が変わった場面' }, { key: 'notebookQuestion', label: '今夜、手帳に書き戻して考えたい問い' }] },
  { id: 4, title: '深めて、自己決定する', subtitle: '先生との対話を通じて、次の一歩を自分で決める', prompt: '次に何を試したいですか。その理由を、体験した場面や手帳の記録で説明できますか。迷いが残っていても大丈夫です。', fields: [{ key: 'nextAction', label: '自分で決める次の行動（小さな一歩）' }, { key: 'aspirationBasis', label: '取り組みたい理由・志の根拠・まだ迷っていること' }] },
];

const initialized = new WeakSet();
export function ensureJourneySchema() {
  const db = getDb();
  if (initialized.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS journey_entries (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 4), entry_date TEXT NOT NULL,
      fields TEXT NOT NULL, record_ids TEXT NOT NULL DEFAULT '[]',
      reference_url TEXT, reference_checked_at TEXT,
      voluntary INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journey_user ON journey_entries(user_id, entry_date);
    CREATE TABLE IF NOT EXISTS journey_notes (
      id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id),
      teacher_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
      planned_date TEXT, status TEXT NOT NULL CHECK(status IN ('planned','done','followup')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journey_notes_student ON journey_notes(student_id, created_at);
    CREATE TABLE IF NOT EXISTS journey_teacher_surveys (
      teacher_id INTEGER PRIMARY KEY REFERENCES users(id),
      continuation TEXT NOT NULL CHECK(continuation IN ('yes','unsure','no')),
      workload TEXT NOT NULL CHECK(workload IN ('lighter','same','heavier')),
      note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
    );
  `);
  initialized.add(db);
}

export function entryDto(row) {
  return { id: row.id, stage: row.stage, entryDate: row.entry_date, fields: parseJson(row.fields, {}), recordIds: parseJson(row.record_ids, []), referenceUrl: row.reference_url || '', referenceCheckedAt: row.reference_checked_at || '', voluntary: Boolean(row.voluntary), version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}
export function writingMetrics(entries) {
  const count = (stages) => {
    const selected = entries.filter(e => stages.includes(e.stage) && e.voluntary);
    return { records: selected.length, characters: selected.reduce((n, e) => n + Array.from(Object.values(e.fields).join('').replace(/\s/g, '')).length, 0) };
  };
  const before = count([1, 2]), after = count([3, 4]);
  return { before, after, characterDifference: after.characters - before.characters, note: '「自分から書いた」と本人が申告した記録の参考値です。前＝STEP 1・2、後＝STEP 3・4。期間・問い・記録回数が異なるため、増加を学習効果や文章の質の向上と断定できません。' };
}
export function studentJourney(userId) {
  const entries = q.all('SELECT * FROM journey_entries WHERE user_id=? ORDER BY entry_date DESC,id DESC', userId).map(entryDto);
  const records = q.all("SELECT id,type,final_text,submitted_at FROM records WHERE user_id=? AND status='submitted' ORDER BY submitted_at DESC LIMIT 200", userId)
    .map(r => ({ id: r.id, type: r.type, date: r.submitted_at, text: (r.final_text || '').slice(0, 180) }));
  const notes = q.all('SELECT n.*,u.display_name FROM journey_notes n JOIN users u ON u.id=n.teacher_id WHERE student_id=? ORDER BY n.created_at DESC,n.id DESC', userId)
    .map(n => ({ id: n.id, teacherId: n.teacher_id, teacherName: n.display_name || '担当の先生', body: n.body, plannedDate: n.planned_date || '', status: n.status, createdAt: n.created_at, updatedAt: n.updated_at }));
  return { entries, records, notes, metrics: writingMetrics(entries) };
}
