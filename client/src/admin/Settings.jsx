import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useApi, Loading, ErrorBox, Field, useToast } from '../ui.jsx';

const TARGET_LABEL = {
  'K-S1': '協力校数（校）', 'K-S2': '生徒アクティブ率（0〜1）', 'K-S3': '継続利用率（0〜1）',
  'K-S4': '授業後アンケート回収率（0〜1）', 'K-S5': '授業のしやすさ（5点満点）',
  'K-S6_rate': '生徒アンケート回答率（0〜1）', 'K-S6_avg': '生徒アンケート平均評価（5点満点）',
  'K-C1': '賛同企業数（社）', 'K-C2': '提供テーマ数（本）', 'K-C3': '生徒の関心反応率（0〜1）',
  'K-C4': '継続参加意向（0〜1）', 'K-X1': 'テーマ記録件数（件/テーマ）', 'K-X2': 'データ連携充足率（0〜1）',
};

export default function Settings() {
  const { data, error, loading, reload } = useApi('/admin/settings');
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (data) setS(structuredClone(data.settings)); }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!s) return <Loading />;

  const save = async () => {
    setBusy(true);
    try { await api.put('/admin/settings', s); toast('保存しました'); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>設定</h1>
      <div className="notice warn small">
        KPI目標値は要件定義書v0.1の「案」です。10/31の甲乙合意後に、ここで確定値に更新してください。変更は集計に即反映されます（過去の記録は変わりません）。
      </div>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>実証期間</h2>
        <div className="row">
          <Field label="開始日"><input className="input" type="date" value={s.poc_start} onChange={(e) => setS({ ...s, poc_start: e.target.value })} /></Field>
          <Field label="終了日"><input className="input" type="date" value={s.poc_end} onChange={(e) => setS({ ...s, poc_end: e.target.value })} /></Field>
        </div>
        <Field label="アクティブ率の集計から除外する期間（長期休業等）" hint="1行に「開始日,終了日,名称」（例：2026-12-26,2027-01-07,冬休み）">
          <textarea className="input" style={{ minHeight: 80 }}
            value={(s.excluded_periods || []).map((p) => `${p.from},${p.to},${p.label || ''}`).join('\n')}
            onChange={(e) => setS({
              ...s,
              excluded_periods: e.target.value.split('\n').map((l) => l.split(',')).filter((a) => a.length >= 2 && a[0].trim())
                .map(([from, to, label]) => ({ from: from.trim(), to: (to || '').trim(), label: (label || '').trim() })),
            })} />
        </Field>
      </section>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>個人情報・公開範囲</h2>
        <Field label="未提出アラートの日数" hint="この日数、提出がない生徒を教員画面でお知らせします。">
          <input className="input" type="number" min="3" max="60" value={s.inactive_days} onChange={(e) => setS({ ...s, inactive_days: Number(e.target.value) })} />
        </Field>
        <Field label="企業向け匿名要約に必要な最小記録数" hint="これ未満では要約を作成できません（個人が推測されるのを防ぐため）。">
          <input className="input" type="number" min="3" max="50" value={s.voice_min_records} onChange={(e) => setS({ ...s, voice_min_records: Number(e.target.value) })} />
        </Field>
        <Field label="企業レポートで学校別数値を表示する最小閲覧者数" hint="これ未満のセルは「—」で非表示になります。">
          <input className="input" type="number" min="3" max="50" value={s.school_min_cell} onChange={(e) => setS({ ...s, school_min_cell: Number(e.target.value) })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={!!s.company_show_school_names} onChange={(e) => setS({ ...s, company_show_school_names: e.target.checked })} />
          企業に学校名を表示する（<b>各校の同意を得たあとにのみ有効化</b>。既定は「協力校A/B/C」の匿名ラベル）
        </label>
      </section>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>KPI目標値</h2>
        <div className="two-col">
          {Object.entries(TARGET_LABEL).map(([k, label]) => (
            <Field key={k} label={`${k}　${label}`}>
              <input className="input" type="number" step="0.01" value={s.kpi_targets[k] ?? ''} onChange={(e) => setS({ ...s, kpi_targets: { ...s.kpi_targets, [k]: Number(e.target.value) } })} />
            </Field>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>関心タグの統制語彙（{data.tags.length}種）</h2>
        <div>{data.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
        <p className="muted small">
          AIはこの語彙の中からのみタグを付けます。副担任mirAI側の分類と一致させる必要があるため、変更はコード（server/lib/taxonomy.js）で行い、10/31までに両者で確定してください。
        </p>
      </section>

      <div className="row">
        <button className="btn primary big" disabled={busy} onClick={save}>{busy ? '保存中…' : '設定を保存する'}</button>
        <button className="btn ghost" onClick={() => setS(structuredClone(data.settings))}>変更を取り消す</button>
      </div>
    </div>
  );
}
