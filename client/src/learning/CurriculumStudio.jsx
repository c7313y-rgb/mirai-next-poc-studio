import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useApi, Loading, ErrorBox, Field, useToast } from '../ui.jsx';
import { LearningHeader, LearningEmpty, StatusPill, StepStrip } from './LearningUI.jsx';

const EMPTY_SOURCE = {
  title: '',
  sourceContent: '',
  audience: '高校1〜2年生',
  subject: '総合的な探究の時間',
  duration: 50,
  schoolLevel: 'high',
  guidelineId: 'high_inquiry',
};
const EXAMPLE_SOURCE = {
  ...EMPTY_SOURCE,
  title: '手帳から考える、自分らしい時間の使い方',
  sourceContent:
    '私たちは、手帳を通して一人ひとりの目標づくりと毎日の行動を応援しています。予定を記録するだけでなく、できたことや気づきを振り返り、次の小さな行動につなげることを大切にしています。授業では、日常の時間の使い方を見える化し、友人と対話しながら、自分に合う計画と振り返りの方法を考えてほしいです。',
};
const toEditor = (c) => ({
  ...c,
  objectivesText: (c.objectives || []).join('\n'),
  stages: (c.stages || []).map((s) => ({ ...s })),
  alignment: structuredClone(c.alignment),
});

export default function CurriculumStudio({ role = 'company' }) {
  const teacher = role === 'teacher';
  const list = useApi('/learning/curricula');
  const guidance = useApi('/learning/curriculum-guidance');
  const classes = useApi(teacher ? '/teacher/classes' : null);
  const toast = useToast();
  const editorRef = useRef(null);
  const [tab, setTab] = useState(teacher ? 'library' : 'all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [editor, setEditor] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [classId, setClassId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [alignmentConfirmed, setAlignmentConfirmed] = useState(false);
  const profiles = guidance.data?.profiles || [];
  const curricula = list.data?.curricula || [];
  const mine = curricula.filter((c) => !!c.teacherId);
  const library = curricula.filter((c) => !c.teacherId && c.status === 'published');
  const visible = (teacher ? (tab === 'mine' ? mine : library) : curricula).filter((c) =>
    `${c.title} ${c.companyName} ${c.subject}`.toLowerCase().includes(query.toLowerCase()),
  );
  const editable = !!editor && (!teacher || !!editor.teacherId);
  const totalMinutes = editor?.stages.reduce((sum, s) => sum + Number(s.minutes || 0), 0) || 0;
  const patch = (values) => {
    setEditor((old) => ({ ...old, ...values }));
    setDirty(true);
    setAlignmentConfirmed(false);
  };
  const openEditor = (curriculum) => {
    if (dirty && !window.confirm('未保存の変更があります。別の教材を開くと変更は失われます。開きますか？')) return;
    setEditor(toEditor(curriculum));
    setCreating(false);
    setDirty(false);
    setError(null);
    setClassId('');
    setAlignmentConfirmed(false);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
  };
  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  };
  const generate = (event) => {
    event.preventDefault();
    run('generate', async () => {
      const data = await api.post('/learning/curricula/generate', source);
      openEditor(data.curriculum);
      await list.reload();
      toast('授業のたたき台を作成しました。内容を確認・編集してください');
    });
  };
  const save = async () => {
    const data = await api.put(`/learning/curricula/${editor.id}`, {
      title: editor.title,
      audience: editor.audience,
      subject: editor.subject,
      objectives: editor.objectivesText
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean),
      stages: editor.stages.map((s) => ({ ...s, minutes: Number(s.minutes) })),
      assessment: editor.assessment,
      alignment: editor.alignment,
    });
    setEditor(toEditor(data.curriculum));
    setDirty(false);
    await list.reload();
    return data.curriculum;
  };
  const transition = (action) =>
    run(action, async () => {
      if (dirty) await save();
      const data = await api.post(`/learning/curricula/${editor.id}/${action}`, action === 'approve' ? { alignmentConfirmed } : {});
      setEditor(toEditor(data.curriculum));
      setDirty(false);
      await list.reload();
      if (action === 'adopt') {
        setTab('mine');
        toast('自校用のコピーを作成しました。授業に合わせて編集できます');
      } else
        toast(
          action === 'publish'
            ? '学校向けの教材ライブラリに提供しました'
            : '授業に使用できる教材として最終承認しました',
        );
    });
  const changeGuidance = (guidelineId) => run('guidance', async () => {
    const profile = profiles.find(p => p.id === guidelineId);
    if (!profile) return;
    if (!window.confirm('選んだ校種・教科の対応候補を作り直します。編集した対応目標・評価証拠と自校の目標は再入力になります。続けますか？')) return;
    const data = await api.post(`/learning/curricula/${editor.id}/guidance-preview`, { title: editor.title, audience: editor.audience, subject: profile.subject, schoolLevel: profile.schoolLevel, guidelineId });
    patch({ alignment: data.alignment, subject: profile.subject });
  });
  const createLesson = (event) => {
    event.preventDefault();
    run('lesson', async () => {
      await api.post('/learning/lessons', {
        curriculumId: editor.id,
        classId: Number(classId),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      });
      toast('授業を作成しました。「授業の進行」から開始できます');
      setClassId('');
      setScheduledAt('');
    });
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;

  return (
    <div className="stack lr-page">
      <LearningHeader
        imageSrc={!teacher ? '/images/enterprise-v2.webp' : undefined}
        imageAlt="企業の技術者と教員が素材を囲んで授業を考える架空のシーン"
        imageNote="AI生成イメージ"
        eyebrow={teacher ? 'TEACHER / CURRICULUM' : 'PARTNER / CURRICULUM STUDIO'}
        title={teacher ? '社会とつながる、授業づくり。' : '企業の知見を、学びのきっかけに。'}
        description={
          teacher
            ? '企業の教材を選び、クラスに合わせて仕上げる。最終承認した教材から、すぐに授業を準備できます。'
            : '伝えたい事業や取り組みを入力するだけで、問い・活動・振り返りを備えた授業のたたき台へ。'
        }
      >
        {!teacher && (
          <button
            className="btn primary"
            onClick={() => {
              if (dirty && !window.confirm('未保存の変更があります。新しい教材の作成に移動しますか？')) return;
              setDirty(false);
              setCreating(true);
              setEditor(null);
              setError(null);
            }}
          >
            ＋ 新しい教材をつくる
          </button>
        )}
      </LearningHeader>
      <StepStrip
        items={
          teacher
            ? ['教材を採用', '自校向けに編集', '最終承認', 'クラスへ配信']
            : ['企業コンテンツを入力', '授業案を作成・編集', '学校へ提供']
        }
        active={
          editor
            ? teacher
              ? editor.status === 'approved'
                ? 2
                : editor.teacherId
                  ? 1
                  : 0
              : editor.status === 'published'
                ? 2
                : 1
            : 0
        }
      />

      {creating && (
        <section className="panel stack lr-editor">
          <div className="spread">
            <div>
              <span className="lr-eyebrow">STEP 01</span>
              <h2>企業コンテンツを教材にする</h2>
            </div>
            <button className="btn ghost small" onClick={() => setCreating(false)}>
              閉じる
            </button>
          </div>
          <p className="lr-note">
            入力した企業の文章から、根拠となる記述と学習指導要領の対応候補を組み合わせて授業案を作成します。内容は外部AIへ送信しません。教員が自校の目標と評価方法を確認して仕上げます。
          </p>
          <form className="stack" onSubmit={generate}>
            <Field label="教材のタイトル">
              <input
                className="input"
                required
                maxLength={200}
                placeholder="例：身近な製品から考える、持続可能な社会"
                value={source.title}
                onChange={(e) => setSource({ ...source, title: e.target.value })}
              />
            </Field>
            <Field
              label="授業のもとになる企業コンテンツ"
              hint="事業の紹介・生徒に考えてほしい問いに加え、末尾に資料名・出典URL・使用許諾の範囲を記載してください。"
            >
              <textarea
                className="input lr-source"
                required
                minLength={30}
                maxLength={20000}
                placeholder={"私たちの会社が取り組んでいることは…\n生徒に考えてほしい問い：…\n出典（資料名・URL）：…\n使用できる範囲・条件：…"}
                value={source.sourceContent}
                onChange={(e) => setSource({ ...source, sourceContent: e.target.value })}
              />
            </Field>
            <p className="lr-note">
              自社で権利を保有するか、授業利用の許諾を得た内容を入力してください。個人情報や社外秘は含めず、引用部分と出典を明確にしてください。公開前に担当者による確認が必要です。
            </p>
            <div className="lr-form-three">
              <Field label="参照する校種・教科">
                <select className="input" value={source.guidelineId} disabled={!profiles.length} onChange={(e) => {
                  const profile = profiles.find(p => p.id === e.target.value);
                  setSource({ ...source, guidelineId: profile.id, schoolLevel: profile.schoolLevel, subject: profile.subject, audience: profile.schoolLevel === 'middle' ? '中学1〜3年生' : '高校1〜2年生' });
                }}>
                  {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                </select>
              </Field>
              <Field label="対象学年">
                <input
                  className="input"
                  required
                  maxLength={100}
                  value={source.audience}
                  onChange={(e) => setSource({ ...source, audience: e.target.value })}
                />
              </Field>
              <Field label="教科・領域">
                <input
                  className="input"
                  required
                  maxLength={100}
                  value={source.subject}
                  onChange={(e) => setSource({ ...source, subject: e.target.value })}
                />
              </Field>
              <Field label="授業時間">
                <select
                  className="input"
                  value={source.duration}
                  onChange={(e) => setSource({ ...source, duration: Number(e.target.value) })}
                >
                  <option value={50}>50分（1コマ）</option>
                  <option value={100}>100分（2コマ）</option>
                </select>
              </Field>
            </div>
            <ErrorBox error={error} />
            <div className="spread lr-wrap">
              <button className="btn ghost" type="button" onClick={() => setSource(EXAMPLE_SOURCE)}>
                入力例を使って試す
              </button>
              <button className="btn primary" disabled={!!busy}>
                {busy === 'generate' ? '授業案を作成中…' : '授業のたたき台を作成 →'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="stack">
        <div className="spread lr-wrap">
          <div>
            <span className="lr-eyebrow">{teacher ? 'CURRICULUM LIBRARY' : 'YOUR CONTENTS'}</span>
            <h2>
              {teacher ? '教材ライブラリ' : '作成したカリキュラム'}{' '}
              <span className="lr-count">
                {teacher ? (tab === 'mine' ? mine.length : library.length) : curricula.length}
              </span>
            </h2>
          </div>
          <input
            className="input lr-search"
            type="search"
            aria-label="教材を検索"
            placeholder="教材名・企業・教科で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {teacher && (
          <div className="lr-tabs" role="group" aria-label="教材の種類">
            <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
              企業からの提供教材 <span>{library.length}</span>
            </button>
            <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
              自校で使う教材 <span>{mine.length}</span>
            </button>
          </div>
        )}
        {!visible.length && (
          <LearningEmpty
            title={
              query
                ? '条件に合う教材がありません'
                : teacher
                  ? '教材はまだありません'
                  : '最初の教材をつくりましょう'
            }
          >
            {query
              ? '検索語を変えてもう一度お試しください。'
              : teacher
                ? '企業が提供した教材、または採用した教材がここに表示されます。'
                : '自社の取り組みや大切にしている考えを、学校に届ける授業へ。'}
          </LearningEmpty>
        )}
        <div className="lr-curriculum-grid">
          {visible.map((c, i) => (
            <article
              className={`panel lr-curriculum-card ${editor?.id === c.id ? 'selected' : ''}`}
              key={c.id}
            >
              <div className={`lr-card-cover lr-card-cover-${i % 3}`}>
                <img className="lr-card-scene" src="/images/enterprise-v2.webp" alt="" loading="lazy" />
                <span>{c.subject}</span>
                <b>
                  {c.duration} <small>MIN</small>
                </b>
              </div>
              <div className="lr-card-body">
                <div className="spread">
                  <span className="lr-card-company">{c.companyName || '企業提供教材'}</span>
                  <StatusPill status={c.status} />
                </div>
                <h3>{c.title}</h3>
                <p className="lr-card-description">
                  {c.objectives?.[0] || c.sourceContent?.slice(0, 85)}
                </p>
                <div className="lr-card-meta">
                  <span>{c.audience}</span>
                  <span>{c.stages?.length || 0}つの活動</span>
                </div>
                <button className="btn lr-card-button" onClick={() => openEditor(c)}>
                  {teacher && !c.teacherId ? '教材の内容を見る' : 'カリキュラムを開く'}{' '}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {editor && (
        <section ref={editorRef} className="panel stack lr-editor">
          <div className="spread lr-wrap">
            <div>
              <span className="lr-eyebrow">
                {editable ? 'CURRICULUM EDITOR' : 'CURRICULUM PREVIEW'}
              </span>
              <h2>{editable ? '授業に合わせて、仕上げる。' : editor.title}</h2>
            </div>
            <div className="row">
              <StatusPill status={editor.status} />
              <button
                className="btn ghost small"
                onClick={() => {
                  if (!dirty || window.confirm('保存していない変更があります。閉じますか？'))
                    setEditor(null);
                }}
              >
                閉じる
              </button>
            </div>
          </div>
          {editor.status === 'approved' && editable && (
            <p className="lr-note">
              承認後に教材を編集・保存すると、下書きに戻ります。作成済みの授業には、作成時の教材内容が保存されています。
            </p>
          )}
          {!editable && (
            <p className="lr-note">
              採用すると自校用のコピーが作成されます。問いや活動をクラスに合わせて編集し、教員が最終承認します。
            </p>
          )}
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              run('save', async () => {
                await save();
                toast('変更を保存しました');
              });
            }}
          >
            <Field label="教材タイトル">
              <input
                className="input"
                required
                maxLength={200}
                disabled={!editable}
                value={editor.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
            <div className="lr-form-two">
              <Field label="対象学年">
                <input
                  className="input"
                  required
                  maxLength={100}
                  disabled={!editable}
                  value={editor.audience || ''}
                  onChange={(e) => patch({ audience: e.target.value })}
                />
              </Field>
              <Field label="教科・領域">
                <input
                  className="input"
                  required
                  maxLength={100}
                  disabled={!editable}
                  value={editor.subject || ''}
                  onChange={(e) => patch({ subject: e.target.value })}
                />
              </Field>
            </div>
            <Field label="この授業で目指すこと" hint="1行につき1つの学習目標を入力します。">
              <textarea
                className="input"
                required
                maxLength={5000}
                disabled={!editable}
                value={editor.objectivesText}
                onChange={(e) => patch({ objectivesText: e.target.value })}
              />
            </Field>
            {editor.alignment && (
              <section className="panel stack" aria-label="学習指導要領との対応候補">
                <div className="spread lr-wrap">
                  <h3>学習指導要領と、授業をつなぐ</h3>
                  <span className={`badge ${editor.alignment.review?.status === 'confirmed' && !dirty ? 'ok' : 'warn'}`}>{editor.alignment.review?.status === 'confirmed' && !dirty ? '教員が確認済み' : '教員の確認が必要'}</span>
                </div>
                <p className="lr-note">{editor.alignment.note}</p>
                <Field label="校種・教科の対応候補" hint="選び直すと、資質・能力と探究過程の候補を作り直します。">
                  <select className="input" value={editor.alignment.guidelineId} disabled={!editable || !!busy} onChange={(e) => changeGuidance(e.target.value)}>
                    {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                  </select>
                </Field>
                <p className="muted small">設計の焦点：{editor.alignment.focus}</p>
                <div className="lr-form-two">
                  <Field label="自校で育てたい力・目標" hint="教員の最終承認に必要です。学校の目標と今回の授業の関係を記します。">
                    <textarea className="input" maxLength={2000} disabled={!editable} value={editor.alignment.schoolGoal} placeholder="例：地域の課題を根拠に基づいて考え、他者と協力して提案する力を育てる。" onChange={e => patch({ alignment: { ...editor.alignment, schoolGoal: e.target.value } })} />
                  </Field>
                  <Field label="年間計画・単元での位置" hint="1コマの活動を前後の学びにどうつなげるかを記します。">
                    <textarea className="input" maxLength={1000} disabled={!editable} value={editor.alignment.unitPosition} placeholder="例：2学期の地域探究の導入。次時に聞き取り調査を行う。" onChange={e => patch({ alignment: { ...editor.alignment, unitPosition: e.target.value } })} />
                  </Field>
                </div>
                <Field label="他教科・領域とのつながり">
                  <input className="input" maxLength={1000} disabled={!editable} value={editor.alignment.subjectConnection} onChange={e => patch({ alignment: { ...editor.alignment, subjectConnection: e.target.value } })} />
                </Field>
                <details className="lr-source-details">
                  <summary>三つの資質・能力と、見取る証拠を確認・編集する</summary>
                  <div className="stack">
                  {editor.alignment.pillars.map((pillar, i) => (
                  <div className="lr-form-two" key={pillar.key}>
                    <Field label={pillar.label}>
                      <textarea className="input" maxLength={1500} disabled={!editable} value={pillar.objective} onChange={e => patch({ alignment: { ...editor.alignment, pillars: editor.alignment.pillars.map((p, n) => n === i ? { ...p, objective: e.target.value } : p) } })} />
                    </Field>
                    <Field label="評価の証拠・残す成果物">
                      <textarea className="input" maxLength={1500} disabled={!editable} value={pillar.evidence} onChange={e => patch({ alignment: { ...editor.alignment, pillars: editor.alignment.pillars.map((p, n) => n === i ? { ...p, evidence: e.target.value } : p) } })} />
                    </Field>
                  </div>
                  ))}
                  </div>
                </details>
                <details className="lr-source-details">
                  <summary>四つの探究の過程と、活動の対応を確認・編集する</summary>
                  <div className="stack">
                  {editor.alignment.processes.map((process, i) => (
                  <div className="stack" key={process.key}>
                    <strong>{process.label}</strong>
                    <div className="lr-form-three">
                      <Field label="どの活動で行うか">
                        <select className="input" disabled={!editable} value={process.stageIndex} onChange={e => patch({ alignment: { ...editor.alignment, processes: editor.alignment.processes.map((p, n) => n === i ? { ...p, stageIndex: Number(e.target.value) } : p) } })}>
                          {editor.stages.map((stage, n) => <option key={n} value={n}>{n + 1}. {stage.title}</option>)}
                        </select>
                      </Field>
                      <Field label="生徒の具体的な活動">
                        <textarea className="input" maxLength={1500} disabled={!editable} value={process.activity} onChange={e => patch({ alignment: { ...editor.alignment, processes: editor.alignment.processes.map((p, n) => n === i ? { ...p, activity: e.target.value } : p) } })} />
                      </Field>
                      <Field label="残す証拠">
                        <textarea className="input" maxLength={1500} disabled={!editable} value={process.evidence} onChange={e => patch({ alignment: { ...editor.alignment, processes: editor.alignment.processes.map((p, n) => n === i ? { ...p, evidence: e.target.value } : p) } })} />
                      </Field>
                    </div>
                  </div>
                  ))}
                  </div>
                </details>
                <div className="lr-note">
                  <b>参照した文部科学省の資料</b>
                  {editor.alignment.sourceReferences.map(ref => <p key={ref.url + ref.section}><a href={ref.url} target="_blank" rel="noreferrer">{ref.title} ↗</a><br />{ref.section}（{ref.pages}）</p>)}
                  <span>指導要領の全文や他教科の全項目を自動照合する機能ではありません。</span>
                </div>
              </section>
            )}
            <div className="spread">
              <h3>授業の流れ</h3>
              <span
                className={`lr-time-total ${totalMinutes !== editor.duration ? 'is-warning' : ''}`}
              >
                合計 {totalMinutes} / {editor.duration} 分
              </span>
            </div>
            <p className="muted small">各活動の「問い」「生徒が残す成果」「教員が確かめること」を具体的にすると、授業で使いやすくなります。</p>
            <div className="lr-stage-editor-list">
              {editor.stages.map((s, i) => (
                <div className="lr-stage-editor" key={i}>
                  <div className="lr-stage-number">{String(i + 1).padStart(2, '0')}</div>
                  <div className="stack">
                    <div className="lr-stage-fields">
                      <Field label="活動名">
                        <input
                          className="input"
                          required
                          maxLength={200}
                          disabled={!editable}
                          value={s.title}
                          onChange={(e) =>
                            patch({
                              stages: editor.stages.map((v, n) =>
                                n === i ? { ...v, title: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="時間（分）">
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={100}
                          required
                          disabled={!editable}
                          value={s.minutes}
                          onChange={(e) =>
                            patch({
                              stages: editor.stages.map((v, n) =>
                                n === i ? { ...v, minutes: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="生徒の活動・問い" hint="生徒に見せる内容です。資料の出典や参照URLも、ここに記載してください。">
                      <textarea
                        className="input"
                        required
                        maxLength={5000}
                        disabled={!editable}
                        value={s.activity || ''}
                        onChange={(e) =>
                          patch({
                            stages: editor.stages.map((v, n) =>
                              n === i ? { ...v, activity: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="教員向けの進行メモ" hint="生徒への声かけ・つまずきへの対応・評価の見方などを記載します。">
                      <textarea
                        className="input lr-short-textarea"
                        maxLength={3000}
                        disabled={!editable}
                        value={s.teacherNote || ''}
                        onChange={(e) =>
                          patch({
                            stages: editor.stages.map((v, n) =>
                              n === i ? { ...v, teacherNote: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </Field>
                    {editable && editor.stages.length > 2 && (
                      <button
                        className="btn ghost small lr-remove-stage"
                        type="button"
                        onClick={() => patch({ stages: editor.stages.filter((_, n) => n !== i), alignment: { ...editor.alignment, processes: editor.alignment.processes.map(p => ({ ...p, stageIndex: p.stageIndex > i ? p.stageIndex - 1 : Math.min(p.stageIndex, editor.stages.length - 2) })) } })}
                      >
                        この活動を削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {editable && editor.stages.length < 10 && (
              <button
                className="btn ghost"
                type="button"
                onClick={() =>
                  patch({
                    stages: [
                      ...editor.stages,
                      { title: '', minutes: 5, activity: '', teacherNote: '' },
                    ],
                  })
                }
              >
                ＋ 活動を追加する
              </button>
            )}
            <Field label="振り返り・評価の観点" hint="目標に対して、どの発言・成果物・行動を見取るかを具体的にします。">
              <textarea
                className="input"
                required
                maxLength={5000}
                disabled={!editable}
                value={editor.assessment || ''}
                onChange={(e) => patch({ assessment: e.target.value })}
              />
            </Field>
            <details className="lr-source-details">
              <summary>もとになった企業コンテンツを見る</summary>
              <p>{editor.sourceContent}</p>
              <p className="muted small">全文 {editor.materialAnalysis?.processedCharacters || editor.sourceContent.length}文字を、{editor.materialAnalysis?.fragmentCount || 0}件の記述に分けて参照しています。企業文の内容は自動で事実確認されません。</p>
              {editor.materialAnalysis?.fragments.map(fragment => <p key={fragment.id}><b>[{fragment.id}]</b> {fragment.text}</p>)}
            </details>
            <ErrorBox error={error} />
            {!teacher && (
              <div className="lr-note">
                <b>学校へ提供する前に</b><br />
                内容の正確さ・出典・使用許諾・個人情報の有無を確認してください。提供後は、このPoCの教員向け教材ライブラリに表示されます。特定の学校だけに限定する設定はありません。
              </div>
            )}
            {teacher && editable && (
              <label className="lr-note row">
                <input type="checkbox" checked={alignmentConfirmed} onChange={e => setAlignmentConfirmed(e.target.checked)} />
                <span>参照資料、自校の目標、各活動と評価の証拠を確認しました。教員の判断でこの授業案を承認します。</span>
              </label>
            )}
            <div className="lr-editor-actions">
              {editable ? (
                <>
                  <span className="small muted">
                    {dirty ? '未保存の変更があります' : '保存されています'}
                  </span>
                  <div className="row lr-wrap">
                    <button
                      className="btn"
                      type="submit"
                      disabled={!!busy || !dirty || totalMinutes !== editor.duration}
                    >
                      {busy === 'save' ? '保存中…' : '変更を保存'}
                    </button>
                    {(!teacher || editor.status !== 'approved' || dirty || editor.alignment?.review?.status !== 'confirmed') && (
                      <button
                        className="btn primary"
                        type="button"
                        disabled={
                          !!busy ||
                          totalMinutes !== editor.duration ||
                          !editor.title.trim() ||
                          !editor.objectivesText.trim() ||
                          (teacher && (!alignmentConfirmed || !editor.alignment?.schoolGoal.trim() || !editor.alignment?.unitPosition.trim())) ||
                          editor.stages.some((s) => !s.title.trim() || !s.activity.trim())
                        }
                        onClick={() => transition(teacher ? 'approve' : 'publish')}
                      >
                        {busy === 'approve' || busy === 'publish'
                          ? '処理中…'
                          : teacher
                            ? '保存して最終承認する'
                            : editor.status === 'published' && !dirty
                              ? '学校への提供内容を更新'
                              : '保存して学校へ提供する'}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span className="small muted">教材提供：{editor.companyName}</span>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={!!busy}
                    onClick={() => transition('adopt')}
                  >
                    {busy === 'adopt' ? '採用中…' : 'この教材を採用して編集 →'}
                  </button>
                </>
              )}
            </div>
            {editable && totalMinutes !== editor.duration && (
              <p className="lr-validation" role="status">
                各活動の合計を授業時間（{editor.duration}分）に合わせると、保存・承認できます。
              </p>
            )}
          </form>
          {teacher && editor.teacherId && editor.status === 'approved' && editor.alignment?.review?.status === 'confirmed' && !dirty && (
            <form className="lr-launch-panel stack" onSubmit={createLesson}>
              <div>
                <span className="lr-eyebrow">READY FOR CLASS</span>
                <h3>この教材で授業を準備する</h3>
                <p>授業を作成すると、選択したクラスの生徒に表示されます。</p>
              </div>
              <ErrorBox error={classes.error} onRetry={classes.reload} />
              <div className="lr-form-two">
                <Field label="授業を行うクラス">
                  <select
                    className="input"
                    required
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    <option value="">クラスを選択してください</option>
                    {(classes.data?.classes || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.grade}年{c.name}組（{c.students}名）
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="授業日時（任意）">
                  <input
                    className="input"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </Field>
              </div>
              <button className="btn primary" disabled={!!busy || !classId}>
                {busy === 'lesson' ? '授業を作成中…' : '選択したクラスに授業を作成'}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
