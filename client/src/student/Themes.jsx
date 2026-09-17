import { useState } from 'react';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { useApi, Loading, ErrorBox, useToast } from '../ui.jsx';
import { StudentHead } from './StudentApp.jsx';

export function ThemeList() {
  const { data, error, loading, reload } = useApi('/student/home');
  return (
    <>
      <StudentHead title="探究テーマ"><p className="muted small" style={{ margin: 0 }}>企業から届いた、社会のリアルな問いです。</p></StudentHead>
      <main className="student-main">
        {loading && <Loading />}
        <ErrorBox error={error} onRetry={reload} />
        {data?.themes.length === 0 && <p className="muted">いま配信中のテーマはありません。</p>}
        {data?.themes.map((t) => (
          <Link key={t.id} to={`/themes/${t.id}`} className="theme-card">
            <div className="spread"><span className="co">{t.companyName}</span>{t.interested && <span className="badge" style={{ background: 'var(--marker)', borderColor: 'var(--ink)' }}>関心あり</span>}</div>
            <div className="ttl">{t.title}</div>
            <p className="muted small" style={{ margin: 0 }}>{t.summary}</p>
          </Link>
        ))}
      </main>
    </>
  );
}

export function ThemeDetail({ id }) {
  const { data, error, loading } = useApi(`/student/themes/${id}`);
  const [interested, setInterested] = useState(null);
  const toast = useToast();
  if (loading) return <Loading />;
  if (error) return <main className="student-main"><ErrorBox error={error} /></main>;
  const t = data.theme;
  const on = interested ?? t.interested;
  const toggle = async () => {
    try { const r = await api.post(`/student/themes/${t.id}/interest`, { on: !on }); setInterested(r.interested); if (r.interested) toast('「関心あり」にしました'); }
    catch (x) { toast(x.message, 'error'); }
  };
  return (
    <>
      <StudentHead title={t.title} back="/themes"><p className="muted" style={{ margin: 0 }}>{t.companyName}{t.field ? `｜${t.field}` : ''}</p></StudentHead>
      <main className="student-main">
        <section className="panel"><h2>テーマの概要</h2><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.summary}</p></section>
        <section className="panel">
          <h2>考えてみよう</h2>
          <ol style={{ paddingLeft: 22, margin: 0 }}>{t.questions.map((qn, i) => <li key={i} style={{ marginBottom: 6 }}>{qn}</li>)}</ol>
          <p className="muted small" style={{ margin: '10px 0 0' }}>手帳に自分の考えを書いて、「テーマ記録」として提出しよう。</p>
        </section>
        {t.materials.length > 0 && (
          <section className="panel">
            <h2>資料</h2>
            {t.materials.map((m, i) => <p key={i} style={{ margin: '4px 0' }}>{m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.label}</a> : m.label}</p>)}
          </section>
        )}
        <button className={`interest-btn ${on ? 'on' : ''}`} aria-pressed={on} onClick={toggle}>{on ? '関心あり（タップで取り消し）' : 'このテーマに関心あり'}</button>
        <Link to="/capture" className="btn primary big block">手帳を撮ってテーマ記録を提出</Link>
      </main>
    </>
  );
}
