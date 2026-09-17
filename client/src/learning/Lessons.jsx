import { useEffect, useState } from 'react';
import { api, num, pct } from '../api.js';
import { useApi, Loading, ErrorBox, Field, Rating, useToast } from '../ui.jsx';
import { LearningHeader, StatusPill, LearningEmpty } from './LearningUI.jsx';
const TAGS = [
  'ものづくり・工学',
  '情報・デジタル',
  '医療・看護・福祉',
  '教育・子ども',
  '環境・エネルギー',
  '食・農業',
  '地域・まちづくり',
  '経済・ビジネス',
  '国際・語学',
  '法律・政治・行政',
  '芸術・デザイン',
  'メディア・エンタメ',
  'スポーツ・健康',
  '自然科学・研究',
  '観光・交通',
  '心理・人間関係',
];
const emptyReflection = () => ({ after: null, learning: '', nextAction: '', interests: [] });
const reflectionFields = (value = {}) => ({
  after: [1, 2, 3, 4, 5].includes(value.after) ? value.after : null,
  learning: typeof value.learning === 'string' ? value.learning.slice(0, 3000) : '',
  nextAction: typeof value.nextAction === 'string' ? value.nextAction.slice(0, 1000) : '',
  interests: Array.isArray(value.interests) ? value.interests.filter((t) => TAGS.includes(t)).slice(0, 3) : [],
});
export default function LessonWorkspace({ role = 'teacher', user }) {
  const list = useApi('/learning/lessons'),
    [id, setId] = useState(null);
  if (list.loading && !list.data) return <Loading />;
  return (
    <div className="stack lr-page">
      <LearningHeader
        eyebrow="CLASSROOM / LEARNING JOURNEY"
        title={role === 'teacher' ? '今日の探究を、一歩ずつ。' : '社会の問いに、自分の答えを。'}
        description={
          role === 'teacher'
            ? '授業の流れを共有し、生徒の気づきと変化を確かめましょう。'
            : '企業の現場から届いた問いを考え、学びを未来につなげましょう。'
        }
        variant="lesson"
      />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {!list.data?.lessons.length && (
        <LearningEmpty title="授業の準備を待っています">
          {role === 'teacher'
            ? '教材ライブラリで教材を採用・最終承認して授業を作成してください。'
            : '先生が授業を配信すると、ここに表示されます。'}
        </LearningEmpty>
      )}
      <div className="lesson-list">
        {list.data?.lessons.map((l) => (
          <button
            className={`lesson-row ${id === l.id ? 'selected' : ''}`}
            key={l.id}
            onClick={() => setId(l.id)}
          >
            <span className="lesson-symbol">▤</span>
            <span className="grow">
              <small>
                {l.className} · {l.duration}分
              </small>
              <strong>{l.title}</strong>
            </span>
            <StatusPill status={l.status} />
            <span>→</span>
          </button>
        ))}
      </div>
      {id && <LessonDetail key={`${user?.id || role}:${id}`} id={id} role={role} user={user} onUpdate={list.reload} />}
    </div>
  );
}
function LessonDetail({ id, role, user, onUpdate }) {
  const detail = useApi(`/learning/lessons/${id}`),
    results = useApi(role === 'teacher' ? `/learning/lessons/${id}/results` : null),
    toast = useToast();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [form, setForm] = useState(emptyReflection),
    [before, setBefore] = useState(null),
    [loaded, setLoaded] = useState(false),
    [draftCandidate, setDraftCandidate] = useState(null),
    [draftDirty, setDraftDirty] = useState(false),
    [draftNote, setDraftNote] = useState(''),
    [savedRevision, setSavedRevision] = useState(null);
  const draftKey = role === 'student' && user?.id ? `mirai-next:reflection:student:${user.id}:lesson:${id}` : null;
  useEffect(() => {
    if (detail.data && !loaded) {
      setForm(reflectionFields(detail.data.response || {}));
      setSavedRevision(detail.data.response?.submittedAt || null);
      if (draftKey) {
        try {
          const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
          if (saved?.version === 1 && saved.form) setDraftCandidate(saved);
        } catch {
          setDraftNote('この端末では下書きを読み込めませんでした。');
        }
      }
      setLoaded(true);
    }
  }, [detail.data, loaded, draftKey]);
  useEffect(() => {
    if (!draftKey || !loaded || !draftDirty || draftCandidate) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), baseSubmittedAt: savedRevision, form }));
      setDraftNote('この端末に下書きを保存しました。まだ先生には送信されていません。');
    } catch {
      setDraftNote('下書きを端末に保存できません。画面を閉じる前に内容を控えてください。');
    }
  }, [draftKey, loaded, draftDirty, draftCandidate, savedRevision, form]);
  useEffect(() => {
    if (detail.data && !draftDirty && !draftCandidate) setSavedRevision(detail.data.response?.submittedAt || null);
  }, [detail.data, draftDirty, draftCandidate]);
  const changeForm = (next) => {
    setForm(next);
    setDraftDirty(true);
  };
  const removeDraft = () => {
    try {
      if (draftKey) localStorage.removeItem(draftKey);
      return true;
    } catch { return false; }
  };
  const discardDraft = () => {
    if (!window.confirm('この端末の下書きを削除します。提出済みの内容は残ります。よろしいですか？')) return;
    if (!removeDraft()) {
      setDraftNote('下書きを削除できませんでした。ブラウザのサイトデータ削除機能で消去してください。');
      return;
    }
    setDraftCandidate(null);
    setDraftDirty(false);
    setForm(reflectionFields(detail.data?.response || {}));
    setSavedRevision(detail.data?.response?.submittedAt || null);
    setDraftNote('この端末の下書きを削除しました。');
  };
  const saveBaseline = async (e) => {
    e.preventDefault();
    if (![1, 2, 3, 4, 5].includes(before)) return;
    setBusy(true);
    setError(null);
    try {
      await api.put(`/learning/lessons/${id}/baseline`, { before });
      await detail.reload();
      toast('授業前の自己評価を保存しました');
    } catch (x) { setError(x); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const t = setInterval(() => {
      detail.reload();
      if (role === 'teacher') results.reload();
    }, 15000);
    return () => clearInterval(t);
  }, [id]);
  const act = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/learning/lessons/${id}/progress`, { action });
      await detail.reload();
      await onUpdate();
      toast('授業の進行を更新しました');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (![1, 2, 3, 4, 5].includes(form.after)) {
      setError(new Error('授業後の自己評価を1〜5から選んでください。'));
      return;
    }
    if (detail.data?.response && !window.confirm('提出済みの振り返りを、この内容で更新します。よろしいですか？')) return;
    if (savedRevision !== (detail.data?.response?.submittedAt || null) && !window.confirm('別の画面で回答が更新されています。今の入力内容で上書きしますか？')) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.put(`/learning/lessons/${id}/response`, form);
      setDraftDirty(false);
      const draftRemoved = removeDraft();
      setDraftCandidate(null);
      setDraftNote(draftRemoved ? '保存が完了し、この端末の下書きを削除しました。' : '提出は完了しましたが端末の下書きを削除できませんでした。ブラウザのサイトデータ削除機能で消去してください。');
      if (result.response?.submittedAt) setSavedRevision(result.response.submittedAt);
      toast('学びを保存しました。キャリアと手帳記録にも反映されます');
      await detail.reload();
    } catch (x) {
      setError(x);
    } finally {
      setBusy(false);
    }
  };
  if (!detail.data) return detail.error ? <ErrorBox error={detail.error} /> : <Loading />;
  const l = detail.data.lesson,
    s = l.stages[l.stageIndex],
    baseline = detail.data.baseline || (detail.data.response ? { before: detail.data.response.before, submittedAt: detail.data.response.submittedAt } : null),
    canSaveBaseline = !baseline && (l.status === 'planned' || (l.status === 'active' && l.stageIndex === 0)),
    canSubmit = l.status === 'completed' && !!baseline;
  return (
    <section className="panel stack lesson-detail">
      <div className="spread">
        <div>
          <span className="eyebrow">CLASS IN PROGRESS</span>
          <h2>{l.title}</h2>
        </div>
        <button
          className="btn small"
          onClick={() => {
            detail.reload();
            results.reload();
          }}
        >
          最新の状態に更新
        </button>
      </div>
      <div className="lesson-steps">
        {l.stages.map((s, i) => (
          <div key={i} className={i === l.stageIndex ? 'current' : i < l.stageIndex ? 'done' : ''}>
            <span>{i < l.stageIndex ? '✓' : i + 1}</span>
            <b>{s.title}</b>
            <small>{s.minutes}分</small>
          </div>
        ))}
      </div>
      <div className="current-activity">
        <span className="eyebrow">
          STEP {l.stageIndex + 1} / {l.stages.length} · {s.minutes} MIN
        </span>
        <h2>{s.title}</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{s.activity}</p>
        {role === 'teacher' && (
          <p className="activity-note">
            <b>進行のヒント</b> {s.teacherNote}
          </p>
        )}
      </div>
      <ErrorBox error={error} />
      {role === 'teacher' ? (
        <>
          <div className="spread">
            <span className="muted small">最初の活動を進める前に、生徒へ授業前評価の保存を案内してください。生徒画面は15秒ごとに更新されます。</span>
            {l.status === 'planned' ? (
              <button className="btn primary" disabled={busy} onClick={() => act('start')}>
                授業を開始する →
              </button>
            ) : l.status === 'active' ? (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => act(l.stageIndex === l.stages.length - 1 ? 'complete' : 'next')}
              >
                {l.stageIndex === l.stages.length - 1 ? '授業を終了する' : '次の活動へ進む →'}
              </button>
            ) : (
              <StatusPill status="completed" />
            )}
          </div>
          <hr />
          <h3>学びの変化を確かめる</h3>
          <ErrorBox error={results.error} />
          {results.data && (
            <>
              <div className="cards">
                <div className="card">
                  <div className="label">振り返り提出</div>
                  <div className="value">
                    {results.data.summary.responseCount}
                    <small>/ {results.data.summary.studentCount}人</small>
                  </div>
                </div>
                <div className="card">
                  <div className="label">授業前の自己評価</div>
                  <div className="value">
                    {num(results.data.summary.beforeAverage)}
                    <small>/ 5</small>
                  </div>
                </div>
                <div className="card">
                  <div className="label">授業後の自己評価</div>
                  <div className="value">
                    {num(results.data.summary.afterAverage)}
                    <small>/ 5</small>
                  </div>
                </div>
              </div>
              <p className="muted small">
                {results.data.summary.measurementNote} 回答率{' '}
                {pct(results.data.summary.responseRate)}
              </p>
              {results.data.responses.map((x) => (
                <article className="response-card" key={x.studentId}>
                  <div className="spread">
                    <b>出席番号 {x.attendanceNo}番</b>
                    <span className="badge">
                      理解度 {x.before} → {x.after}
                    </span>
                  </div>
                  <p>{x.learning}</p>
                  <p className="muted">
                    <b>次の行動：</b>
                    {x.nextAction}
                  </p>
                  <div>
                    {x.interests.map((t) => (
                      <span className="tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </>
          )}
        </>
      ) : (
        <div className="stack">
          <section className="lr-baseline-panel stack" aria-labelledby="baseline-title">
            <div>
              <span className="eyebrow">BEFORE CLASS</span>
              <h2 id="baseline-title">授業を始める前の、自分を記録。</h2>
              <p className="muted small">このテーマをどのくらい知っていますか？ 授業後とは別に保存します。</p>
            </div>
            {baseline ? (
              <div className="notice">
                <p>授業前の自己評価：<b>{baseline.before} / 5</b>（保存済み・変更できません）</p>
                {baseline.source === 'legacy_response' && <p className="small">過去の振り返りに含まれていた回答です。授業前に別途計測した値ではありません。</p>}
              </div>
            ) : canSaveBaseline ? (
              <form className="stack" onSubmit={saveBaseline}>
                <Rating label="授業前の理解度（必須）" low="初めて知った" high="よく知っている" value={before} onChange={setBefore} />
                <button className="btn primary" disabled={busy || before === null}>
                  {busy ? '保存中…' : '授業前の自己評価を保存する'}
                </button>
                <p className="muted small">1〜5を選んでください。保存した授業前の値は後から変えられません。</p>
              </form>
            ) : (
              <p className="notice warn">授業前の評価は未回答です。受付時間を過ぎたため、先生にお知らせください。</p>
            )}
          </section>
          {l.status === 'planned' ? (
            <div className="notice">授業前の評価を保存したら、先生の開始を待ちましょう。</div>
          ) : (
            <form className="stack reflection-form" onSubmit={submit}>
              <div>
                <span className="eyebrow">REFLECTION</span>
                <h2>今日の発見を、未来の一歩に。</h2>
                <p className="muted small">テストではありません。気づきを下書きし、授業終了後に自己評価を選んで提出しましょう。</p>
              </div>
              {draftCandidate && (
                <div className="notice warn stack" role="status">
                  <p>この端末に前回の下書きがあります。提出済みの回答は自動では上書きしません。
                    {draftCandidate.baseSubmittedAt !== (detail.data.response?.submittedAt || null) && ' 下書き作成後に提出済みの回答が更新されているため、内容を見比べてください。'}
                  </p>
                  <div className="row lr-wrap">
                    <button type="button" className="btn" onClick={() => {
                      setForm(reflectionFields(draftCandidate.form));
                      setSavedRevision(draftCandidate.baseSubmittedAt || null);
                      setDraftCandidate(null);
                      setDraftDirty(true);
                    }}>下書きを読み込む</button>
                    <button type="button" className="btn ghost" onClick={discardDraft}>下書きを削除する</button>
                  </div>
                </div>
              )}
              <fieldset className="lr-reflection-fields stack" disabled={busy || !!draftCandidate}>
                {l.status === 'completed' ? (
                  <div>
                    <h3>今は、どのくらい理解できた？</h3>
                    <Rating label="授業後の理解度（必須）" low="まだ難しい" high="説明できる" value={form.after} onChange={(v) => changeForm({ ...form, after: v })} />
                    <p className="muted small">{form.after === null ? '1〜5から選択してください（未回答）。' : `現在の選択：${form.after} / 5`}</p>
                  </div>
                ) : <p className="notice">授業中は下書きできます。自己評価と提出は、先生が授業を終了すると開きます。</p>}
                <Field label="今日、気づいたこと・学んだこと">
                  <textarea className="input" required maxLength={3000} value={form.learning} onChange={(e) => changeForm({ ...form, learning: e.target.value })} placeholder="最初はこう思っていたけれど…" />
                </Field>
                <Field label="次に試してみたい、小さな行動">
                  <input className="input" required maxLength={1000} value={form.nextAction} onChange={(e) => changeForm({ ...form, nextAction: e.target.value })} placeholder="もっと調べたいこと、話を聞きたい人など" />
                </Field>
                <div>
                  <h3>気になった分野（3つまで）</h3>
                  <div className="interest-options">
                    {TAGS.map((t) => (
                      <button type="button" key={t} className={form.interests.includes(t) ? 'selected' : ''} aria-pressed={form.interests.includes(t)} onClick={() => changeForm({ ...form, interests: form.interests.includes(t) ? form.interests.filter((x) => x !== t) : form.interests.length < 3 ? [...form.interests, t] : form.interests })}>{t}</button>
                    ))}
                  </div>
                </div>
                <button className="btn primary" disabled={!canSubmit || form.after === null}>
                  {busy ? '保存中…' : detail.data.response ? '振り返りを更新する' : '確認して学びを保存する →'}
                </button>
                {!baseline && (canSaveBaseline
                  ? <p className="notice">先に上の授業前評価を保存してください。気づきは下書きしておけます。</p>
                  : <p className="notice warn">授業前の評価が未回答のため、前後比較には参加できません。先生に知らせ、学びは <a href="#/capture">手帳の記録</a> から残してください。</p>)}
              </fieldset>
              <div className="lr-draft-status stack">
                <p className="muted small" role="status">{draftNote || '入力内容は、この端末のブラウザに下書きとして保存されます。'}</p>
                <p className="muted small">共有端末では下書きが残ることがあります。使用後は下書きを削除してログアウトしてください。下書きは他の端末には引き継がれません。</p>
                {(draftDirty || draftCandidate) && <button type="button" className="btn ghost small" onClick={discardDraft}>この端末の下書きを削除</button>}
              </div>
              {detail.data.response && <p className="notice">提出済みです。内容は「わたしの未来」と「手帳の記録」に反映されています。</p>}
            </form>
          )}
        </div>
      )}
    </section>
  );
}
