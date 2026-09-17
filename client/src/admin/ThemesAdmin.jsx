import { useState } from 'react';
import { api, dateJa } from '../api.js';
import { useApi, Loading, ErrorBox, Field, Empty, useToast } from '../ui.jsx';

const EMPTY = { companyId: '', title: '', summary: '', questions: ['', '', ''], worksheet: '', field: '', materials: [] };

export default function ThemesAdmin() {
  const themes = useApi('/admin/themes');
  const orgs = useApi('/admin/schools');
  const [form, setForm] = useState(null);
  const [voiceOf, setVoiceOf] = useState(null);
  const toast = useToast();

  if (themes.loading && !themes.data) return <Loading />;
  if (themes.error) return <ErrorBox error={themes.error} onRetry={themes.reload} />;

  const setStatus = async (t, status) => {
    try { await api.post(`/admin/themes/${t.id}/status`, { status }); themes.reload(); toast(status === 'published' ? '公開しました' : status === 'archived' ? '終了にしました' : '下書きに戻しました'); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>探究テーマ・企業素材の管理</h1>
        <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>テーマを新規作成</button>
      </div>

      {form && <ThemeForm form={form} setForm={setForm} companies={orgs.data?.companies || []} onSaved={() => { setForm(null); themes.reload(); }} />}
      {voiceOf && <VoicePanel theme={voiceOf} onClose={() => { setVoiceOf(null); themes.reload(); }} />}

      <section className="panel">
        <h2>テーマ一覧（{themes.data.themes.length}件）</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>テーマ</th><th>企業</th><th>状態</th><th className="num">配信</th><th className="num">記録</th><th>生徒の声</th><th></th></tr></thead>
            <tbody>
              {themes.data.themes.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.title}</b><div className="small muted">{t.summary?.slice(0, 60)}</div></td>
                  <td className="small">{t.companyName}</td>
                  <td><span className={`badge ${t.status === 'published' ? 'ok' : t.status === 'archived' ? '' : 'warn'}`}>{t.status === 'published' ? '公開中' : t.status === 'archived' ? '終了' : '下書き'}</span></td>
                  <td className="num">{t.distributions}</td>
                  <td className="num">{t.records}</td>
                  <td className="small">{t.voiceStatus === 'approved' ? <span className="badge ok">承認済み</span> : t.voiceStatus === 'pending_review' ? <span className="badge warn">要確認</span> : <span className="muted">—</span>}</td>
                  <td className="row" style={{ gap: 6 }}>
                    <button className="btn small ghost" onClick={() => setForm({ id: t.id, companyId: t.companyId, title: t.title, summary: t.summary || '', questions: t.questions.length ? t.questions : [''], worksheet: t.worksheet || '', field: t.field || '', materials: t.materials || [] })}>編集</button>
                    {t.status !== 'published' && <button className="btn small" onClick={() => setStatus(t, 'published')}>公開</button>}
                    {t.status === 'published' && <button className="btn small ghost" onClick={() => setStatus(t, 'archived')}>終了</button>}
                    <button className="btn small ghost" onClick={() => setVoiceOf(t)}>生徒の声</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>公開には概要と問い（1つ以上）が必要です。公開後に教員が配信すると生徒に表示されます。</p>
      </section>

      <Draft companies={orgs.data?.companies || []} onUse={(d, companyId) => setForm({ ...EMPTY, ...d, companyId, questions: d.questions.length ? d.questions : [''] })} />

      <section className="panel">
        <h2>企業から提出された素材（CO-03）</h2>
        {themes.data.materials.length === 0 && <Empty>提出はまだありません。</Empty>}
        {themes.data.materials.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>企業</th><th>資料名</th><th>補足</th><th>URL</th><th>提出日</th></tr></thead>
              <tbody>
                {themes.data.materials.map((m) => (
                  <tr key={m.id}>
                    <td className="small">{m.company_name}</td>
                    <td>{m.title}</td>
                    <td className="small">{m.note || '—'}</td>
                    <td className="small">{m.url ? <a href={m.url} target="_blank" rel="noreferrer">リンク</a> : '—'}</td>
                    <td className="small muted">{dateJa(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ThemeForm({ form, setForm, companies, onSaved }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    setBusy(true);
    const body = { ...form, questions: form.questions.filter((x) => x.trim()) };
    try {
      if (form.id) await api.put(`/admin/themes/${form.id}`, body);
      else await api.post('/admin/themes', body);
      toast('保存しました');
      onSaved();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const setQ = (i, v) => setForm({ ...form, questions: form.questions.map((x, j) => (j === i ? v : x)) });

  return (
    <section className="panel stack" style={{ borderColor: 'var(--pen)' }}>
      <div className="spread"><h2 style={{ margin: 0 }}>{form.id ? 'テーマを編集' : 'テーマを新規作成'}</h2><button className="btn small ghost" onClick={() => setForm(null)}>閉じる</button></div>
      <Field label="企業">
        <select className="input" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: Number(e.target.value) })}>
          <option value="">選択してください</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="テーマ名" hint="100文字以内。生徒が見て内容がわかる言葉にしてください。">
        <input className="input" value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>
      <Field label="概要"><textarea className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
      <Field label="生徒に考えてほしい問い" hint="公開には1つ以上必要です。">
        <div className="stack" style={{ marginTop: 4 }}>
          {form.questions.map((qn, i) => <input key={i} className="input" value={qn} onChange={(e) => setQ(i, e.target.value)} placeholder={`問い ${i + 1}`} />)}
          <button className="btn small ghost" onClick={() => setForm({ ...form, questions: [...form.questions, ''] })}>問いを追加</button>
        </div>
      </Field>
      <Field label="授業の進め方（教員向け）"><textarea className="input" value={form.worksheet} onChange={(e) => setForm({ ...form, worksheet: e.target.value })} /></Field>
      <Field label="分野（任意）"><input className="input" value={form.field || ''} onChange={(e) => setForm({ ...form, field: e.target.value })} placeholder="例：環境・エネルギー" /></Field>
      <button className="btn primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存する'}</button>
    </section>
  );
}

function Draft({ companies, onUse }) {
  const [companyId, setCompanyId] = useState('');
  const [material, setMaterial] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const run = async () => {
    setBusy(true);
    try { setDraft((await api.post('/admin/themes/draft', { companyId: Number(companyId), material })).draft); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>AD-03 教材化支援（AIによるテーマ案の作成）</h2>
      <p className="muted small" style={{ margin: 0 }}>企業の資料テキストを貼り付けると、AIがテーマ名・概要・問い・授業の流れの案を作ります。<b>必ず人が確認・修正してから公開してください。</b></p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="企業">
          <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">選択</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="資料テキスト" hint="20,000文字まで。機密情報は入力しないでください。">
        <textarea className="input" value={material} onChange={(e) => setMaterial(e.target.value)} />
      </Field>
      <button className="btn" disabled={busy || !companyId || !material.trim()} onClick={run}>{busy ? '作成中…' : 'AIで案を作る'}</button>
      {draft && (
        <div className="notice stack">
          <div><b>テーマ名：</b>{draft.title}</div>
          <div><b>概要：</b>{draft.summary}</div>
          <div><b>問い：</b><ul style={{ margin: 0 }}>{draft.questions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          <div><b>授業の流れ：</b><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{draft.worksheet}</p></div>
          <button className="btn primary" onClick={() => onUse(draft, Number(companyId))}>この案でテーマを作成する</button>
        </div>
      )}
    </section>
  );
}

function VoicePanel({ theme, onClose }) {
  const { data, error, loading, reload } = useApi(`/admin/themes/${theme.id}/voice-summary`, [theme.id]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const generate = async () => {
    setBusy(true);
    try { const r = await api.post(`/admin/themes/${theme.id}/voice-summary`); setEdit({ ...r.summary }); toast('要約を作成しました。内容を確認してください'); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const save = async (approve) => {
    setBusy(true);
    try { await api.put(`/admin/themes/${theme.id}/voice-summary`, { ...edit, approve }); toast(approve ? '承認しました。企業画面に表示されます' : '下書きとして保存しました'); setEdit(null); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const v = edit || data?.voice;
  return (
    <section className="panel stack" style={{ borderColor: 'var(--pen)' }}>
      <div className="spread">
        <div>
          <h2 style={{ margin: 0 }}>生徒の声（匿名要約）：{theme.title}</h2>
          <p className="small muted" style={{ margin: 0 }}>企業に見せる前に、運営が個人が特定されないか必ず確認・承認します。</p>
        </div>
        <button className="btn small ghost" onClick={onClose}>閉じる</button>
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {!v && <Empty>まだ作成されていません。</Empty>}
      {v && (
        <div className="stack">
          <div className="row small">
            <span className={`badge ${data?.voice?.status === 'approved' ? 'ok' : 'warn'}`}>{data?.voice?.status === 'approved' ? '承認済み（企業に表示中）' : '未承認（企業には非表示）'}</span>
            {data?.voice?.sourceCount != null && <span className="muted">元記録 {data.voice.sourceCount}件</span>}
          </div>
          <Field label="要約"><textarea className="input" value={v.summary || ''} onChange={(e) => setEdit({ ...v, summary: e.target.value })} /></Field>
          <Field label="ポイント（1行に1つ）">
            <textarea className="input" value={(v.points || []).join('\n')} onChange={(e) => setEdit({ ...v, points: e.target.value.split('\n') })} />
          </Field>
          <Field label="企業への提案"><input className="input" value={v.suggestion || ''} onChange={(e) => setEdit({ ...v, suggestion: e.target.value })} /></Field>
          <div className="row">
            <button className="btn primary" disabled={busy || !edit} onClick={() => save(true)}>確認済みとして承認する</button>
            <button className="btn" disabled={busy || !edit} onClick={() => save(false)}>下書き保存</button>
          </div>
        </div>
      )}
      <button className="btn ghost" disabled={busy} onClick={generate}>{busy ? '作成中…' : v ? 'AIで作り直す' : 'AIで作成する'}</button>
    </section>
  );
}
