import { api, dateJa } from '../api.js';
import { useApi, Loading, ErrorBox, SurveyForm, Empty, useToast } from '../ui.jsx';

export default function Survey() {
  const { data, error, loading, reload } = useApi('/company/surveys');
  const toast = useToast();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const submit = (survey) => async (answers) => {
    await api.post(`/company/surveys/${survey.id}/responses`, { answers });
    toast('ご回答ありがとうございました');
    reload();
  };

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>継続参加アンケート</h1>
      <p className="muted">次年度以降の継続意向をお聞かせください。PoCの重要KPI（K-C4 継続参加意向）として集計します。回答は1社1回です。</p>

      {data.open.length === 0 && data.answered.length === 0 && <Empty>いま回答できるアンケートはありません。</Empty>}

      {data.open.map((s) => (
        <section className="panel stack" key={s.id}>
          <h2 style={{ margin: 0 }}>{s.title}</h2>
          <SurveyForm survey={s} onSubmit={submit(s)} />
        </section>
      ))}

      {data.answered.map((a) => (
        <div className="notice spread" key={a.id}>
          <span><b>{a.title}</b>　回答済み</span>
          <span className="small muted">{dateJa(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
