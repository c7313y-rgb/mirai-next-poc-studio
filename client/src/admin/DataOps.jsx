import { useState } from 'react';
import { api, dateTimeJa, todayJst } from '../api.js';
import { useApi, Loading, ErrorBox, Field, Empty, useToast } from '../ui.jsx';

export default function DataOps() {
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>データ出力・操作ログ</h1>
      <Exports />
      <Usage />
      <AuditLogs />
    </div>
  );
}

function Exports() {
  const { data, error, loading, reload } = useApi('/admin/exports');
  const [form, setForm] = useState({ from: '2026-12-01', to: todayJst(), format: 'csv' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const run = async () => {
    setBusy(true);
    try { await api.post('/admin/exports', form); toast('出力を開始しました。完了したら一覧からダウンロードできます'); setTimeout(reload, 1200); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>副担任mirAIへの連携データ出力（AD-06）</h2>
      <p className="muted small" style={{ margin: 0 }}>
        出力するのは要件定義書7.3の10項目（仮名ID・学校コード・学年・記録日・記録種別・テーマID・企業ID・関心タグ・要約・アンケート結果）です。
        <b>手帳画像・要確認フラグ・利用ログは含みません。</b>PoC中は月1回、この画面から手動でファイルを渡します。
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="対象期間（開始）"><input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
        <Field label="対象期間（終了）"><input className="input" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
        <Field label="形式">
          <select className="input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
            <option value="csv">CSV（BOM付きUTF-8）</option>
            <option value="json">JSON</option>
          </select>
        </Field>
        <button className="btn primary" disabled={busy} onClick={run}>{busy ? '実行中…' : '出力する'}</button>
        <button className="btn ghost" onClick={reload}>一覧を更新</button>
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.exports.length === 0 && <Empty>まだ出力履歴はありません。</Empty>}
      {data?.exports.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>日時</th><th>期間</th><th>形式</th><th className="num">件数</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {data.exports.map((e) => (
                <tr key={e.id}>
                  <td className="small">{dateTimeJa(e.created_at)}<div className="muted">{e.login_id}</div></td>
                  <td className="small">{e.period_from}〜{e.period_to}</td>
                  <td>{e.format.toUpperCase()}</td>
                  <td className="num">{e.row_count ?? '—'}</td>
                  <td>
                    {e.status === 'done' ? <span className="badge ok">完了</span> : e.status === 'failed' ? <span className="badge alert">失敗</span> : <span className="badge warn">処理中</span>}
                    {e.error && <div className="small" style={{ color: 'var(--alert)' }}>{e.error}</div>}
                  </td>
                  <td>{e.status === 'done' && <a className="btn small" href={`/api/admin/exports/${e.id}/download`}>ダウンロード</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        受け渡しは学校・NOLTY・Edutexで合意した安全な経路（暗号化した共有ストレージ等）で行い、ダウンロードしたファイルは端末に残さないでください。
      </p>
    </section>
  );
}

function Usage() {
  const { data, error, loading } = useApi('/admin/usage');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const byDay = {};
  for (const r of data.rows) (byDay[r.day] ||= {})[r.type] = r.n;
  const days = Object.keys(byDay).sort().slice(-14);
  const types = [...new Set(data.rows.map((r) => r.type))];
  const max = Math.max(1, ...data.rows.map((r) => r.n));

  return (
    <section className="panel">
      <h2>利用状況（直近14日・CM-03の利用ログ集計）</h2>
      {days.length === 0 && <Empty>ログがまだありません。</Empty>}
      {days.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>日付</th>{types.map((t) => <th key={t} className="num">{t}</th>)}</tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <td>{d}</td>
                  {types.map((t) => (
                    <td key={t} className="num">
                      {byDay[d][t] ? <span className="marker">{byDay[d][t]}</span> : <span className="muted">0</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">最大値 {max}／件数は操作の種類ごとの回数です。個人の行動追跡を目的とした利用はしません。</p>
    </section>
  );
}

function AuditLogs() {
  const [f, setF] = useState({ action: '', from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, loading, reload } = useApi(`/admin/audit-logs${qs ? '?' + qs : ''}`, [qs]);

  return (
    <section className="panel stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>操作ログ（AD-08）</h2>
        <a className="btn small ghost" href={`/api/admin/audit-logs?format=csv${qs ? '&' + qs : ''}`}>CSVで出力</a>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="操作名で絞り込み"><input className="input" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="例：image_view" /></Field>
        <Field label="開始日"><input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="終了日"><input className="input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <button className="btn ghost" onClick={reload}>更新</button>
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>日時</th><th>利用者</th><th>権限</th><th>操作</th><th>詳細</th><th>IP</th></tr></thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l.id}>
                  <td className="small">{dateTimeJa(l.created_at)}</td>
                  <td className="small"><code>{l.login_id || '—'}</code></td>
                  <td className="small">{l.role}</td>
                  <td className="small">{l.action}</td>
                  <td className="small muted" style={{ maxWidth: 380, overflowWrap: 'anywhere' }}>{l.detail}</td>
                  <td className="small muted">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>直近500件を表示します。手帳画像の閲覧（image_view）、連携データの出力・ダウンロード、アラート対応はすべて記録されます。</p>
    </section>
  );
}
