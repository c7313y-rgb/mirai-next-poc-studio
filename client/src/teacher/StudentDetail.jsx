import { useState } from 'react';
import { api, dateJa, dateTimeJa, TYPE_LABEL } from '../api.js';
import { useApi, Loading, ErrorBox, Empty, useToast } from '../ui.jsx';
import { Link } from '../router.jsx';

export default function StudentDetail({ studentId }) {
  const { data, error, loading, reload } = useApi(`/teacher/students/${studentId}`, [studentId]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const { student, records, alerts } = data;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="muted small" style={{ margin: 0 }}>仮名ID {student.pseudoId}</p>
          <h1 style={{ margin: 0 }}>出席番号 {student.attendanceNo}番 の記録</h1>
        </div>
        <Link to={`/classes/${student.classId}`} className="btn small ghost">クラスに戻る</Link>
      </div>

      <div className="notice small">
        氏名はシステムに保持していません。誰の記録かは、学校側で管理する出席番号との対応表でご確認ください。
      </div>

      {alerts.filter((a) => a.status === 'open').length > 0 && (
        <div className="notice alert">
          {alerts.filter((a) => a.status === 'open').map((a) => (
            <div key={a.id}><b>{a.kind === 'concern' ? '要確認' : '未提出'}</b>：{a.reason}（{dateTimeJa(a.created_at)}）</div>
          ))}
          <div className="small" style={{ marginTop: 6 }}>AIの検知は補助的なものです。対応の判断は学校の体制で行ってください。</div>
        </div>
      )}

      {records.length === 0 && <Empty>提出された記録はまだありません。</Empty>}
      {records.map((r) => <RecordCard key={r.id} record={r} onChange={reload} />)}

      {alerts.filter((a) => a.status !== 'open').length > 0 && (
        <section className="panel">
          <h2>対応済みのアラート</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>種別</th><th>内容</th><th>対応メモ</th><th>対応日時</th></tr></thead>
              <tbody>
                {alerts.filter((a) => a.status !== 'open').map((a) => (
                  <tr key={a.id}>
                    <td>{a.kind === 'concern' ? '要確認' : '未提出'}</td>
                    <td>{a.reason}</td>
                    <td>{a.note || <span className="muted">—</span>}</td>
                    <td className="small muted">{dateTimeJa(a.handled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function RecordCard({ record: r, onChange }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { await api.post(`/teacher/records/${r.id}/comments`, { body: body.trim() }); setBody(''); toast('コメントを送信しました'); onChange(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <article className={`panel stack ${r.concern ? '' : ''}`} style={r.concern ? { borderColor: '#f3b8b1' } : undefined}>
      <div className="spread">
        <div className="row">
          <b>{dateJa(r.submittedAt)}</b>
          <span className="badge pen">{r.typeLabel || TYPE_LABEL[r.type]}</span>
          {r.themeTitle && <span className="badge">テーマ：{r.themeTitle}</span>}
          {r.experienceDate && <span className="badge">体験日 {r.experienceDate}</span>}
          {r.concern && <span className="badge alert">要確認</span>}
        </div>
        <span className="small muted">{dateTimeJa(r.submittedAt)}</span>
      </div>

      {r.concern && <div className="notice alert small">検知理由：{r.concern}</div>}

      {r.images.length > 0 && (
        <div className="shots" style={{ maxWidth: 420 }}>
          {r.images.map((i) => (
            <a className="shot" key={i} href={`/api/files/images/${i}`} target="_blank" rel="noreferrer">
              <img loading="lazy" src={`/api/files/images/${i}`} alt="手帳の画像" />
            </a>
          ))}
        </div>
      )}

      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.finalText}</p>

      {r.summary && <div className="notice small"><b>AI要約：</b>{r.summary}</div>}
      {r.tags.length > 0 && <div>{r.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
      {r.feedback && <div className="feedback"><div className="from">副担任AIのフィードバック（生徒に表示されています）</div><p style={{ margin: 0 }}>{r.feedback}</p></div>}
      {r.aiStatus === 'pending' && <p className="muted small">AIのフィードバックを生成中です。</p>}
      {r.aiStatus === 'error' && <p className="small" style={{ color: 'var(--alert)' }}>AIのフィードバックは生成できませんでした。先生のコメントで補ってください。</p>}

      {r.comments.map((c) => (
        <div className="feedback" key={c.id}>
          <div className="from">{c.display_name || '先生'}のコメント<span className="muted small" style={{ marginLeft: 8, fontWeight: 400 }}>{dateTimeJa(c.created_at)}</span></div>
          <p style={{ margin: 0 }}>{c.body}</p>
        </div>
      ))}

      {!open && <button className="btn small" onClick={() => setOpen(true)}>コメントを書く</button>}
      {open && (
        <div className="stack">
          <textarea className="input" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="生徒に届くコメントを書いてください（1000文字以内）" />
          <div className="row">
            <button className="btn primary" disabled={busy || !body.trim()} onClick={send}>{busy ? '送信中…' : '送信する'}</button>
            <button className="btn ghost" onClick={() => { setOpen(false); setBody(''); }}>やめる</button>
          </div>
        </div>
      )}
    </article>
  );
}
