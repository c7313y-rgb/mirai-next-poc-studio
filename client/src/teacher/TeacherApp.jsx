import { match, Link, useRoute } from '../router.jsx';
import { useApi, Loading, ErrorBox } from '../ui.jsx';
import Shell from '../Shell.jsx';
import Overview from '../Overview.jsx';
import CurriculumStudio from '../learning/CurriculumStudio.jsx';
import LessonWorkspace from '../learning/Lessons.jsx';
import ClassDashboard from './ClassDashboard.jsx';
import StudentDetail from './StudentDetail.jsx';
import Themes from './Themes.jsx';
import LessonSurveys from './LessonSurveys.jsx';
const nav = [
  { to: '/', label: 'ダッシュボード', icon: '▦' },
  { to: '/curriculum', label: '教材ライブラリ・編集', icon: '▤' },
  { to: '/lessons', label: '授業の進行', icon: '▷' },
  { to: '/classes', label: 'クラス・生徒の記録', icon: '◎' },
  { to: '/themes', label: '探究テーマの配信', icon: '✦' },
  { to: '/lesson-surveys', label: '授業後アンケート', icon: '☑' },
];
export default function TeacherApp(props) {
  const p = props.route.path;
  let page, m;
  if ((m = match('/classes/:id', p))) page = <ClassDashboard classId={m.id} />;
  else if ((m = match('/students/:id', p))) page = <StudentDetail studentId={m.id} />;
  else if (p === '/classes') page = <Classes />;
  else if (p === '/curriculum') page = <CurriculumStudio role="teacher" />;
  else if (p === '/lessons') page = <LessonWorkspace role="teacher" />;
  else if (p === '/themes') page = <Themes />;
  else if (p === '/lesson-surveys') page = <LessonSurveys />;
  else page = <Overview user={props.user} />;
  return (
    <Shell {...props} nav={nav}>
      {page}
    </Shell>
  );
}
export function Classes() {
  const { data, error, loading, reload } = useApi('/teacher/classes');
  useRoute();
  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>担当クラス</h1>
        {data?.pendingLessonSurveys > 0 && (
          <Link
            to="/lesson-surveys"
            className="notice warn"
            style={{ textDecoration: 'none', fontWeight: 700 }}
          >
            未回答の授業後アンケートが {data.pendingLessonSurveys} 件あります
          </Link>
        )}
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.classes.length === 0 && (
        <div className="panel">
          担当クラスが登録されていません。運営（Edutex）にご連絡ください。
        </div>
      )}
      <div className="cards">
        {data?.classes.map((c) => (
          <Link
            key={c.id}
            to={`/classes/${c.id}`}
            className="card"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="label">{c.school_name}</div>
            <div className="value">
              {c.grade}年{c.name}組
            </div>
            <div className="sub">生徒 {c.students}名　›　ダッシュボードを開く</div>
          </Link>
        ))}
      </div>
      <p className="muted small">
        表示されるのは担当クラスの生徒のみです。生徒の氏名はシステムに保持していないため、出席番号と仮名IDで表示されます。
      </p>
    </div>
  );
}
