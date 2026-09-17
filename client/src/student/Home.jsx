import { useApi, Loading, ErrorBox } from '../ui.jsx';
import { Link } from '../router.jsx';
import { dateJa, TYPE_LABEL } from '../api.js';

export default function Home({ user }) {
  const { data, error, loading, reload } = useApi('/student/home');
  return (
    <>
      <header className="student-head grid-paper">
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <p className="muted small" style={{ margin: 0 }}>{user.school?.name}　{user.class?.grade}年{user.class?.name}組 {user.attendanceNo}番</p>
          <h1 style={{ margin: '2px 0 12px' }}>今日の手帳を記録しよう</h1>
          {data && (
            <p style={{ margin: '0 0 14px' }}>
              今週の提出 <b className="marker" style={{ fontSize: '1.5rem' }}>{data.stats.submittedThisWeek}</b> 回
              <span className="muted">　これまで {data.stats.total} 件</span>
            </p>
          )}
          <Link to="/capture" className="btn primary big block">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            手帳を撮って提出
          </Link>
        </div>
      </header>
      <main className="student-main">
        {loading && !data && <Loading />}
        <ErrorBox error={error} onRetry={reload} />
        {data && (
          <>
            {data.drafts.filter((d) => d.ocrStatus !== 'pending' || true).length > 0 && (
              <section className="stack">
                <h2>確認待ちの記録</h2>
                {data.drafts.map((d) => (
                  <Link key={d.id} to={`/capture/${d.id}`} className="theme-card spread">
                    <span>{dateJa(d.createdAt)} に撮影</span>
                    <span className={`badge ${d.ocrStatus === 'done' || d.ocrStatus === 'none' ? 'pen' : d.ocrStatus === 'error' ? 'alert' : ''}`}>
                      {d.ocrStatus === 'pending' ? '読み取り中' : d.ocrStatus === 'error' ? '読み取り失敗・入力して提出' : '確認して提出'}
                    </span>
                  </Link>
                ))}
              </section>
            )}
            {data.surveys.length > 0 && (
              <Link to={`/surveys/${data.surveys[0].id}`} className="notice warn spread" style={{ textDecoration: 'none' }}>
                <b>アンケートに答えてください（1分）</b><span className="badge warn">回答する</span>
              </Link>
            )}
            <section className="stack">
              <div className="spread"><h2 style={{ margin: 0 }}>配信中の探究テーマ</h2><Link to="/themes" className="small">すべて見る</Link></div>
              {data.themes.length === 0 && <p className="muted">いま配信中のテーマはありません。</p>}
              {data.themes.slice(0, 3).map((t) => (
                <Link key={t.id} to={`/themes/${t.id}`} className="theme-card">
                  <div className="spread"><span className="co">{t.companyName}</span>{t.interested && <span className="badge" style={{ background: 'var(--marker)', borderColor: 'var(--ink)' }}>関心あり</span>}</div>
                  <div className="ttl">{t.title}</div>
                  <div className="muted small">{t.endDate.slice(5).replace('-', '/')} まで</div>
                </Link>
              ))}
            </section>
            <section className="stack">
              <h2>最近のコメント</h2>
              {data.latest.length === 0 && <p className="muted">記録を提出すると、ここにコメントが届きます。</p>}
              {data.latest.map((r) => (
                <article key={r.id} className="feedback">
                  <div className="spread small"><span className="from">{r.comments.length ? `${r.comments.at(-1).teacher || '先生'}から` : '副担任AIから'}</span><span className="muted">{dateJa(r.submittedAt)}・{TYPE_LABEL[r.type]}</span></div>
                  {r.comments.length > 0 && <p style={{ margin: '6px 0' }}>{r.comments.at(-1).body}</p>}
                  {r.aiStatus === 'pending' && <p className="muted" style={{ margin: '6px 0' }}><span className="spinner" style={{ width: 16, height: 16 }} /> コメントを作成中…</p>}
                  {r.feedback && !r.comments.length && <p style={{ margin: '6px 0' }}>{r.feedback}</p>}
                  <div>{r.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
                </article>
              ))}
            </section>
          </>
        )}
      </main>
    </>
  );
}
