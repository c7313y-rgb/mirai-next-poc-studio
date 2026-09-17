import { pct } from '../api.js';
import { useApi, Loading, ErrorBox, Empty, Meter, downloadText } from '../ui.jsx';

export default function Report() {
  const { data, error, loading, reload } = useApi('/company/report');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const { company, totals, themes } = data;

  const csv = () => {
    const head = 'テーマ,配信クラス数,閲覧,関心あり,関心率,テーマ記録\n';
    const rows = themes.map((t) => [t.title.replaceAll('"', '""'), t.classes, t.views, t.interests, t.interestRate === null ? '' : (t.interestRate * 100).toFixed(1) + '%', t.records].map((v) => `"${v}"`).join(',')).join('\n');
    downloadText(`反応レポート_${company.name}.csv`, '\uFEFF' + head + rows);
  };

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="muted small" style={{ margin: 0 }}>{company.name}{company.industry ? `・${company.industry}` : ''}</p>
          <h1 style={{ margin: 0 }}>生徒の反応レポート</h1>
        </div>
        <button className="btn small" onClick={csv}>CSVで保存</button>
      </div>

      <div className="notice small">
        表示されるのは<b>集計値と、運営が内容を確認した匿名の要約</b>のみです。生徒個人の文章・氏名・画像は企業側からは一切参照できません。
        閲覧者が{totals.minCell}名未満の学校別数値は、個人が推測されないよう非表示（—）にしています。
        タグ・声の集計も、記録を提出した生徒が{totals.minCell}人未満の場合は非表示です。
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">テーマの閲覧</div>
          <div className="value">{totals.views}<small>回</small></div>
          <div className="sub">生徒×テーマの実数</div>
        </div>
        <div className="card">
          <div className="label">「関心あり」</div>
          <div className="value">{totals.interests}<small>件</small></div>
          <Meter value={totals.interestRate} target={0.3} />
          <div className="sub">関心率 {pct(totals.interestRate)}（PoC目標 30%）</div>
        </div>
        <div className="card">
          <div className="label">テーマに基づく記録</div>
          <div className="value">{totals.records}<small>件</small></div>
          <div className="sub">生徒が手帳に書いた記録の件数</div>
        </div>
        <div className="card">
          <div className="label">届いた学校数</div>
          <div className="value">{totals.schoolsReached}<small>校</small></div>
          <div className="sub">配信された協力校</div>
        </div>
      </div>

      {themes.length === 0 && <Empty>公開中のテーマがありません。運営にお問い合わせください。</Empty>}

      {themes.map((t) => (
        <section className="panel stack" key={t.id}>
          <div className="spread">
            <h2 style={{ margin: 0 }}>{t.title}</h2>
            <span className="badge">{t.status === 'published' ? '公開中' : '終了'}</span>
          </div>
          <div className="cards">
            <div className="card"><div className="label">配信クラス</div><div className="value">{t.classes}</div></div>
            <div className="card"><div className="label">閲覧</div><div className="value">{t.views}</div></div>
            <div className="card"><div className="label">関心あり</div><div className="value">{t.interests}<small>（{pct(t.interestRate)}）</small></div></div>
            <div className="card"><div className="label">記録</div><div className="value">{t.records}</div></div>
          </div>

          <div className="two-col">
            <div>
              <h3>学校別の関心率</h3>
              {t.bySchool.length === 0 && <Empty>まだ閲覧がありません。</Empty>}
              {t.bySchool.map((s) => (
                <div className="hbar" key={s.school}>
                  <span>{s.school}</span>
                  <div><i style={{ width: `${(s.rate || 0) * 100}%` }} /></div>
                  <span className="num">{s.suppressed ? '—' : pct(s.rate)}</span>
                </div>
              ))}
              {t.bySchool.some((s) => s.suppressed) && <p className="muted small">— は閲覧者が{totals.minCell}名未満のため非表示です。</p>}
            </div>
            <div>
              <h3>生徒の関心が向いた分野</h3>
              {t.tags.length === 0 && <Empty>記録が集まると表示されます。</Empty>}
              {t.tags.map((g) => (
                <div className="hbar" key={g.tag}>
                  <span>{g.tag}</span>
                  <div><i style={{ width: `${(g.count / t.tags[0].count) * 100}%` }} /></div>
                  <span className="num">{g.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3>生徒の声（匿名要約）</h3>
            {!t.voice && <Empty>記録が一定数たまり、運営の確認が終わると掲載されます。</Empty>}
            {t.voice && (
              <div className="notice stack">
                <p style={{ margin: 0 }}>{t.voice.summary}</p>
                {(t.voice.points || []).length > 0 && <ul style={{ margin: 0 }}>{t.voice.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                {t.voice.suggestion && <p style={{ margin: 0 }}><b>次回への提案：</b>{t.voice.suggestion}</p>}
                <p className="small muted" style={{ margin: 0 }}>{t.voice.sourceCount}件の記録をもとにAIが作成し、運営が内容を確認したものです。個人が特定される表現は含みません。</p>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
