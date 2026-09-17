import Shell from '../Shell.jsx';
import Overview from '../Overview.jsx';
import CurriculumStudio from '../learning/CurriculumStudio.jsx';
import Report from './Report.jsx';
import Materials from './Materials.jsx';
import Survey from './Survey.jsx';
const nav = [
  { to: '/', label: 'ダッシュボード', icon: '▦' },
  { to: '/curriculum', label: 'カリキュラムをつくる', icon: '✦' },
  { to: '/reports', label: '学びの反応・効果', icon: '▥' },
  { to: '/materials', label: '資料・素材の提出', icon: '▤' },
  { to: '/survey', label: '継続参加アンケート', icon: '☑' },
];
export default function CompanyApp(props) {
  const p = props.route.path;
  return (
    <Shell {...props} nav={nav}>
      {p === '/curriculum' ? (
        <CurriculumStudio role="company" />
      ) : p === '/reports' ? (
        <Report />
      ) : p === '/materials' ? (
        <Materials />
      ) : p === '/survey' ? (
        <Survey />
      ) : (
        <Overview user={props.user} />
      )}
    </Shell>
  );
}
