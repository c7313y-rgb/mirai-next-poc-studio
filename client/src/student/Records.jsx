import { useApi, Loading, ErrorBox } from '../ui.jsx';
import { dateJa, TYPE_LABEL } from '../api.js';
import { StudentHead } from './StudentApp.jsx';

export default function Records({ onLogout, user }) {
  const { data, error, loading, reload } = useApi('/student/records');
  return (
    <>
      <StudentHead title="わたしの記録">
        <div className="spread"><span className="muted small">仮名ID {user.pseudoId}</span><button className="btn small ghost" onClick={onLogout}>ログアウト</button></div>
      </StudentHead>
      <main className="student-main">
        {loading && <Loading />}
        <ErrorBox error={error} onRetry={reload} />
        {data?.records.length === 0 && <p className="muted">まだ提出した記録はありません。</p>}
        {data?.records.map((r) => (
          <article key={r.id} className="panel tight stack" style={{ '--gap': '8px' }}>
            <div className="spread small"><b>{dateJa(r.submittedAt)}</b><span className="badge pen">{TYPE_LABEL[r.type]}</span></div>
            {r.themeTitle && <div className="small muted">テーマ：{r.themeTitle}</div>}
            {r.images.length > 0 && <div className="shots">{r.images.map((i) => <div className="shot" key={i}><img loading="lazy" src={`/api/files/images/${i}`} alt="手帳の画像" /></div>)}</div>}
            <details><summary className="small" style={{ cursor: 'pointer' }}>書いた文章を見る</summary><p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{r.finalText}</p></details>
            {r.feedback && <div className="feedback"><div className="from">副担任AIから</div><p style={{ margin: 0 }}>{r.feedback}</p></div>}
            {r.comments.map((c, i) => <div key={i} className="feedback"><div className="from">{c.teacher || '先生'}から</div><p style={{ margin: 0 }}>{c.body}</p></div>)}
            {r.tags.length > 0 && <div>{r.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
          </article>
        ))}
      </main>
    </>
  );
}
