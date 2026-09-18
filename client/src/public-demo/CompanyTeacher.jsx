import { useState } from 'react';
import { generateCurriculum } from '../../../shared/curriculum-generator.js';
import { GUIDANCE_PROFILES, GUIDANCE_NOTE } from '../../../server/curriculum-guidance.js';
import { newId } from './model.js';

const STATUS = { draft: '下書き', published: '学校へ提供中', approved: '教員確認済み', scheduled: '開始前', active: '授業中', completed: '終了' };
const JOURNEY_STAGE = { notice: 'STEP 1 · 気づく', plan: 'STEP 2 · 選ぶ・計画する', experience: 'STEP 3 · 体験して考える', reflection: 'STEP 4 · 深めて決める' };
const EMPTY_SOURCE = { title: '', sourceContent: '', guidelineId: 'high_inquiry', duration: 50 };
const EXAMPLE_SOURCE = {
  ...EMPTY_SOURCE,
  title: '規格外の野菜を、無理なく届け続けるには？',
  sourceContent: '【架空の企業事例】デモ企業では、形や大きさが違う野菜を使った商品を考えています。味に問題はありませんが、小さな野菜を分けて包装するには手間がかかります。安く売るだけでは、農家の収入や運ぶ費用を確保できません。作る人と買う人の両方の立場から、食品ロスを減らしながら続けられる仕組みを考えてください。どのような情報があれば、買う人は安心して選べるでしょうか。',
};
const resetReview = (alignment) => ({ ...alignment, review: { status: 'pending', confirmedAt: null, confirmedBy: null, note: '' } });
const toDraft = (curriculum, patch) => ({ ...curriculum, ...patch, status: 'draft', teacherReviewed: false, alignment: resetReview(patch.alignment || curriculum.alignment) });
const totalMinutes = (curriculum) => curriculum.stages.reduce((sum, stage) => sum + Number(stage.minutes || 0), 0);
function validation(curriculum, teacher = false) {
  if (!curriculum.title.trim()) return '教材のタイトルを入力してください。';
  if (curriculum.objectives.some(objective => !objective.trim())) return '学習目標をすべて入力してください。';
  if (!curriculum.stages.length || curriculum.stages.some(stage => !stage.title.trim() || !stage.activity.trim() || !Number.isInteger(stage.minutes) || stage.minutes < 1)) return '各活動の名前・内容・1分以上の時間を入力してください。';
  if (totalMinutes(curriculum) !== curriculum.duration) return `活動時間の合計を${curriculum.duration}分にしてください。`;
  if (!curriculum.assessment.trim()) return '評価で確かめたいことを入力してください。';
  if (teacher && (!curriculum.alignment?.schoolGoal?.trim() || !curriculum.alignment?.unitPosition?.trim())) return '自校の目標と単元の位置付けを入力してください。';
  return '';
}
function BrowserNotice() {
  return <p className="pd-callout">公開デモです。入力・編集・学校への提供・授業の操作は、このブラウザ内だけに保存されます。実在する生徒の情報や企業の機密は入力しないでください。</p>;
}
function CurriculumCard({ curriculum, children }) {
  return <article className="card pd-card stack">
    <div className="spread"><span className="pd-status">{STATUS[curriculum.status]}</span><span className="small muted">{curriculum.duration}分</span></div>
    <h3>{curriculum.title}</h3>
    <p className="small muted">{curriculum.audience} · {curriculum.subject}</p>
    <p>{curriculum.objectives[0]}</p>
    {children}
  </article>;
}

function CurriculumEditor({ curriculum, teacher, onEdit, children }) {
  const c = curriculum;
  const editStage = (index, patch) => onEdit({ stages: c.stages.map((stage, i) => i === index ? { ...stage, ...patch } : stage) });
  const editObjective = (index, value) => onEdit({
    objectives: c.objectives.map((objective, i) => i === index ? value : objective),
    alignment: { ...c.alignment, pillars: c.alignment.pillars.map((pillar, i) => i === index ? { ...pillar, objective: value } : pillar) },
  });
  return <section className="panel stack pd-editor" aria-label={teacher ? '採用した教材を編集' : '企業教材を編集'}>
    <div className="spread"><div><p className="small muted">{teacher ? '教員の最終編集' : '企業の教材づくり'}</p><h2>{teacher ? '自校の授業に合わせて整える' : '活動と目標を整えて、学校へ届ける'}</h2></div><span className="pd-status">{STATUS[c.status]}</span></div>
    <p className="small muted">変更はブラウザ内に自動保存され、下書きに戻ります。{teacher ? '再度確認・承認してから、新しい授業を作成してください。作成済みの授業は変わりません。' : '採用済みの教員用コピーや、作成済みの授業は変わりません。'}</p>
    <label className="field"><span>教材のタイトル</span><input className="input" maxLength={200} value={c.title} onChange={event => onEdit({ title: event.target.value })} /></label>
    <p className="small muted">対象：{c.audience} ／ {c.subject} ／ {c.duration}分</p>
    <details className="pd-source"><summary>企業が提供した原文を確認</summary><p style={{ whiteSpace: 'pre-wrap' }}>{c.sourceContent}</p></details>
    {teacher && <div className="pd-grid">
      <label className="field"><span>自校の目標（承認に必要）</span><textarea className="input" rows={3} maxLength={2000} value={c.alignment.schoolGoal} onChange={event => onEdit({ alignment: { ...c.alignment, schoolGoal: event.target.value } })} placeholder="自校で育てたい力と、この授業とのつながり" /></label>
      <label className="field"><span>単元の位置付け（承認に必要）</span><textarea className="input" rows={3} maxLength={1000} value={c.alignment.unitPosition} onChange={event => onEdit({ alignment: { ...c.alignment, unitPosition: event.target.value } })} placeholder="年間計画のどこで、前後の学びとどうつなぐか" /></label>
    </div>}
    <h3>3つの資質・能力と学習目標</h3>
    {c.objectives.map((objective, index) => <label className="field" key={index}><span>{c.alignment.pillars[index]?.label || `学習目標${index + 1}`}</span><textarea className="input" rows={2} maxLength={1500} value={objective} onChange={event => editObjective(index, event.target.value)} /><small>評価の証拠：{c.alignment.pillars[index]?.evidence}</small></label>)}
    <div className="spread"><h3>授業の活動を編集</h3><span className="pd-status">合計 {totalMinutes(c)} / {c.duration}分</span></div>
    {c.stages.map((stage, index) => <details className="pd-step" key={index} open={index === 0}>
      <summary>{index + 1}. {stage.title || '活動名を入力'}（{stage.minutes || 0}分）</summary>
      <div className="stack">
        <div className="pd-grid"><label className="field"><span>活動名</span><input className="input" value={stage.title} maxLength={100} onChange={event => editStage(index, { title: event.target.value })} /></label><label className="field"><span>時間（分）</span><input className="input" type="number" min={1} max={100} step={1} value={stage.minutes || ''} onChange={event => editStage(index, { minutes: Number(event.target.value) })} /></label></div>
        <label className="field"><span>生徒が取り組むこと</span><textarea className="input" rows={5} maxLength={10000} value={stage.activity} onChange={event => editStage(index, { activity: event.target.value })} /></label>
        <label className="field"><span>教員向けの進行メモ</span><textarea className="input" rows={2} maxLength={2000} value={stage.teacherNote || ''} onChange={event => editStage(index, { teacherNote: event.target.value })} /></label>
      </div>
    </details>)}
    <label className="field"><span>評価で確かめたいこと</span><textarea className="input" rows={4} maxLength={5000} value={c.assessment} onChange={event => onEdit({ assessment: event.target.value })} /></label>
    <details className="pd-source"><summary>学習指導要領の対応候補と公式資料</summary><div className="stack">
      <p className="small">{GUIDANCE_NOTE}</p><p>{c.alignment.focus}</p>
      <ol>{c.alignment.processes.map(process => <li key={process.key}><b>{process.label}</b>：{process.activity}<br /><small>確かめるもの：{process.evidence}</small></li>)}</ol>
      {c.alignment.sourceReferences.map(source => <p key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><br /><small>{source.section} ／ {source.pages}</small></p>)}
    </div></details>
    {children}
  </section>;
}

export function PublicCompany({ state, onChange, notify }) {
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const curricula = state.curricula.filter(c => c.kind === 'company');
  const selected = curricula.find(c => c.id === selectedId);
  const adoptions = state.curricula.filter(c => c.kind === 'teacher' && curricula.some(source => source.id === c.sourceId)).length;
  const generate = event => {
    event.preventDefault();
    if (source.sourceContent.trim().length < 30) { setError('企業の内容を30文字以上で入力してください。'); return; }
    if (!source.title.trim()) { setError('教材のタイトルを入力してください。'); return; }
    const profile = GUIDANCE_PROFILES.find(p => p.id === source.guidelineId);
    const curriculum = { ...generateCurriculum({
      title: source.title.trim(), sourceContent: source.sourceContent.trim(),
      audience: profile.schoolLevel === 'middle' ? '中学生' : '高校生', subject: profile.subject,
      schoolLevel: profile.schoolLevel, guidelineId: profile.id, duration: Number(source.duration),
    }), id: newId('curriculum'), kind: 'company', status: 'draft', sourceId: null, companyName: 'デモ企業', teacherReviewed: false };
    onChange(previous => ({ ...previous, curricula: [...previous.curricula, curriculum] }));
    setSelectedId(curriculum.id); setError('');
    notify('このブラウザに教材の草案を作成しました。下の編集欄で確認できます。');
  };
  const edit = patch => onChange(previous => ({ ...previous, curricula: previous.curricula.map(c => c.id === selectedId ? toDraft(c, patch) : c) }));
  const publish = () => {
    const invalid = validation(selected);
    if (invalid) { setError(invalid); return; }
    onChange(previous => ({ ...previous, curricula: previous.curricula.map(c => c.id === selectedId ? { ...c, status: 'published' } : c) }));
    setError(''); notify('このブラウザの教員画面へ教材を提供しました。役割を切り替えて採用できます。');
  };
  return <div className="stack">
    <BrowserNotice />
    <div className="pd-grid"><div className="card pd-stat"><span>学校へ提供中の教材</span><strong>{curricula.filter(c => c.status === 'published').length} 件</strong></div><div className="card pd-stat"><span>教員が採用した教材</span><strong>{adoptions} 件</strong><small>このブラウザ内のデモ操作の件数です。生徒個人の回答は表示しません。</small></div></div>
    <section className="panel stack pd-section"><div className="spread"><h2>1. 企業の内容を教材に変える</h2><button className="btn" type="button" onClick={() => { setSource(EXAMPLE_SOURCE); setError(''); }}>架空の例を入れる</button></div>
      <p className="small muted">入力文全体から問いや制約を拾うルール方式です。生成AIへの送信はありません。事実関係・権利・学校への公開範囲を確認して教材を整えてください。</p>
      <form className="stack" onSubmit={generate}>
        <label className="field"><span>教材のタイトル</span><input className="input" value={source.title} maxLength={200} required onChange={event => setSource({ ...source, title: event.target.value })} placeholder="生徒と一緒に考えたい問い" /></label>
        <label className="field"><span>企業の内容・現場の課題（30文字以上）</span><textarea className="input" rows={6} minLength={30} maxLength={12000} required value={source.sourceContent} onChange={event => setSource({ ...source, sourceContent: event.target.value })} placeholder="事業の背景、現場の具体的な課題、数字や条件、生徒に考えてほしいことなど" /><small>{source.sourceContent.length} / 12,000文字</small></label>
        <div className="pd-grid"><label className="field"><span>学習指導要領の対応候補</span><select className="input" value={source.guidelineId} onChange={event => setSource({ ...source, guidelineId: event.target.value })}>{GUIDANCE_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label><label className="field"><span>授業時間</span><select className="input" value={source.duration} onChange={event => setSource({ ...source, duration: Number(event.target.value) })}><option value={50}>50分（1コマ）</option><option value={100}>100分（2コマ）</option></select></label></div>
        <button className="btn primary" type="submit">教材の草案をつくる</button>
      </form>
    </section>
    <section className="stack pd-section"><h2>2. 教材を選んで編集・提供する</h2>{!curricula.length && <p className="pd-empty">上のフォームから、最初の教材をつくりましょう。</p>}<div className="pd-grid">{curricula.map(c => <CurriculumCard key={c.id} curriculum={c}><button className="btn" onClick={() => { setSelectedId(c.id); setError(''); }}>この教材を編集</button></CurriculumCard>)}</div></section>
    {error && <p className="notice alert" role="alert">{error}</p>}
    {selected && <CurriculumEditor curriculum={selected} onEdit={edit}><div className="pd-actions"><button className="btn primary" disabled={selected.status === 'published'} onClick={publish}>{selected.status === 'published' ? 'このブラウザの教員画面へ提供中' : '学校へ提供する（デモ）'}</button></div></CurriculumEditor>}
  </div>;
}

export function PublicTeacher({ state, onChange, notify }) {
  const [selectedId, setSelectedId] = useState(null);
  const [lessonId, setLessonId] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState({ body: '', date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) });
  const library = state.curricula.filter(c => c.kind === 'company' && c.status === 'published');
  const mine = state.curricula.filter(c => c.kind === 'teacher');
  const selected = mine.find(c => c.id === selectedId);
  const lesson = state.lessons.find(l => l.id === lessonId);
  const choose = id => { setSelectedId(id); setConfirmed(false); setError(''); };
  const adopt = source => {
    const copy = { ...structuredClone(source), id: newId('curriculum'), kind: 'teacher', status: 'draft', sourceId: source.id, teacherReviewed: false };
    copy.alignment = resetReview({ ...copy.alignment, schoolGoal: '', unitPosition: '' });
    onChange(previous => ({ ...previous, curricula: [...previous.curricula, copy] }));
    choose(copy.id); notify('教員用の独立したコピーを作成しました。自校の目標に合わせて編集してください。');
  };
  const edit = patch => {
    setConfirmed(false); setError('');
    onChange(previous => ({ ...previous, curricula: previous.curricula.map(c => c.id === selectedId ? toDraft(c, patch) : c) }));
  };
  const approve = () => {
    const invalid = validation(selected, true);
    if (invalid || !confirmed) { setError(invalid || '学習指導要領の候補と授業内容を確認し、チェックしてください。'); return; }
    const confirmedAt = new Date().toISOString();
    onChange(previous => ({ ...previous, curricula: previous.curricula.map(c => c.id === selectedId ? { ...c, status: 'approved', teacherReviewed: true, alignment: { ...c.alignment, review: { status: 'confirmed', confirmedAt, confirmedBy: 'public-demo-teacher', note: 'ブラウザ内のデモ確認' } } } : c) }));
    setError(''); notify('このブラウザで教員確認を完了しました。授業を作成できます。');
  };
  const createLesson = () => {
    if (selected.status !== 'approved' || !selected.teacherReviewed) { setError('教材を確認・承認してから授業を作成してください。'); return; }
    const snapshot = structuredClone(selected);
    const created = { id: newId('lesson'), curriculumId: selected.id, title: snapshot.title, duration: snapshot.duration, stages: snapshot.stages, objectives: snapshot.objectives, assessment: snapshot.assessment, status: 'scheduled', stageIndex: 0, baseline: null, response: null };
    onChange(previous => ({ ...previous, lessons: [...previous.lessons, created] }));
    setLessonId(created.id); notify('作成時の教材を固定した授業を追加しました。生徒画面でも確認できます。');
  };
  const progress = action => {
    onChange(previous => ({ ...previous, lessons: previous.lessons.map(l => {
      if (l.id !== lessonId) return l;
      if (action === 'start' && l.status === 'scheduled') return { ...l, status: 'active', stageIndex: 0 };
      if (action === 'next' && l.status === 'active' && l.stageIndex < l.stages.length - 1) return { ...l, stageIndex: l.stageIndex + 1 };
      if (action === 'complete' && l.status === 'active' && l.stageIndex === l.stages.length - 1) return { ...l, status: 'completed' };
      return l;
    }) }));
    notify(action === 'complete' ? '授業を終了しました。生徒画面で授業後の振り返りを体験できます。' : 'このブラウザ内の授業進行を更新しました。');
  };
  const addNote = event => {
    event.preventDefault();
    if (!note.body.trim()) return;
    const created = { id: newId('note'), body: note.body.trim(), date: note.date };
    onChange(previous => ({ ...previous, notes: [...previous.notes, created] }));
    setNote(previous => ({ ...previous, body: '' })); notify('このブラウザの生徒画面に共有メモを追加しました。');
  };
  return <div className="stack">
    <BrowserNotice />
    <section className="stack pd-section"><h2>1. 企業から届いた教材を採用する</h2>{!library.length && <p className="pd-empty">企業画面で教材を「学校へ提供」すると、ここに表示されます。</p>}<div className="pd-grid">{library.map(c => {
      const adopted = mine.find(copy => copy.sourceId === c.id);
      return <CurriculumCard key={c.id} curriculum={c}><button className="btn" onClick={() => adopted ? choose(adopted.id) : adopt(c)}>{adopted ? '採用済みの教材を開く' : '自校用に採用する'}</button></CurriculumCard>;
    })}</div></section>
    <section className="stack pd-section"><h2>2. 採用した教材を編集・確認する</h2>{!mine.length && <p className="pd-empty">まず教材を採用すると、教員用コピーを編集できます。</p>}<div className="pd-grid">{mine.map(c => <CurriculumCard key={c.id} curriculum={c}><button className="btn" onClick={() => choose(c.id)}>最終編集・確認を開く</button></CurriculumCard>)}</div></section>
    {error && <p className="notice alert" role="alert">{error}</p>}
    {selected && <CurriculumEditor curriculum={selected} teacher onEdit={edit}>
      {selected.teacherReviewed && selected.status === 'approved' ? <p className="notice">教員確認済みです。内容を変更すると確認は解除されます。</p> : <label className="check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>公式資料の対応候補、自校の目標・単元の位置付け、活動・評価の内容を確認しました。</span></label>}
      <div className="pd-actions"><button className="btn" disabled={!confirmed || selected.status === 'approved'} onClick={approve}>内容を確認して承認する</button><button className="btn primary" disabled={selected.status !== 'approved' || !selected.teacherReviewed} onClick={createLesson}>この教材から授業を作成する</button></div>
    </CurriculumEditor>}
    <section className="stack pd-section"><h2>3. 授業の段階を進める</h2><p className="small muted">作成した授業は、その時点の活動・目標を保持します。生徒画面と役割を切り替えて、授業前後の自己評価も体験できます。</p>{!state.lessons.length && <p className="pd-empty">教材を確認・承認したら、授業を作成しましょう。</p>}<div className="pd-grid">{state.lessons.map(l => <button key={l.id} className={`card pd-card ${lessonId === l.id ? 'selected' : ''}`} onClick={() => setLessonId(l.id)} aria-pressed={lessonId === l.id}><span className="pd-status">{STATUS[l.status]}</span><h3>{l.title}</h3><span>{l.duration}分 · 授業を開く →</span></button>)}</div>
      {lesson && <section className="panel stack"><div className="spread"><h3>{lesson.title}</h3><span className="pd-status">{STATUS[lesson.status]}</span></div><ol className="pd-progress">{lesson.stages.map((stage, index) => <li key={index} className={index === lesson.stageIndex ? 'active' : ''} aria-current={index === lesson.stageIndex ? 'step' : undefined}>{stage.title}</li>)}</ol>
        <div className="pd-callout"><b>{lesson.stageIndex + 1}. {lesson.stages[lesson.stageIndex].title}（{lesson.stages[lesson.stageIndex].minutes}分）</b><p style={{ whiteSpace: 'pre-wrap' }}>{lesson.stages[lesson.stageIndex].activity}</p><p className="small">進行メモ：{lesson.stages[lesson.stageIndex].teacherNote}</p></div>
        <p className="small muted">授業前自己評価：{lesson.baseline ? `${lesson.baseline.before} / 5（回答済み）` : '未回答。生徒画面で先に回答する流れを体験してください。'} ／ 授業後：{lesson.response ? '回答済み' : '未回答'}</p>
        <div className="pd-actions">{lesson.status === 'scheduled' && <button className="btn primary" onClick={() => progress('start')}>授業を始める</button>}{lesson.status === 'active' && (lesson.stageIndex < lesson.stages.length - 1 ? <button className="btn primary" onClick={() => progress('next')}>次の活動へ進む</button> : <button className="btn primary" onClick={() => progress('complete')}>授業を終了する</button>)}{lesson.status === 'completed' && <p>授業は終了しました。生徒画面から振り返りを入力できます。</p>}</div>
      </section>}
    </section>
    <section className="panel stack pd-section">
      <h2>4. 生徒との対話につなげる（任意）</h2>
      <h3>生徒の探究記録を読む</h3>
      <p className="small muted">架空の学習場面を試すための一覧です。同じブラウザの生徒画面で保存した記録を表示します。別の端末や実際の学校とは共有されません。</p>
      {!state.journeys.length && <p className="pd-empty">生徒画面の「探究4STEP」で記録を保存すると、ここで読めます。</p>}
      {[...state.journeys].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <article className="pd-callout" key={entry.id}>
        <div className="spread"><time dateTime={entry.date}>{entry.date}</time><span className="pd-status">{JOURNEY_STAGE[entry.stage] || entry.stage}</span></div>
        {entry.topic && <h4>{entry.topic}</h4>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{entry.body}</p>
      </article>)}
      <h3>生徒へ共有するメモ</h3>
      <p className="small muted">共有メモは、このブラウザの生徒画面にも表示されます。教員だけの相談記録ではありません。</p>
      <form className="stack" onSubmit={addNote}>
        <label className="field"><span>生徒に共有する問いかけ・面談メモ</span><textarea className="input" rows={3} required maxLength={1500} value={note.body} onChange={event => setNote({ ...note, body: event.target.value })} placeholder="手帳を見ながら、考えが変わった場面を一緒に振り返りましょう。" /></label>
        <label className="field"><span>日付</span><input className="input" type="date" required value={note.date} onChange={event => setNote({ ...note, date: event.target.value })} /></label>
        <button className="btn" type="submit">共有メモを追加する</button>
      </form>
      {state.notes.map(item => <article className="pd-callout" key={item.id}><small>{item.date}</small><p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p></article>)}
    </section>
  </div>;
}
