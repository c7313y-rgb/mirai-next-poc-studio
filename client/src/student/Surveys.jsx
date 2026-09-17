import { api } from '../api.js';
import { go, Link } from '../router.jsx';
import { useApi, Loading, ErrorBox, SurveyForm, useToast } from '../ui.jsx';
import { StudentHead } from './StudentApp.jsx';

export function SurveyList() {
  const { data, error, loading } = useApi('/student/home');
  return (
    <>
      <StudentHead title="アンケート" />
      <main className="student-main">
        {loading && <Loading />}
        <ErrorBox error={error} />
        {data?.surveys.length === 0 && <p className="muted">いま回答するアンケートはありません。ありがとう！</p>}
        {data?.surveys.map((s) => <Link key={s.id} to={`/surveys/${s.id}`} className="theme-card"><div className="ttl">{s.title}</div><span className="muted small">{s.questions.length}問・1分ほど</span></Link>)}
      </main>
    </>
  );
}

export function SurveyAnswer({ id }) {
  const { data, error, loading } = useApi(`/student/surveys/${id}`);
  const toast = useToast();
  if (loading) return <Loading />;
  if (error) return <main className="student-main"><ErrorBox error={error} /></main>;
  return (
    <>
      <StudentHead title={data.survey.title} back="/surveys"><p className="muted small" style={{ margin: 0 }}>成績には関係ありません。思ったとおりに答えてください。</p></StudentHead>
      <main className="student-main">
        <SurveyForm survey={data.survey} onSubmit={async (answers) => { await api.post(`/student/surveys/${id}/responses`, { answers }); toast('回答ありがとう！'); go('/'); }} />
      </main>
    </>
  );
}
