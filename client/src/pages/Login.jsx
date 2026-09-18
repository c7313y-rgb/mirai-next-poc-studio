import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Field, Loading, useApi } from '../ui.jsx';
import { Link } from '../router.jsx';
const roles = [
  {
    id: 'company',
    name: '企業の方',
    en: 'COMPANY',
    mark: '▥',
    text: '自社の知見を、次の世代の学びへ。',
    details: '教材づくり・学校への提供・効果分析',
  },
  {
    id: 'teacher',
    name: '教員の方',
    en: 'TEACHER',
    mark: '▤',
    text: '社会とつながる授業を、もっと身近に。',
    details: '最終編集・授業の進行・生徒の伴走',
  },
  {
    id: 'student',
    name: '生徒の方',
    en: 'STUDENT',
    mark: '✧',
    text: '今日の発見が、自分の未来につながる。',
    details: '探究学習・振り返り・キャリアデザイン',
  },
];
export default function Login({ onLogin }) {
  const config = useApi('/auth/config'),
    [role, setRole] = useState('teacher'),
    [mode, setMode] = useState('demo'),
    [id, setId] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(null);
  const demo = config.data?.demoMode && mode === 'demo';
  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const result = await api.post(
        demo ? '/auth/demo' : '/auth/login',
        demo ? { role } : { loginId: id, password },
      );
      onLogin(result.user);
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="portal">
      <header className="portal-head">
        <a className="logo" href="#/">
          <span className="logo-mark">m</span>
          <span>
            mirAI <b>NEXT</b>
            <small>副担任mirAI / 学びと社会をつなぐ</small>
          </span>
        </a>
        <span className="pilot-label">
          PoC EDITION <i /> 2026
        </span>
      </header>
      <div className="portal-intro">
        <span className="eyebrow">LEARN TODAY. SHAPE TOMORROW.</span>
        <h1>
          社会のリアルを、
          <br />
          <span>自分の未来</span>に変えていく。
        </h1>
        <p>
          企業の知見と学校の学びをつなぎ、一人ひとりの「気になる」を育てる。
          <br />
          企業・教員・生徒、あなたの画面からはじめましょう。
        </p>
        <p className="sd-login-note">
          デジタルで気づき、現場で出会い、手帳と先生との対話で、自分の選択へ。
          <Link to="/about" className="sd-inline-link">このサービスが大切にしていること →</Link>
        </p>
      </div>
      <div className="portal-main">
        <section className="portal-scene">
          <img
            src="/images/fieldwork-v2.webp"
            alt="地域の農家と対話する生徒と教員の架空の越境学習シーン"
            width="1536"
            height="1024"
            fetchPriority="high"
          />
          <div className="scene-caption">
            <span>DISCOVER YOUR OWN PATH</span>
            <h2>
              出会う。手帳に残す。
              <br />
              自分の言葉で、未来を選ぶ。
            </h2>
            <div className="scene-flow">
              <b>企業の知見</b>
              <span>→</span>
              <b>学校の学び</b>
              <span>→</span>
              <b>未来の選択</b>
            </div>
          </div>
          <small className="image-note">AI生成による学習シーンのイメージ</small>
        </section>
        <section className="portal-access">
          <div className="spread">
            <h2>利用する画面を選ぶ</h2>
            {config.data?.demoMode && <span className="badge pen">デモ体験ができます</span>}
          </div>
          <p className="muted small">役割に合わせた専用のワークスペースへ。</p>
          <div className="role-choices">
            {roles.map((r) => (
              <button
                type="button"
                key={r.id}
                className={`role-choice ${role === r.id ? 'selected' : ''}`}
                aria-pressed={role === r.id}
                onClick={() => setRole(r.id)}
              >
                <span className={`role-mark role-mark-${r.id}`}>{r.mark}</span>
                <span>
                  <small>{r.en}</small>
                  <strong>{r.name}</strong>
                  <em>{r.details}</em>
                </span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
          {config.data?.demoMode && (
            <div className="login-mode">
              <button className={mode === 'demo' ? 'on' : ''} onClick={() => setMode('demo')}>
                デモで体験
              </button>
              <button className={mode === 'account' ? 'on' : ''} onClick={() => setMode('account')}>
                発行アカウント
              </button>
            </div>
          )}
          <form className="stack" onSubmit={login}>
            {!demo && (
              <>
                <Field label="ログインID">
                  <input
                    className="input"
                    autoComplete="username"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    required
                  />
                </Field>
                <Field label="パスワード">
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
              </>
            )}
            <ErrorBox error={err || config.error} />
            <button className="btn primary block login-submit" disabled={busy || config.loading}>
              {busy
                ? 'ログイン中…'
                : demo
                  ? `${roles.find((r) => r.id === role)?.name || '運営'}として体験する　→`
                  : 'ログインする　→'}
            </button>
          </form>
          <p className="login-help">
            {demo
              ? '登録不要・サンプルデータでお試しいただけます。'
              : '配布されたID・パスワード、またはQRコードでログインできます。'}
          </p>
          {config.data?.demoMode && (
            <button
              className="admin-demo"
              onClick={async () => {
                setBusy(true);
                try {
                  onLogin((await api.post('/auth/demo', { role: 'admin' })).user);
                } catch (e) {
                  setErr(e);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              運営向けKPI・アカウント管理を体験 ↗
            </button>
          )}
        </section>
      </div>
      <footer className="portal-footer">
        <span>© mirAI NEXT · EDUCATION × CAREER</span>
        <Link to="/about" className="sd-footer-link">学びの設計思想</Link>
        <span>PoCデモには、実在する生徒の個人情報を入力しないでください。</span>
      </footer>
    </main>
  );
}
export function QrLogin({ token, onLogin }) {
  const [err, setErr] = useState(null);
  useEffect(() => {
    api
      .post('/auth/qr', { token })
      .then((d) => onLogin(d.user))
      .catch(setErr);
  }, [token]);
  return err ? (
    <main className="login-wrap">
      <div className="panel">
        <h1>ログインできませんでした</h1>
        <ErrorBox error={err} />
        <a className="btn" href="#/">
          ログイン画面へ
        </a>
      </div>
    </main>
  ) : (
    <Loading label="QRコードでログインしています" />
  );
}
