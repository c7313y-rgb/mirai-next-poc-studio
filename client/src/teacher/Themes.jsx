import { useState } from 'react';
import { api, todayJst, addDays } from '../api.js';
import { useApi, Loading, ErrorBox, Field, Empty, useToast } from '../ui.jsx';

export default function Themes() {
  const themes = useApi('/teacher/themes');
  const classes = useApi('/teacher/classes');
  const [sel, setSel] = useState(null);
  const [classIds, setClassIds] = useState([]);
  const [startDate, setStart] = useState(todayJst());
  const [endDate, setEnd] = useState(addDays(todayJst(), 27));
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (themes.loading && !themes.data) return <Loading />;
  if (themes.error) return <ErrorBox error={themes.error} onRetry={themes.reload} />;

  const distribute = async () => {
    setBusy(true);
    try {
      await api.post('/teacher/distributions', { themeId: sel.id, classIds, startDate, endDate });
      toast('配信しました。生徒のアプリに表示されます');
      setSel(null); setClassIds([]);
      themes.reload();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const stop = async (d) => {
    if (!window.confirm(`「${d.title}」の${d.className}への配信を停止します。よろしいですか？`)) return;
    try { await api.del(`/teacher/distributions/${d.id}`); toast('配信を停止しました'); themes.reload(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const today = todayJst();
  const active = themes.data.distributions.filter((d) => d.endDate >= today);
  const past = themes.data.distributions.filter((d) => d.endDate < today);

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>探究テーマの配信</h1>
      <p className="muted">企業から提供されたテーマを、担当クラスに期間を決めて配信します。配信すると生徒のアプリに表示され、「関心あり」と記録が集計されます。</p>

      <section className="panel">
        <h2>配信中・予定（{active.length}件）</h2>
        {active.length === 0 && <Empty>配信中のテーマはありません。</Empty>}
        {active.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>テーマ</th><th>クラス</th><th>期間</th><th></th></tr></thead>
              <tbody>
                {active.map((d) => (
                  <tr key={d.id}>
                    <td>{d.title}</td>
                    <td>{d.className}</td>
                    <td className="small">{d.startDate} 〜 {d.endDate}{d.startDate > today && <span className="badge warn" style={{ marginLeft: 6 }}>予定</span>}</td>
                    <td>{d.mine ? <button className="btn small danger" onClick={() => stop(d)}>配信停止</button> : <span className="muted small">他の先生が配信</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack">
        <h2 style={{ margin: 0 }}>配信できるテーマ（{themes.data.themes.length}件）</h2>
        <div className="three-col">
          {themes.data.themes.map((t) => (
            <article key={t.id} className="panel stack">
              <div>
                <div className="small muted">{t.companyName}{t.companyIndustry ? `・${t.companyIndustry}` : ''}</div>
                <h3 style={{ margin: '2px 0' }}>{t.title}</h3>
              </div>
              <p className="small" style={{ margin: 0 }}>{t.summary}</p>
              {t.questions.length > 0 && (
                <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
                  {t.questions.map((qn, i) => <li key={i}>{qn}</li>)}
                </ul>
              )}
              {t.worksheet && <details className="small"><summary style={{ cursor: 'pointer' }}>授業の進め方（AI作成案）</summary><p style={{ whiteSpace: 'pre-wrap' }}>{t.worksheet}</p></details>}
              {t.materials.length > 0 && (
                <div className="small">素材：{t.materials.map((m, i) => m.url ? <a key={i} href={m.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{m.label}</a> : <span key={i} style={{ marginRight: 8 }}>{m.label}</span>)}</div>
              )}
              <button className="btn primary" onClick={() => { setSel(t); setClassIds([]); }}>このテーマを配信する</button>
            </article>
          ))}
        </div>
      </section>

      {sel && (
        <section className="panel stack" style={{ borderColor: 'var(--pen)' }}>
          <div className="spread"><h2 style={{ margin: 0 }}>「{sel.title}」を配信</h2><button className="btn small ghost" onClick={() => setSel(null)}>閉じる</button></div>
          <Field label="配信するクラス（複数選択できます）">
            <div className="stack" style={{ marginTop: 4 }}>
              {(classes.data?.classes || []).map((c) => (
                <label className="check" key={c.id}>
                  <input type="checkbox" checked={classIds.includes(c.id)} onChange={(e) => setClassIds((x) => e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id))} />
                  {c.grade}年{c.name}組（{c.students}名）
                </label>
              ))}
            </div>
          </Field>
          <div className="row">
            <Field label="公開開始日"><input className="input" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="公開終了日"><input className="input" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <button className="btn primary big" disabled={busy || !classIds.length} onClick={distribute}>{busy ? '配信中…' : `${classIds.length}クラスに配信する`}</button>
        </section>
      )}

      {past.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer' }}>終了した配信（{past.length}件）</summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>テーマ</th><th>クラス</th><th>期間</th></tr></thead>
              <tbody>{past.map((d) => <tr key={d.id}><td>{d.title}</td><td>{d.className}</td><td className="small">{d.startDate} 〜 {d.endDate}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
