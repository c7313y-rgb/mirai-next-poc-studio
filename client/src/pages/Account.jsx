import { useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Field, useToast } from '../ui.jsx';

export default function Account({ user, forced, onDone, onLogout }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState(null);
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/password', { current, next }); toast('パスワードを変更しました'); onDone(); }
    catch (x) { setErr(x); }
  };
  return (
    <main className="login-wrap"><div className="login-card panel stack">
      <h1>パスワードの変更</h1>
      {forced && <div className="notice warn">初回ログインのため、パスワードを変更してください。</div>}
      <p className="muted small">ログインID：{user.loginId}</p>
      <form className="stack" onSubmit={submit}>
        <Field label="現在のパスワード"><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></Field>
        <Field label="新しいパスワード" hint="8文字以上"><input className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        <ErrorBox error={err} />
        <button className="btn primary block">変更する</button>
      </form>
      <div className="spread">{!forced && <a href="#/" className="btn ghost">戻る</a>}<button className="btn ghost" onClick={onLogout}>ログアウト</button></div>
    </div></main>
  );
}
