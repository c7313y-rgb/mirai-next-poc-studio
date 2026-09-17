import { match, Link } from '../router.jsx';
import Home from './Home.jsx';
import Shell from '../Shell.jsx';
import Overview from '../Overview.jsx';
import LessonWorkspace from '../learning/Lessons.jsx';
import Career from '../learning/Career.jsx';
import Capture, { ConfirmRecord } from './Capture.jsx';
import { ThemeList, ThemeDetail } from './Themes.jsx';
import Records from './Records.jsx';
import { SurveyList, SurveyAnswer } from './Surveys.jsx';

const Icon = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  theme: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></svg>,
  book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M9 9h6M9 13h6" /></svg>,
  survey: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8l1.5 1.5L12 7M8 14l1.5 1.5L12 13M14 8h2M14 14h2" /></svg>,
};

export default function StudentApp({ user, route, onLogout }) {
  const { path } = route;
  let page;
  let m;
  if (path === '/capture') page = <Capture />;
  else if ((m = match('/capture/:id', path))) page = <ConfirmRecord id={m.id} />;
  else if (path === '/themes') page = <ThemeList />;
  else if ((m = match('/themes/:id', path))) page = <ThemeDetail id={m.id} />;
  else if (path === '/records') page = <Records onLogout={onLogout} user={user} />;
  else if (path === '/surveys') page = <SurveyList />;
  else if ((m = match('/surveys/:id', path))) page = <SurveyAnswer id={m.id} />;
  else if(path === '/lessons') page = <LessonWorkspace role="student" />;
  else if(path === '/career') page = <Career />;
  else if(path === '/journal') page = <Home user={user} />;
  else page = <Overview user={user} />;

  const nav=[{to:'/',label:'ホーム',icon:'▦'},{to:'/lessons',label:'授業に参加する',icon:'▷'},{to:'/themes',label:'探究テーマ',icon:'✦'},{to:'/capture',label:'手帳を記録する',icon:'▣'},{to:'/records',label:'わたしの記録',icon:'▤'},{to:'/career',label:'わたしの未来',icon:'✧'},{to:'/surveys',label:'アンケート',icon:'☑'}];
  return <Shell user={user} route={route} onLogout={onLogout} nav={nav}>{page}</Shell>;
}

export function StudentHead({ title, back, children }) {
  return (
    <header className="student-head grid-paper">
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {back && <a href={'#' + back} className="btn ghost small" style={{ marginLeft: -12 }}>戻る</a>}
        <h1 style={{ marginTop: back ? 4 : 0 }}>{title}</h1>
        {children}
      </div>
    </header>
  );
}
