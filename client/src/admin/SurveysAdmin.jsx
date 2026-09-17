import { useState } from 'react';
import { api, num } from '../api.js';
import { useApi, Loading, ErrorBox, Field, Empty, useToast } from '../ui.jsx';

const KIND = { student: '生徒', lesson: '教員（授業後）', continuation: '企業（継続参加）' };

export default function SurveysAdmin() {
  const { data, error, loading, reload } = useApi('/admin/surveys');
  const [openId, setOpenId] = useState(null);
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const patch = async (s, body) => {
    try { await api.put(`/admin/surveys/${s.id}`, body); reload(); toast('保存しました'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const createFromTemplate = async (t) => {
    try { await api.post('/admin/surveys', t); reload(); toast('作成しました'); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>アンケート管理</h1>
      <p className="muted small" style={{ margin: 0 }}>
        KPIに使う設問（生徒:overall／教員:ease／企業:continue）は削除・変更できません。回答が入ったあとの設問の追加・削除もできません（集計が崩れるため）。
      </p>

      <section className="panel">
        <h2>アンケート一覧</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>タイトル</th><th>対象</th><th>公開期間</th><th className="num">回答</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {data.surveys.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.title}</b><div className="small muted">設問 {s.questions.length}問</div></td>
                  <td className="small">{KIND[s.kind]}</td>
                  <td className="small"><Period survey={s} onSave={(b) => patch(s, b)} /></td>
                  <td className="num">{s.responses}{s.expected ? <span className="muted small"> / {s.expected}</span> : ''}</td>
                  <td>{s.active ? <span className="badge ok">公開</span> : <span className="badge">停止</span>}</td>
                  <td className="row" style={{ gap: 6 }}>
                    <button className="btn small" onClick={() => setOpenId(openId === s.id ? null : s.id)}>{openId === s.id ? '閉じる' : '結果を見る'}</button>
                    <button className="btn small ghost" onClick={() => patch(s, { active: !s.active })}>{s.active ? '停止' : '公開'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.surveys.length < data.templates.length && (
          <div className="row" style={{ marginTop: 12 }}>
            {data.templates.filter((t) => !data.surveys.some((s) => s.kind === t.kind)).map((t) => (
              <button className="btn small" key={t.kind} onClick={() => createFromTemplate(t)}>「{KIND[t.kind]}」の既定アンケートを作成</button>
            ))}
          </div>
        )}
      </section>

      {openId && <Results surveyId={openId} />}
    </div>
  );
}

function Period({ survey, onSave }) {
  const [from, setFrom] = useState(survey.openFrom || '');
  const [to, setTo] = useState(survey.openTo || '');
  const dirty = from !== (survey.openFrom || '') || to !== (survey.openTo || '');
  return (
    <div className="row" style={{ gap: 4 }}>
      <input className="input" style={{ minHeight: 32, width: 140 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <span>〜</span>
      <input className="input" style={{ minHeight: 32, width: 140 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      {dirty && <button className="btn small primary" onClick={() => onSave({ openFrom: from, openTo: to, active: survey.active })}>保存</button>}
    </div>
  );
}

function Results({ surveyId }) {
  const { data, error, loading, reload } = useApi(`/admin/surveys/${surveyId}/results`, [surveyId]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const analyze = async () => {
    setBusy(true);
    try { await api.post(`/admin/surveys/${surveyId}/analyze`); reload(); toast('分類・要約しました'); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <section className="panel stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{data.survey.title}の結果（回答 {data.responses}件）</h2>
        <a className="btn small ghost" href={`/api/admin/surveys/${surveyId}/results`} target="_blank" rel="noreferrer">JSONを見る</a>
      </div>

      {data.results.map((r) => (
        <div className="panel tight" key={r.key}>
          <div className="spread"><b>{r.label}</b><span className="small muted">n={r.n}</span></div>
          {r.type === 'rating' && (
            <div>
              <div className="row"><span className="value" style={{ fontSize: '1.6rem', fontWeight: 700 }}>{num(r.avg, 2)}</span><span className="muted small">平均（5点満点）</span></div>
              {r.dist.map((c, i) => (
                <div className="hbar" key={i}>
                  <span>{i + 1}点</span>
                  <div><i style={{ width: `${r.n ? (c / r.n) * 100 : 0}%` }} /></div>
                  <span className="num">{c}</span>
                </div>
              ))}
            </div>
          )}
          {r.type === 'choice' && r.counts.map((o) => (
            <div className="hbar" key={o.value}>
              <span>{o.label}</span>
              <div><i style={{ width: `${r.n ? (o.count / r.n) * 100 : 0}%` }} /></div>
              <span className="num">{o.count}</span>
            </div>
          ))}
          {r.type === 'text' && (
            <div>
              {r.texts.length === 0 && <span className="muted small">自由記述はまだありません。</span>}
              <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{r.texts.slice(0, 20).map((t, i) => <li key={i}>{t}</li>)}</ul>
              {r.texts.length > 20 && <p className="muted small">ほか {r.texts.length - 20}件</p>}
            </div>
          )}
        </div>
      ))}

      <div className="panel tight stack">
        <div className="spread">
          <b>AD-07 自由記述の分類・要約</b>
          <button className="btn small" disabled={busy} onClick={analyze}>{busy ? '処理中…' : 'AIで分類・要約する'}</button>
        </div>
        {!data.analysis && <span className="muted small">自由記述が3件以上たまってから実行できます。</span>}
        {data.analysis && (
          <div className="stack">
            <p style={{ margin: 0 }}>{data.analysis.summary}</p>
            {(data.analysis.categories || []).map((c) => (
              <div className="hbar" key={c.name}>
                <span>{c.name}</span>
                <div><i style={{ width: `${Math.min(100, (c.count / Math.max(1, ...(data.analysis.categories || []).map((x) => x.count))) * 100)}%` }} /></div>
                <span className="num">{c.count}</span>
              </div>
            ))}
            {(data.analysis.categories || []).map((c) => <div className="small muted" key={'g' + c.name}>{c.name}：{c.gist}</div>)}
            {(data.analysis.actions || []).length > 0 && <div><b className="small">改善アクション案：</b><ul className="small" style={{ margin: 0 }}>{data.analysis.actions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
          </div>
        )}
      </div>

      {data.responses === 0 && <Empty>まだ回答がありません。</Empty>}
      <p className="muted small" style={{ margin: 0 }}>回答率の分母：生徒＝有効な生徒数、教員＝開始済みのテーマ配信数、企業＝公開テーマのある企業数（一覧の「回答 / 分母」欄）。</p>
    </section>
  );
}
