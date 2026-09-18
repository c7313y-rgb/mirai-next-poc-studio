import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { api } from './api.js';

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((message, kind = 'info') => {
    setT({ message, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), kind === 'error' ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div role="status" aria-live="polite" className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.message}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// データ取得フック
export function useApi(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true }));
    try { setState({ data: await api.get(url), error: null, loading: false }); }
    catch (e) { setState({ data: null, error: e, loading: false }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function Loading({ label = '読み込み中' }) {
  return <div className="row muted" style={{ padding: 24 }}><span className="spinner" aria-hidden /> {label}</div>;
}
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="notice alert spread" role="alert">
      <span>{error.message}</span>
      {onRetry && <button className="btn small danger" onClick={onRetry}>再読み込み</button>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const hintId = `${generatedId}-hint`;
  const items = Children.toArray(children);
  const child = items.length === 1 ? items[0] : null;
  const singleControl = isValidElement(child)
    && ['input', 'select', 'textarea'].includes(child.type)
    && !(child.type === 'input' && child.props.type === 'hidden');

  if (singleControl) {
    const controlId = child.props.id || `${generatedId}-control`;
    const props = { id: controlId };
    if (hint) {
      props['aria-describedby'] = [...new Set(
        `${child.props['aria-describedby'] || ''} ${hintId}`.trim().split(/\s+/),
      )].join(' ');
    }
    return <div className="field"><span><label htmlFor={controlId}>{label}</label></span>{cloneElement(child, props)}{hint && <small id={hintId}>{hint}</small>}</div>;
  }

  // Composite fields keep their controls and labels intact; do not guess a target.
  return <div className="field" role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}><span id={labelId}>{label}</span>{children}{hint && <small id={hintId}>{hint}</small>}</div>;
}

export function Rating({ value, onChange, low = 'あてはまらない', high = 'とてもあてはまる', label }) {
  return (
    <div>
      <div className="rating" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
      <div className="rating-scale"><span>1 {low}</span><span>5 {high}</span></div>
    </div>
  );
}

export function SurveyForm({ survey, onSubmit, submitLabel = '回答を送信する' }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await onSubmit(answers); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="stack">
      {survey.questions.map((qn) => (
        <fieldset key={qn.key} className="panel tight" style={{ border: '1px solid var(--line)' }}>
          <legend className="sr-only">{qn.label}</legend>
          <p style={{ fontWeight: 700 }}>{qn.label}{qn.required && <span className="badge warn" style={{ marginLeft: 8 }}>必須</span>}</p>
          {qn.type === 'rating' && <Rating label={qn.label} value={answers[qn.key]} onChange={(v) => set(qn.key, v)} />}
          {qn.type === 'choice' && (
            <div className="choice-list">
              {qn.options.map((o) => {
                const opt = typeof o === 'string' ? { value: o, label: o } : o;
                return <button type="button" key={opt.value} className={answers[qn.key] === opt.value ? 'on' : ''} aria-pressed={answers[qn.key] === opt.value} onClick={() => set(qn.key, opt.value)}>{opt.label}</button>;
              })}
            </div>
          )}
          {qn.type === 'text' && <textarea className="input" maxLength={2000} value={answers[qn.key] || ''} onChange={(e) => set(qn.key, e.target.value)} placeholder="自由にお書きください" />}
        </fieldset>
      ))}
      <ErrorBox error={err} />
      <button className="btn primary big block" disabled={busy}>{busy ? '送信中…' : submitLabel}</button>
    </form>
  );
}

export function Meter({ value, target }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return <div className="meter" aria-hidden><i style={{ width: `${v * 100}%` }} />{target != null && target <= 1 && <b style={{ left: `${target * 100}%` }} />}</div>;
}

export function WeekBars({ weeks, valueKey = 'rate', format = (v) => `${Math.round(v * 100)}%` }) {
  const max = Math.max(0.0001, ...weeks.map((w) => w[valueKey] ?? 0), valueKey === 'rate' ? 1 : 0);
  return (
    <div className="bars" role="img" aria-label="週ごとの推移">
      {weeks.map((w) => (
        <div className="bar" key={w.week} title={`${w.week}週`}>
          <em>{w[valueKey] == null ? '' : format(w[valueKey])}</em>
          <i className={w.excluded || w.partial ? 'muted' : ''} style={{ height: `${((w[valueKey] ?? 0) / max) * 100}%` }} />
          <span>{w.week.slice(5).replace('-', '/')}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="panel tight muted" style={{ textAlign: 'center' }}>{children}</div>;
}

export function Brand({ sub }) {
  return (
    <a className="brand" href="#/">
      <img src="/favicon.svg" alt="" />
      <span>副担任mirAI NEXT<small>{sub}</small></span>
    </a>
  );
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
