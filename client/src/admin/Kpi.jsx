import { useState } from 'react';
import { pct, num } from '../api.js';
import { useApi, Loading, ErrorBox, Meter, WeekBars, Field } from '../ui.jsx';

const fmt = (k, v) => {
  if (v === null || v === undefined) return '—';
  if (k.format === 'pct') return pct(v, 1);
  if (k.format === 'count') return String(v);
  return num(v, k.format === 'score' ? 2 : 1);
};

export default function Kpi() {
  const [f, setF] = useState({ from: '', to: '', schoolId: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, loading, reload } = useApi(`/admin/kpi${qs ? '?' + qs : ''}`, [qs]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const groups = ['学校側', '企業側', '共通'];
  const achieved = data.kpis.filter((k) => k.achieved).length;
  const measurable = data.kpis.filter((k) => k.achieved !== null).length;
  const themeKpi = data.kpis.find((k) => k.id === 'K-X1');

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1 style={{ margin: 0 }}>KPIダッシュボード</h1>
          <p className="muted small" style={{ margin: 0 }}>
            集計期間 {data.period.from} 〜 {data.period.to}（本日 {data.period.today}）／対象生徒 {data.students}名／AI {data.aiProvider}
          </p>
        </div>
        <div className="row">
          <a className="btn small" href={`/api/admin/kpi.csv${qs ? '?' + qs : ''}`}>CSVで出力</a>
          <button className="btn small ghost" onClick={reload}>更新</button>
        </div>
      </div>

      {data.aiProvider === 'mock' && (
        <div className="notice warn">
          AIはデモ用のダミー応答（mock）で動作しています。実証で使う前に <code>AI_PROVIDER=bedrock</code> に切り替え、国内リージョン処理の設定を行ってください。
        </div>
      )}
      {(data.jobs?.failed > 0) && <div className="notice alert">AI処理の失敗が {data.jobs.failed} 件あります（読み取り・フィードバックの再実行が必要）。</div>}

      <section className="panel">
        <div className="row">
          <Field label="開始日"><input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="終了日"><input className="input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="学校">
            <select className="input" value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })}>
              <option value="">すべての協力校</option>
              {(data.schools || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div style={{ alignSelf: 'flex-end' }}><button className="btn small ghost" onClick={() => setF({ from: '', to: '', schoolId: '' })}>条件をクリア</button></div>
        </div>
      </section>

      <div className="notice">
        達成 <b className="marker">{achieved}</b> / 計測可能 {measurable} 項目（全12項目）。目標値は要件定義書v0.1の「案」です。設定画面から変更できます。各指標の集計範囲・分母はカード下部に表示しています。
      </div>

      {groups.map((g) => (
        <section className="panel" key={g}>
          <h2>{g}のKPI</h2>
          <div className="cards">
            {data.kpis.filter((k) => k.group === g).map((k) => (
              <div className={`card ${k.achieved === false ? 'alert' : ''}`} key={k.id}>
                <div className="label">{k.id}　{k.name}</div>
                <div className="value">{fmt(k, k.value)}<small>目標 {fmt(k, k.target)}</small></div>
                {k.format === 'pct' && <Meter value={k.value} target={k.target} />}
                <div className="sub">
                  {k.achieved === null ? '計測不可（データ不足）' : k.achieved ? '達成' : '未達'}
                  {k.note && <div>{k.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="panel">
        <h2>週ごとの生徒アクティブ率（K-S2）</h2>
        <WeekBars weeks={data.weeks} />
        <p className="muted small">灰色は週開始日（月曜）が除外期間内の週、または期間の端で一部の日だけを集計した週です。完全な週があれば途中週を平均から除外し、完全な週がないときは途中週を暫定集計します。除外期間の週は常に除きます。</p>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>テーマ別の記録件数（K-X1）</h2>
          <p className="muted small">すべての対象テーマが {themeKpi?.target ?? '—'} 件以上で達成します。平均件数での判定は行いません。</p>
          {(themeKpi?.detail || []).map((t) => (
            <div className="hbar" key={t.theme_id}>
              <span>{t.title}</span>
              <div><i style={{ width: `${Math.min(100, (t.count / Math.max(1, themeKpi?.target || 1)) * 100)}%` }} /></div>
              <span className="num">{t.count}</span>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>連携データの充足（K-X2）</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>必須項目</th><th className="num">出力済み／対象</th><th>判定</th></tr></thead>
              <tbody>
                {(data.kpis.find((k) => k.id === 'K-X2')?.detail || []).map((d) => (
                  <tr key={d.key}>
                    <td className="small">{d.label}<div className="muted"><code>{d.key}</code></div></td>
                    <td className="num">{d.filled} / {d.applicable}</td>
                    <td>{d.ok ? <span className="badge ok">出力あり</span> : <span className="badge alert">出力なし</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">選択した期間・学校の記録を使い、連携仕様の必須項目に出力実績があるかを確認します。副担任mirAI側への実接続・取込は未検証です。取込仕様確定後、項目名の対応と取込結果を別途確認してください。</p>
        </section>
      </div>

      <section className="panel">
        <h2>要確認アラートの未対応状況（学校別）</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>学校</th><th className="num">未対応</th></tr></thead>
            <tbody>{(data.openConcernAlertsBySchool || []).map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{r.open}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="muted small">未対応が続く場合は、学校の担当教員に連絡してください（対応の主体は学校です）。</p>
      </section>
    </div>
  );
}
