import { useState } from 'react';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { useApi, Loading, ErrorBox, useToast } from '../ui.jsx';
import { StudentHead } from './StudentApp.jsx';
import { LearningHeader } from '../learning/LearningUI.jsx';
import { sceneForTheme } from '../learning/scenes.js';
import '../learning/discovery.css';

export function ThemeList() {
  const { data, error, loading, reload } = useApi('/student/home');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState('interest');
  const all = order === 'interest' ? (data?.recommendations?.themes || data?.themes || []) : (data?.themes || []);
  const visible = all.filter(t => `${t.title} ${t.summary} ${t.companyName} ${t.field || ''}`.includes(query.trim()));
  return (
    <div className="stack lr-page">
      <LearningHeader eyebrow="DISCOVER / CONTENT LIBRARY" title="まだ知らない世界に、問いをひらく。" description="記録に残した関心から探す。いつもと違う分野を選ぶ。あなたの視点で、社会の問いと出会いましょう。" imageSrc="/images/fieldwork-v2.webp" imageAlt="地域の農家と対話する生徒と教員の架空の越境学習シーン" imageNote="AI生成イメージ" />
      <section className="panel stack">
        <div className="spread lr-wrap">
          <div><h2>学校から届いたテーマ</h2><p className="muted small">関心順は直近最大100件の提出記録にあるタグとテーマの内容を照合しています。職業適性の判定ではありません。</p></div>
          <label className="discovery-order">並び順<select className="input" value={order} onChange={e=>setOrder(e.target.value)}><option value="interest">自分の関心に近い順</option><option value="latest">新しく届いた順</option></select></label>
        </div>
        <input className="input" type="search" aria-label="テーマを検索" placeholder="テーマ・企業・気になる言葉で検索" value={query} onChange={e=>setQuery(e.target.value)} />
        {loading && <Loading />}
        <ErrorBox error={error} onRetry={reload} />
        {data?.themes.length === 0 && <p className="muted">いま配信中のテーマはありません。</p>}
        {!!data?.themes.length && !visible.length && <p className="muted">検索に合うテーマがありません。別の言葉で探してみましょう。</p>}
        <div className="discovery-grid">{visible.map((t) => {const scene=sceneForTheme(t); return (
          <article key={t.id} className="discovery-card">
            <figure><img src={scene.src} alt="" width="1536" height="1024" loading="lazy" /><figcaption>AI生成イメージ</figcaption></figure>
            <div className="discovery-body">
              <div className="spread lr-wrap"><span className="co">{t.companyName}</span>{t.interested && <span className="badge pen">関心あり</span>}</div>
              <h3><Link to={`/themes/${t.id}`}>{t.title}</Link></h3>
              <p className="muted small">{t.summary.slice(0,160)}{t.summary.length>160?'…':''}</p>
              {!!t.matchTags?.length && <p className="discovery-reason"><b>このテーマが近い理由</b><br />{t.matchTags.slice(0,2).map(x=>`「${x.tag}」の記録が${x.count}件`).join('・')}</p>}
              <Link to={`/themes/${t.id}`} className="text-link">問いと資料を見る →</Link>
            </div>
          </article>
        );})}</div>
      </section>
      <section className="panel spread lr-wrap"><div><h2>気になった問いを、現場で確かめよう。</h2><p className="muted">体験の目的や聞きたいことを、自分の言葉で計画できます。</p></div><Link to="/journey" className="btn primary">探究ストーリーへ →</Link></section>
    </div>
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
        <figure className="theme-scene"><img src={sceneForTheme(t).src} alt={sceneForTheme(t).alt} width="1536" height="1024" /><figcaption>AI生成イメージ・この企業の実際の活動写真ではありません</figcaption></figure>
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
