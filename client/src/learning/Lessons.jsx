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
export default function LessonWorkspace({ role = 'teacher' }) {
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
      {id && <LessonDetail key={id} id={id} role={role} onUpdate={list.reload} />}
    </div>
  );
}
function LessonDetail({ id, role, onUpdate }) {
  const detail = useApi(`/learning/lessons/${id}`),
    results = useApi(role === 'teacher' ? `/learning/lessons/${id}/results` : null),
    toast = useToast();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [form, setForm] = useState({
      before: 3,
      after: 3,
      learning: '',
      nextAction: '',
      interests: [],
    }),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (detail.data && !loaded) {
      if (detail.data.response) setForm(detail.data.response);
      setLoaded(true);
    }
  }, [detail.data, loaded]);
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
    setBusy(true);
    setError(null);
    try {
      await api.put(`/learning/lessons/${id}/response`, form);
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
    s = l.stages[l.stageIndex];
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
            <span className="muted small">生徒画面は15秒ごとに更新されます。</span>
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
      ) : l.status === 'planned' ? (
        <div className="notice">授業が始まるまで、問いを読んで考えてみましょう。</div>
      ) : (
        <form className="stack reflection-form" onSubmit={submit}>
          <div>
            <span className="eyebrow">REFLECTION</span>
            <h2>今日の発見を、未来の一歩に。</h2>
            <p className="muted small">テストではありません。今の自分の実感で答えてください。</p>
          </div>
          <div className="two-col">
            <div>
              <h3>授業前は、どのくらい知っていた？</h3>
              <Rating
                label="授業前の理解度"
                low="初めて知った"
                high="よく知っていた"
                value={form.before}
                onChange={(v) => setForm({ ...form, before: v })}
              />
            </div>
            <div>
              <h3>今は、どのくらい理解できた？</h3>
              <Rating
                label="授業後の理解度"
                low="まだ難しい"
                high="説明できる"
                value={form.after}
                onChange={(v) => setForm({ ...form, after: v })}
              />
            </div>
          </div>
          <Field label="今日、気づいたこと・学んだこと">
            <textarea
              className="input"
              required
              maxLength={3000}
              value={form.learning}
              onChange={(e) => setForm({ ...form, learning: e.target.value })}
              placeholder="最初はこう思っていたけれど…"
            />
          </Field>
          <Field label="次に試してみたい、小さな行動">
            <input
              className="input"
              required
              maxLength={1000}
              value={form.nextAction}
              onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
              placeholder="もっと調べたいこと、話を聞きたい人など"
            />
          </Field>
          <div>
            <h3>気になった分野（3つまで）</h3>
            <div className="interest-options">
              {TAGS.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={form.interests.includes(t) ? 'selected' : ''}
                  aria-pressed={form.interests.includes(t)}
                  onClick={() =>
                    setForm({
                      ...form,
                      interests: form.interests.includes(t)
                        ? form.interests.filter((x) => x !== t)
                        : form.interests.length < 3
                          ? [...form.interests, t]
                          : form.interests,
                    })
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary" disabled={busy}>
            {busy
              ? '保存中…'
              : detail.data.response
                ? '振り返りを更新する'
                : '確認して学びを保存する →'}
          </button>
          {detail.data.response && (
            <p className="notice">
              提出済みです。内容は「わたしの未来」と「手帳の記録」に反映されています。
            </p>
          )}
        </form>
      )}
    </section>
  );
}
