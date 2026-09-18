import { useEffect, useState } from 'react';
import { Field, downloadText } from '../ui.jsx';
import { newId } from './model.js';

const INTERESTS = ['ものづくり・工学', '情報・デジタル', '医療・看護・福祉', '教育・子ども', '環境・エネルギー', '食・農業', '地域・まちづくり', '経済・ビジネス', '国際・語学', '芸術・デザイン', 'スポーツ・健康', '自然科学・研究'];
const STAGES = [
  { id: 'notice', title: '気づく', prompt: 'どんな場面が気になりましたか。手帳に残したい問いを、自分の言葉で書いてみましょう。' },
  { id: 'plan', title: '選ぶ・計画する', prompt: '何を確かめたいですか。いつ・どこで・誰に聞くか、体験の計画を考えてみましょう。' },
  { id: 'experience', title: '体験して考える', prompt: '見たり聞いたりした事実と、自分が感じたことを分けてみましょう。予想と違ったことはありましたか。' },
  { id: 'reflection', title: '深めて決める', prompt: '体験や手帳のどの場面が、次の一歩につながりましたか。やってみたいことと、その理由を残しましょう。' },
];
const LABELS = { scheduled: '開始前', planned: '開始前', active: '授業中', completed: '終了' };
const dateNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日時未設定' : new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium' }).format(date);
};
const isScore = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5;
const baselineOpen = lesson => !lesson.baseline && (['scheduled', 'planned'].includes(lesson.status) || (lesson.status === 'active' && lesson.stageIndex === 0));
const emptyJourney = () => ({ id: null, stage: 'notice', topic: '', body: '', date: dateNow() });

function ScoreField({ label, value, onChange, disabled = false }) {
  return <Field label={label} hint="1：まだわからない 〜 5：自分の言葉で説明できる">
    <select className="input" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required>
      <option value="">選択してください</option>
      {[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score} / 5</option>)}
    </select>
  </Field>;
}

function LessonExperience({ lesson, onChange, notify }) {
  const [before, setBefore] = useState('');
  const [response, setResponse] = useState(() => ({ after: lesson.response?.after ?? '', learning: lesson.response?.learning || '', nextAction: lesson.response?.nextAction || '', interests: lesson.response?.interests || [] }));
  const [error, setError] = useState('');
  useEffect(() => {
    setResponse({ after: lesson.response?.after ?? '', learning: lesson.response?.learning || '', nextAction: lesson.response?.nextAction || '', interests: lesson.response?.interests || [] });
    setError('');
  }, [lesson.response]);
  useEffect(() => { if (!lesson.baseline) setBefore(''); }, [lesson.baseline]);
  const canSaveBefore = baselineOpen(lesson);
  const canRespond = lesson.status === 'completed' && Boolean(lesson.baseline);
  const interestOptions = [...new Set([...INTERESTS, ...response.interests])];
  const saveBefore = event => {
    event.preventDefault();
    if (!canSaveBefore || !isScore(before)) return setError('授業前の理解度を1〜5から選んでください。');
    const baseline = { before: Number(before), submittedAt: new Date().toISOString() };
    onChange(previous => ({ ...previous, lessons: previous.lessons.map(item => item.id === lesson.id && baselineOpen(item) ? { ...item, baseline } : item) }));
    setError(''); notify('授業前の理解度を、このブラウザに保存しました');
  };
  const saveResponse = event => {
    event.preventDefault();
    if (!canRespond) return setError('授業前の評価を保存し、教員の画面で授業を終了してから回答してください。');
    if (!isScore(response.after) || !response.learning.trim() || !response.nextAction.trim()) return setError('授業後の理解度、学んだこと、次の行動を入力してください。');
    if (lesson.response && !window.confirm('この授業の保存済みの振り返りを、今の入力内容に更新しますか？')) return;
    const saved = { after: Number(response.after), learning: response.learning.trim(), nextAction: response.nextAction.trim(), interests: [...response.interests], submittedAt: new Date().toISOString() };
    onChange(previous => ({ ...previous, lessons: previous.lessons.map(item => item.id === lesson.id && item.status === 'completed' && item.baseline ? { ...item, response: saved } : item) }));
    setError(''); notify('振り返りを、このブラウザに保存しました');
  };
  const activeStage = lesson.stages?.[lesson.stageIndex];
  return <section className="card stack">
    <div className="spread"><span className="badge">{LABELS[lesson.status] || lesson.status}</span><span className="muted small">{lesson.duration}分の授業</span></div>
    <h2>{lesson.title}</h2>
    {!!lesson.objectives?.length && <div><h3>今日の目標</h3><ul>{lesson.objectives.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {lesson.status === 'active' && activeStage && <aside className="notice"><b>いまの活動：{lesson.stageIndex + 1}. {activeStage.title}</b><p>{activeStage.activity}</p></aside>}
    <details><summary>授業全体の流れを見る</summary><ol>{(lesson.stages || []).map((stage, index) => <li key={index}><b>{stage.title}</b>（{stage.minutes}分）<p>{stage.activity}</p></li>)}</ol></details>
    <section className="stack">
      <h3>授業前の自分を記録する</h3>
      {lesson.baseline ? <p className="notice">授業前の理解度：<b>{lesson.baseline.before} / 5</b>（保存済み・変更できません）</p> : canSaveBefore ? <form className="stack" onSubmit={saveBefore}>
        <p className="muted small">開始前または最初の活動中に回答します。教員が次の活動へ進むと締め切ります。</p>
        <ScoreField label="授業前の理解度" value={before} onChange={setBefore} />
        <button className="btn primary" type="submit">授業前の評価を保存する</button>
      </form> : <p className="notice">授業前の回答は締め切られました。この授業の前後比較には参加できませんが、「探究4STEP」に学びを残せます。</p>}
    </section>
    <form className="stack" onSubmit={saveResponse}>
      <h3>授業を終えて、次の一歩へ</h3>
      {!canRespond && <p className="muted small">{canSaveBefore ? '先に上の授業前評価を保存してください。その後、教員の画面で授業を進め、終了すると振り返りを保存できます。' : lesson.baseline ? '教員の画面で授業を終了すると、振り返りを保存できます。' : 'この授業は事前評価がないため、振り返りの前後比較は保存できません。'}</p>}
      <ScoreField label="授業後の理解度" value={response.after} onChange={after => setResponse(current => ({ ...current, after }))} disabled={!canRespond} />
      <Field label="今日、気づいたこと・学んだこと"><textarea className="input" rows={4} maxLength={1500} value={response.learning} onChange={event => setResponse(current => ({ ...current, learning: event.target.value }))} disabled={!canRespond} placeholder="例：架空の工場見学で、材料を繰り返し使う工夫を知った。" required /></Field>
      <Field label="次に試してみたい、小さな行動"><textarea className="input" rows={3} maxLength={500} value={response.nextAction} onChange={event => setResponse(current => ({ ...current, nextAction: event.target.value }))} disabled={!canRespond} placeholder="例：身近な製品の材料を調べてみる。" required /></Field>
      <fieldset className="stack" disabled={!canRespond}><legend>気になった分野（任意・3つまで）</legend><div className="pd-tag-list">{interestOptions.map(tag => <label className="check" key={tag}><input type="checkbox" checked={response.interests.includes(tag)} disabled={!response.interests.includes(tag) && response.interests.length >= 3} onChange={event => setResponse(current => ({ ...current, interests: event.target.checked ? [...current.interests, tag] : current.interests.filter(item => item !== tag) }))} />{tag}</label>)}</div></fieldset>
      <button className="btn primary" type="submit" disabled={!canRespond}>{lesson.response ? '保存済みの振り返りを更新する' : '振り返りを保存する'}</button>
      {lesson.response && <p className="small muted">保存日：{dateLabel(lesson.response.submittedAt)}</p>}
      <p className="small muted">入力途中の内容は、保存ボタンを押すまで保存されません。</p>
    </form>
    {error && <p className="notice alert" role="alert">{error}</p>}
  </section>;
}

export default function PublicStudent({ state, onChange, notify }) {
  const lessons = state.lessons || [];
  const journeys = state.journeys || [];
  const notes = state.notes || [];
  const [view, setView] = useState('lessons');
  const [lessonId, setLessonId] = useState(lessons[0]?.id || '');
  const [draft, setDraft] = useState(emptyJourney);
  const [journeyError, setJourneyError] = useState('');
  const lesson = lessons.find(item => item.id === lessonId) || lessons[0];
  useEffect(() => { if (!lessons.some(item => item.id === lessonId)) setLessonId(lessons[0]?.id || ''); }, [lessons, lessonId]);
  const published = (state.curricula || []).filter(item => item.kind === 'company' && item.status === 'published');
  const completed = lessons.filter(item => item.baseline && item.response);
  const interests = [...new Set(completed.flatMap(item => item.response.interests || []))];
  const nextActions = completed.filter(item => item.response.nextAction?.trim());
  const stage = STAGES.find(item => item.id === draft.stage) || STAGES[0];
  const preview = {
    schemaVersion: 'public-demo-candidate/1.0',
    purpose: '副担任mirAIへの共有項目を検討するための架空デモ',
    studentDemoId: 'DEMO-STUDENT',
    learningRecords: completed.map(item => ({ lessonId: item.id, lessonTitle: item.title, before: item.baseline.before, after: item.response.after, interests: item.response.interests || [], nextAction: item.response.nextAction, submittedAt: item.response.submittedAt })),
  };
  const saveJourney = event => {
    event.preventDefault();
    if (!draft.body.trim() || !draft.date || draft.date > dateNow()) return setJourneyError('今日以前の記録日と、自分の言葉を入力してください。');
    const entry = { id: draft.id || newId('journey'), stage: draft.stage, body: draft.body.trim(), date: draft.date, ...(draft.topic.trim() ? { topic: draft.topic.trim() } : {}) };
    onChange(previous => ({ ...previous, journeys: draft.id ? previous.journeys.map(item => item.id === draft.id ? entry : item) : [...previous.journeys, entry] }));
    setDraft({ ...emptyJourney(), stage: draft.stage }); setJourneyError(''); notify('探究の記録を、このブラウザに保存しました');
  };
  const startPlan = curriculum => {
    if (draft.body.trim() && !window.confirm('入力途中の探究記録を置き換え、新しい計画を始めますか？')) return;
    setDraft({ ...emptyJourney(), stage: 'plan', topic: curriculum.title }); setJourneyError(''); setView('journey');
  };
  const changeStage = id => {
    if (id === draft.stage) return;
    if (draft.body.trim() && !window.confirm('入力途中の内容を置き換えて、別の段階の新しい記録を始めますか？ 保存済みの記録は残ります。')) return;
    setDraft({ ...emptyJourney(), stage: id, topic: draft.topic }); setJourneyError('');
  };
  return <div className="pd-student stack">
    <aside className="notice"><b>公開デモ・架空の内容だけで体験してください。</b><p>保存先は同じブラウザです。別の端末や実際の学校とは共有されません。氏名や実際の相談内容は入力しないでください。画像のアップロードや外部への送信はありません。</p></aside>
    <nav className="pd-subnav row" aria-label="生徒の体験メニュー">{[['lessons', '授業に参加'], ['themes', 'テーマを探す'], ['journey', '探究4STEP'], ['future', 'わたしの未来']].map(([id, label]) => <button className={`btn ${view === id ? 'primary' : ''}`} type="button" aria-pressed={view === id} key={id} onClick={() => setView(id)}>{label}</button>)}</nav>
    {view === 'lessons' && <div className="pd-two-col"><aside className="card stack"><h2>届いている授業</h2><p className="muted small">最初に事前評価を保存。その後、教員のデモ画面で授業を進められます。</p><div className="pd-lesson-list stack">{lessons.map(item => <button className={`btn ${item.id === lesson?.id ? 'primary' : ''}`} type="button" key={item.id} aria-pressed={item.id === lesson?.id} onClick={() => setLessonId(item.id)}><span>{item.title}</span><small>{LABELS[item.status] || item.status}{item.response ? ' · 回答済み' : item.baseline ? ' · 事前評価済み' : ''}</small></button>)}</div>{!lessons.length && <p>授業はまだありません。教員のデモ画面で教材を承認し、授業を作成してください。</p>}</aside>{lesson && <LessonExperience key={lesson.id} lesson={lesson} onChange={onChange} notify={notify} />}</div>}
    {view === 'themes' && <section className="stack"><div><h2>企業から届いた、社会の問い</h2><p className="muted">公開された架空の教材です。興味のあるテーマを、自分で選んでみましょう。</p></div>{!published.length && <div className="card">提供中の教材はありません。企業のデモ画面で教材を公開すると、ここで閲覧できます。</div>}{published.map(item => <article className="card stack" key={item.id}><span className="muted small">{item.companyName || '架空の企業'} · {item.subject || '探究学習'}</span><h3>{item.title}</h3><p className="muted">{item.audience || '対象学年は先生と確認'} · {item.duration}分</p><ul>{(item.objectives || []).map((objective, index) => <li key={index}>{objective}</li>)}</ul><button className="btn" type="button" onClick={() => startPlan(item)}>このテーマで体験計画を考える →</button></article>)}</section>}
    {view === 'journey' && <section className="stack"><div><h2>わたしの探究ストーリー</h2><p className="muted">画面の問いは固定のヒントです。回答や志望理由を代筆せず、自分の言葉で記録します。</p></div><div className="pd-journey-steps row">{STAGES.map((item, index) => <button key={item.id} className={`btn ${draft.stage === item.id ? 'primary' : ''}`} type="button" aria-pressed={draft.stage === item.id} onClick={() => changeStage(item.id)}>{index + 1}. {item.title}</button>)}</div><div className="pd-two-col"><form className="card stack" onSubmit={saveJourney}><h3>{draft.id ? '記録を編集' : '新しい記録'}：{stage.title}</h3><p className="notice">{stage.prompt}</p><Field label="記録した日"><input className="input" type="date" max={dateNow()} value={draft.date} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))} required /></Field><Field label="テーマ（任意）"><input className="input" maxLength={120} value={draft.topic} onChange={event => setDraft(current => ({ ...current, topic: event.target.value }))} placeholder="架空の地域や企業のテーマ" /></Field><Field label="自分の言葉で残す" hint={`${draft.body.length} / 1500文字`}><textarea className="input" rows={7} maxLength={1500} required value={draft.body} onChange={event => setDraft(current => ({ ...current, body: event.target.value }))} placeholder="架空の体験として、考えたことを書いてみましょう。" /></Field>{journeyError && <p className="notice alert" role="alert">{journeyError}</p>}<button className="btn primary" type="submit">{draft.id ? '編集した記録を保存する' : 'この段階の記録を保存する'}</button>{draft.id && <button className="btn" type="button" onClick={() => setDraft(emptyJourney())}>編集をやめて新しい記録へ</button>}<p className="muted small">保存した本文は同じブラウザの教員デモ画面でも表示されます。共有候補JSONには含めません。実際の体験予約・手配は行いません。</p></form><aside className="card stack"><h3>先生との対話</h3><p className="muted small">同じブラウザの教員デモ画面で保存した共有メモです。</p>{!notes.length && <p>共有メモはまだありません。</p>}{[...notes].reverse().map(note => <article className="stack" key={note.id}><small className="muted">{dateLabel(note.date)}</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.body}</p></article>)}</aside></div><section className="card stack"><h3>これまでの探究</h3>{!journeys.length && <p className="muted">最初の気づきから、ひとつずつ残してみましょう。</p>}{[...journeys].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <article className="stack" key={entry.id}><div className="spread"><b>{STAGES.find(item => item.id === entry.stage)?.title || entry.stage}</b><span className="muted small">{dateLabel(entry.date)}</span></div>{entry.topic && <h4>{entry.topic}</h4>}<p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.body}</p><button className="btn small" type="button" onClick={() => { if (draft.body.trim() && !window.confirm('入力途中の内容を置き換えて、この記録を編集しますか？')) return; setDraft({ ...entry, topic: entry.topic || '' }); setJourneyError(''); }}>この記録を編集する</button></article>)}</section></section>}
    {view === 'future' && <section className="stack"><div><h2>学びの変化を、自分で確かめる。</h2><p className="muted">ここにある数値は1〜5の自己評価です。授業の因果効果や成績、職業適性を示すものではありません。</p></div><section className="card stack"><h3>授業前と授業後の自分</h3>{!completed.length && <p>事前評価と授業後の振り返りを保存すると、ここで比較できます。</p>}{completed.map(item => <article className="pd-score-grid" key={item.id}><h4>{item.title}</h4><p>授業前 <b>{item.baseline.before} / 5</b> → 授業後 <b>{item.response.after} / 5</b></p></article>)}</section><div className="pd-two-col"><section className="card stack"><h3>いま気になっている分野</h3><div className="pd-tag-list">{interests.map(tag => <span className="badge" key={tag}>{tag}</span>)}</div>{!interests.length && <p className="muted">授業の振り返りで関心分野を選ぶと表示されます。関心は変わっても構いません。</p>}</section><section className="card stack"><h3>わたしが決めた、次の一歩</h3>{!nextActions.length && <p className="muted">授業の振り返りで、試してみたい行動を残しましょう。</p>}{nextActions.map(item => <article key={item.id}><small className="muted">{item.title}</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.response.nextAction}</p></article>)}</section></div><section className="card stack"><h3>副担任mirAIへ共有する項目の候補</h3><p>授業名、前後の自己評価、関心タグ、次の行動を可視化するデモです。これは標準連携ファイルではなく、接続先と合意する前の候補です。</p><p className="notice">学びの自由記述、探究4STEPの本文、先生の共有メモ、画像は含めません。外部には送信せず、実際の副担任mirAIへの取込も行いません。</p><details><summary>共有候補JSONを確認する</summary><pre className="pd-json-preview" style={{ maxWidth: '100%', overflowX: 'auto' }}>{JSON.stringify(preview, null, 2)}</pre></details><button className="btn" type="button" disabled={!completed.length} onClick={() => { downloadText(`mirai-public-demo-candidate-${dateNow()}.json`, JSON.stringify(preview, null, 2), 'application/json;charset=utf-8'); notify('架空データの共有候補JSONを保存しました。外部送信はしていません'); }}>共有候補JSONをファイルに保存 ↓</button><p className="muted small">「次の行動」も自分で入力した文章です。保存前に、氏名や実際の個人情報が入っていないか確認してください。</p></section></section>}
  </div>;
}
