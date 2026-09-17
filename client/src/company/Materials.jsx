import { useState } from 'react';
import { api, dateJa } from '../api.js';
import { useApi, Loading, ErrorBox, Field, Empty, useToast } from '../ui.jsx';

export default function Materials() {
  const { data, error, loading, reload } = useApi('/company/materials');
  const [form, setForm] = useState({ themeId: '', title: '', url: '', note: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/company/materials', { ...form, themeId: form.themeId ? Number(form.themeId) : null });
      toast('提出しました。運営が教材化を検討します');
      setForm({ themeId: '', title: '', url: '', note: '' });
      reload();
    } catch (x) { toast(x.message, 'error'); } finally { setBusy(false); }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>資料・素材の提出</h1>
      <p className="muted">事業紹介資料や動画のURLをお送りください。運営（Edutex）がAIを使って授業用の問い・ワークシート案に整え、学校に配信します。<b>提出した素材がそのまま生徒に届くわけではありません。</b></p>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>新しく提出する</h2>
        <form onSubmit={submit} className="stack">
          <Field label="関連するテーマ（任意）">
            <select className="input" value={form.themeId} onChange={(e) => setForm({ ...form, themeId: e.target.value })}>
              <option value="">指定しない（新しいテーマの相談）</option>
              {data.themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
          <Field label="資料名" hint="例：会社紹介スライド（2026年版）">
            <input className="input" value={form.title} maxLength={200} required onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="URL（任意）" hint="社外共有可能な https:// のリンクをご記入ください。機密資料は送らないでください。">
            <input className="input" type="url" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </Field>
          <Field label="補足（任意）" hint="生徒に考えてほしいこと、触れてほしくない内容などがあればご記入ください。">
            <textarea className="input" maxLength={2000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <button className="btn primary" disabled={busy || !form.title.trim()}>{busy ? '送信中…' : '提出する'}</button>
        </form>
      </section>

      <section className="panel">
        <h2>提出済み（{data.items.length}件）</h2>
        {data.items.length === 0 && <Empty>まだ提出はありません。</Empty>}
        {data.items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>資料名</th><th>テーマ</th><th>URL</th><th>提出日</th></tr></thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.id}>
                    <td>{m.title}{m.note && <div className="small muted">{m.note}</div>}</td>
                    <td className="small">{data.themes.find((t) => t.id === m.theme_id)?.title || <span className="muted">—</span>}</td>
                    <td className="small">{m.url ? <a href={m.url} target="_blank" rel="noreferrer">リンク</a> : <span className="muted">—</span>}</td>
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
