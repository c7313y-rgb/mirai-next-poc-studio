import { useState } from 'react';
import { api, pct, dateJa, dateTimeJa } from '../api.js';
import { useApi, Loading, ErrorBox, Meter, WeekBars, Empty, useToast } from '../ui.jsx';
import { Link, go } from '../router.jsx';

export default function ClassDashboard({ classId }) {
  const { data, error, loading, reload } = useApi(`/teacher/classes/${classId}/dashboard`, [classId]);
  const [sort, setSort] = useState('no');
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const { cards, weeks, tags, alerts, students } = data;

  const handle = async (a) => {
    const note = window.prompt('対応内容を記録します（任意・500文字以内）\n例：本人と面談、担任・学年主任に共有', '');
    if (note === null) return;
    try { await api.post(`/teacher/alerts/${a.id}/handle`, { note }); toast('対応済みにしました'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const sorted = [...students].sort((a, b) => {
    if (sort === 'submissions') return a.submissions - b.submissions || a.attendanceNo - b.attendanceNo;
    if (sort === 'last') return (a.lastSubmitted || '').localeCompare(b.lastSubmitted || '') || a.attendanceNo - b.attendanceNo;
    return a.attendanceNo - b.attendanceNo;
  });

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="muted small" style={{ margin: 0 }}>{data.class.school_name}</p>
          <h1 style={{ margin: 0 }}>{data.class.grade}年{data.class.name}組</h1>
        </div>
        <div className="row">
          <Link to="/" className="btn small ghost">クラス一覧</Link>
          <button className="btn small" onClick={reload}>更新</button>
        </div>
      </div>

      {cards.concernAlerts > 0 && (
        <div className="notice alert">
          <b>要確認の記録が {cards.concernAlerts} 件あります。</b>　このアラートはAIによる気づきの共有です。判断と対応は必ず先生方の体制で行ってください（本システムは見守り・通報の代替ではありません）。
        </div>
      )}

      <div className="cards">
        <div className="card">
          <div className="label">今週記録した生徒</div>
          <div className="value">{cards.activeThisWeek}<small>/ {cards.students}名</small></div>
          <Meter value={cards.activeRateThisWeek} target={0.5} />
          <div className="sub">{pct(cards.activeRateThisWeek)}（KPI目標 週50%）</div>
        </div>
        <div className="card">
          <div className="label">提出記録</div>
          <div className="value">{cards.submissionsTotal}<small>件</small></div>
          <div className="sub">今週 {cards.submissionsThisWeek}件</div>
        </div>
        <div className="card">
          <div className="label">テーマへの「関心あり」</div>
          <div className="value">{cards.interests}<small>件</small></div>
          <div className="sub">企業レポートに集計されます</div>
        </div>
        <div className={`card ${cards.openAlerts ? 'alert' : ''}`}>
          <div className="label">未対応のアラート</div>
          <div className="value">{cards.openAlerts}<small>件</small></div>
          <div className="sub">うち要確認 {cards.concernAlerts}件</div>
        </div>
        <div className="card">
          <div className="label">生徒アンケート回答</div>
          <div className="value">{cards.studentSurveyRate === null ? '—' : pct(cards.studentSurveyRate)}</div>
          <div className="sub">{cards.studentSurveyRate === null ? '配信中のアンケートはありません' : 'クラス内の回答率'}</div>
        </div>
        <div className="card">
          <div className="label">授業後アンケート</div>
          <div className="value">{cards.pendingLessonSurveys}<small>件未回答</small></div>
          <div className="sub"><Link to="/lesson-surveys">回答する</Link></div>
        </div>
      </div>

      <div className="two-col">
        <section className="panel">
          <h2>週ごとの記録した生徒の割合</h2>
          <WeekBars weeks={weeks} />
          <p className="muted small" style={{ marginTop: 8 }}>灰色は進行中の週（途中の値）です。</p>
        </section>
        <section className="panel">
          <h2>クラスの関心の広がり</h2>
          {tags.length === 0 && <Empty>記録が集まると、関心の分野が表示されます。</Empty>}
          {tags.slice(0, 8).map((t) => (
            <div className="hbar" key={t.tag}>
              <span>{t.tag}</span>
              <div><i style={{ width: `${(t.count / tags[0].count) * 100}%` }} /></div>
              <span className="num">{t.count}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="panel">
        <h2>アラート（未対応）</h2>
        {alerts.length === 0 && <Empty>未対応のアラートはありません。</Empty>}
        {alerts.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>種別</th><th>出席番号</th><th>内容</th><th>検知</th><th></th></tr></thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`badge ${a.kind === 'concern' ? 'alert' : 'warn'}`}>{a.kind === 'concern' ? '要確認' : '未提出'}</span></td>
                    <td>{a.attendanceNo}番</td>
                    <td>{a.reason}</td>
                    <td className="small muted">{dateTimeJa(a.createdAt)}</td>
                    <td className="row" style={{ gap: 6 }}>
                      <button className="btn small" onClick={() => go(`/students/${a.studentId}`)}>記録を見る</button>
                      <button className="btn small ghost" onClick={() => handle(a)}>対応済みにする</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="spread">
          <h2 style={{ margin: 0 }}>生徒一覧</h2>
          <label className="row small" style={{ gap: 6 }}>
            並び順
            <select className="input" style={{ minHeight: 34, width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="no">出席番号</option>
              <option value="submissions">提出が少ない順</option>
              <option value="last">最終提出が古い順</option>
            </select>
          </label>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>番号</th><th>仮名ID</th><th className="num">提出</th><th>最終提出</th><th className="num">関心</th><th>関心の分野</th><th>状態</th></tr></thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => go(`/students/${s.id}`)}>
                  <td><b>{s.attendanceNo}</b></td>
                  <td className="small muted">{s.pseudoId}</td>
                  <td className="num">{s.submissions}</td>
                  <td className="small">{s.lastSubmitted ? dateJa(s.lastSubmitted) : <span className="muted">—</span>}</td>
                  <td className="num">{s.interests}</td>
                  <td>{s.topTags.map((t) => <span className="tag" key={t}>{t}</span>)}</td>
                  <td>{s.openAlerts > 0 ? <span className="badge alert">アラート{s.openAlerts}</span> : s.submissions === 0 ? <span className="badge warn">未提出</span> : <span className="badge ok">記録あり</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
