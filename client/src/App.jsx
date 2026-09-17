import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useRoute, go } from './router.jsx';
import { Loading } from './ui.jsx';
import Login, { QrLogin } from './pages/Login.jsx';
import Account from './pages/Account.jsx';
import StudentApp from './student/StudentApp.jsx';
import TeacherApp from './teacher/TeacherApp.jsx';
import CompanyApp from './company/CompanyApp.jsx';
import AdminApp from './admin/AdminApp.jsx';

export default function App() {
  const route = useRoute();
  const [user, setUser] = useState(undefined);

  useEffect(() => { api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);
  useEffect(() => {
    const on = () => setUser(null);
    window.addEventListener('mn:unauthorized', on);
    return () => window.removeEventListener('mn:unauthorized', on);
  }, []);

  const logout = async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); go('/'); };

  if (route.path.startsWith('/qr/')) return <QrLogin token={route.path.slice(4)} onLogin={(u) => { setUser(u); window.history.replaceState(null, '', '#/'); go('/'); }} />;
  if (user === undefined) return <Loading />;
  if (!user) return <Login onLogin={(u) => { setUser(u); go('/'); }} />;
  if (route.path === '/account' || (user.mustChangePassword && user.role !== 'student')) {
    return <Account user={user} forced={user.mustChangePassword} onDone={() => { setUser({ ...user, mustChangePassword: false }); go('/'); }} onLogout={logout} />;
  }

  const props = { user, route, onLogout: logout };
  if (user.role === 'student') return <StudentApp {...props} />;
  if (user.role === 'teacher') return <TeacherApp {...props} />;
  if (user.role === 'company') return <CompanyApp {...props} />;
  return <AdminApp {...props} />;
}
