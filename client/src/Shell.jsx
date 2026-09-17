import { Link } from './router.jsx';
import { useApi } from './ui.jsx';
const labels = {
  company: '企業パートナー',
  teacher: '教員ワークスペース',
  student: 'マイラーニング',
  admin: 'PoC運営管理',
};
export default function Shell({ user, route, onLogout, nav, children }) {
  const info = useApi('/auth/config');
  const current = nav.find((n) =>
    n.to === '/' ? route.path === '/' : route.path.startsWith(n.to),
  );
  return (
    <div className={`workspace role-${user.role}`}>
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>
      <aside className="workspace-side">
        <Link to="/" className="logo">
          <span className="logo-mark">m</span>
          <span>
            mirAI <b>NEXT</b>
            <small>EDUCATION & CAREER</small>
          </span>
        </Link>
        <div className="workspace-person">
          <span className="avatar">
            {{ company: '企', teacher: '教', student: '学', admin: '運' }[user.role]}
          </span>
          <div>
            <b>{labels[user.role]}</b>
            <small>{user.company?.name || user.school?.name || '実証プロジェクト'}</small>
          </div>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="メインメニュー">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={current === n ? 'active' : ''}
              aria-current={current === n ? 'page' : undefined}
            >
              <span aria-hidden="true">{n.icon || '◇'}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>✦</span>
            <b>学びを、未来につなぐ。</b>
            <p>
              小さな気づきを重ねて、
              <br />
              自分らしい一歩を。
            </p>
          </div>
          <Link to="/account" className="side-account">
            アカウント設定 ↗
          </Link>
          <button className="side-logout" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-top">
          <span>
            {labels[user.role]} <span className="crumb">/ {current?.label || '詳細'}</span>
          </span>
          <div className="row">
            {info.data?.demoMode && (
              <span className="demo-chip">
                <i /> DEMO DATA
              </span>
            )}
            <span className="top-avatar">
              {user.attendanceNo
                ? `${user.attendanceNo}番`
                : user.displayName?.slice(0, 2) || '担当'}
            </span>
          </div>
        </header>
        {info.data?.demoMode && (
          <div className="demo-ribbon">
            サンプルデータで体験中{' '}
            <span>AIの読み取り・コメントはデモ応答です。実証の評価値ではありません。</span>
          </div>
        )}
        <main className="workspace-content" id="main-content">
          {children}
        </main>
        <footer className="workspace-footer">
          mirAI NEXT <span>企業と学校と、一人ひとりの未来をつなぐ。</span>
        </footer>
      </div>
    </div>
  );
}
