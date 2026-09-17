import { Link } from '../router.jsx';
import Shell from '../Shell.jsx';
import Kpi from './Kpi.jsx';
import Users from './Users.jsx';
import ThemesAdmin from './ThemesAdmin.jsx';
import SurveysAdmin from './SurveysAdmin.jsx';
import DataOps from './DataOps.jsx';
import Settings from './Settings.jsx';

const NAV = [
  { to: '/', label: 'A-01 KPI', match: (p) => p === '/' },
  { to: '/users', label: 'A-02 利用者管理' },
  { to: '/themes', label: 'A-03 テーマ・企業' },
  { to: '/surveys', label: 'A-04 アンケート' },
  { to: '/data', label: 'A-05 データ・ログ' },
  { to: '/settings', label: '設定' },
];

export default function AdminApp({ user, route, onLogout }) {
  const { path } = route;
  let page;
  if (path.startsWith('/users')) page = <Users />;
  else if (path.startsWith('/themes')) page = <ThemesAdmin />;
  else if (path.startsWith('/surveys')) page = <SurveysAdmin route={route} />;
  else if (path.startsWith('/data')) page = <DataOps />;
  else if (path.startsWith('/settings')) page = <Settings />;
  else page = <Kpi />;

  return (
    <Shell user={user} route={route} onLogout={onLogout} nav={NAV}>
      {page}
    </Shell>
  );
}
