import { useState } from 'react';
import { api } from '../api.js';
import { useApi, Loading, ErrorBox, SurveyForm, Empty, useToast } from '../ui.jsx';

export default function LessonSurveys() {
  const { data, error, loading, reload } = useApi('/teacher/lesson-surveys');
  const [target, setTarget] = useState(null);
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const submit = async (answers) => {
    await api.post('/teacher/lesson-surveys', { distributionId: target.distributionId, answers });
    toast('ご回答ありがとうございました');
    setTarget(null);
    reload();
  };

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>授業後アンケート</h1>
      <p className="muted">テーマを使った授業のあとに、1分でご回答ください。回収率と「授業のしやすさ」はPoCの重要KPI（K-S4／K-S5）です。</p>

      {!data.survey && <Empty>いま回答できるアンケートはありません。</Empty>}

      {data.survey && !target && (
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>未回答の授業（{data.pending.length}件）</h2>
          {data.pending.length === 0 && <Empty>未回答の授業はありません。ご協力ありがとうございます。</Empty>}
          {data.pending.map((p) => (
            <div key={p.distributionId} className="spread panel tight">
              <div>
                <b>{p.title}</b>
                <div className="small muted">{p.className}・開始 {p.startDate}</div>
              </div>
              <button className="btn primary" onClick={() => setTarget(p)}>回答する</button>
            </div>
          ))}
        </section>
      )}

      {data.survey && target && (
        <section className="panel stack">
          <div className="spread">
            <div>
              <h2 style={{ margin: 0 }}>{data.survey.title}</h2>
              <p className="small muted" style={{ margin: 0 }}>{target.title}／{target.className}</p>
            </div>
            <button className="btn small ghost" onClick={() => setTarget(null)}>やめる</button>
          </div>
          <SurveyForm survey={data.survey} onSubmit={submit} />
        </section>
      )}
    </div>
  );
}
