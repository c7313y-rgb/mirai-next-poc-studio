import { useEffect, useRef, useState } from 'react';
import { api, todayJst } from '../api.js';
import { go } from '../router.jsx';
import { ErrorBox, Loading, useToast } from '../ui.jsx';
import { StudentHead } from './StudentApp.jsx';

// 端末で縮小・JPEG化してから送る（通信量削減・iPadのHEIC対策・EXIFの位置情報を落とす）
async function shrink(file, maxSide = 2000) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
}

export default function Capture() {
  const [shots, setShots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const input = useRef();

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), [shots]);

  const add = async (e) => {
    const files = [...e.target.files].slice(0, 3 - shots.length);
    e.target.value = '';
    try {
      const next = [];
      for (const f of files) { const blob = await shrink(f); next.push({ blob, url: URL.createObjectURL(blob) }); }
      setShots((s) => [...s, ...next]);
    } catch { setErr(new Error('画像を読み込めませんでした。もう一度撮影してください')); }
  };

  const upload = async (withImages) => {
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      if (withImages) shots.forEach((s, i) => form.append('images', s.blob, `page${i + 1}.jpg`));
      const { id } = await api.post('/student/records', undefined, { form });
      go(`/capture/${id}`);
    } catch (x) { setErr(x); setBusy(false); }
  };

  return (
    <>
      <StudentHead title="手帳を撮る" back="/">
        <div className="progress-steps" aria-label="手順1/2"><i className="on" /><i /></div>
      </StudentHead>
      <main className="student-main">
        <div className="notice small">明るい場所で、ページ全体が入るように真上から撮ると読み取りやすくなります。1回に3枚まで。</div>
        <div className="shots">
          {shots.map((s, i) => (
            <div className="shot" key={s.url}>
              <img src={s.url} alt={`${i + 1}枚目`} />
              <button type="button" aria-label={`${i + 1}枚目を削除`} onClick={() => setShots((x) => x.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {shots.length < 3 && (
            <label className="shot add">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              {shots.length ? '追加で撮る' : '撮影する'}
              <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={add} />
            </label>
          )}
        </div>
        <ErrorBox error={err} />
        <button className="btn primary big block" disabled={!shots.length || busy} onClick={() => upload(true)}>
          {busy ? '送信中…' : `この${shots.length || ''}枚で読み取る`}
        </button>
        <button className="btn ghost block" disabled={busy} onClick={() => upload(false)}>カメラが使えないときは文字で入力する</button>
      </main>
    </>
  );
}

export function ConfirmRecord({ id }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [text, setText] = useState('');
  const [type, setType] = useState('reflection');
  const [themeId, setThemeId] = useState(null);
  const [expDate, setExpDate] = useState(todayJst());
  const [busy, setBusy] = useState(false);
  const filled = useRef(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    let timer;
    const started = Date.now();
    const poll = async () => {
      try {
        const d = await api.get(`/student/records/${id}`);
        if (!alive) return;
        if (d.record.status === 'submitted') { go('/records'); return; }
        setData(d);
        if (!filled.current && d.record.ocrStatus !== 'pending') {
          filled.current = true;
          setText(d.record.ocrText || '');
          if (d.themes.length) { setType('theme'); setThemeId(d.themes[0].id); }
        }
        if (d.record.ocrStatus === 'pending' && Date.now() - started < 180_000) timer = setTimeout(poll, 1500);
      } catch (x) { if (alive) setErr(x); }
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post(`/student/records/${id}/submit`, { type, themeId, experienceDate: expDate, text });
      toast('提出しました。コメントは少しあとに届きます');
      go('/');
    } catch (x) { setErr(x); setBusy(false); }
  };
  const discard = async () => {
    if (!window.confirm('この記録を削除しますか？')) return;
    await api.del(`/student/records/${id}`).catch(() => {});
    go('/');
  };

  if (!data) return err ? <main className="student-main"><ErrorBox error={err} /></main> : <Loading />;
  const r = data.record;
  const pending = r.ocrStatus === 'pending';
  return (
    <>
      <StudentHead title="確認して提出" back="/">
        <div className="progress-steps" aria-label="手順2/2"><i className="on" /><i className="on" /></div>
      </StudentHead>
      <main className="student-main">
        {r.images.length > 0 && (
          <div className="shots">{r.images.map((img) => <div className="shot" key={img}><img src={`/api/files/images/${img}`} alt="撮影した手帳" /></div>)}</div>
        )}
        {pending ? (
          <div className="panel stack" aria-live="polite">
            <p className="row" style={{ margin: 0 }}><span className="spinner" /> <b>AIが手書き文字を読み取っています</b></p>
            <p className="muted small" style={{ margin: 0 }}>30秒ほどかかることがあります。この画面を閉じても、ホームの「確認待ちの記録」から続けられます。</p>
          </div>
        ) : (
          <>
            {r.ocrStatus === 'error' && <div className="notice warn">うまく読み取れませんでした。手帳を見ながら入力して提出できます。</div>}
            <label className="field">
              <span>読み取った文章（まちがいを直してから提出）</span>
              <textarea className="input" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="手帳に書いたことを入力" />
            </label>
            <div>
              <p style={{ fontWeight: 700, margin: '0 0 4px' }}>記録の種類</p>
              <div className="seg" role="radiogroup">
                {[['theme', 'テーマ記録'], ['reflection', '振り返り'], ['experience', '体験記録']].map(([k, l]) => (
                  <button type="button" key={k} role="radio" aria-checked={type === k} className={type === k ? 'on' : ''} onClick={() => setType(k)} disabled={k === 'theme' && !data.themes.length}>{l}</button>
                ))}
              </div>
            </div>
            {type === 'theme' && (
              <div className="choice-list">
                {data.themes.map((t) => (
                  <button type="button" key={t.id} className={themeId === t.id ? 'on' : ''} aria-pressed={themeId === t.id} onClick={() => setThemeId(t.id)}>
                    <span className="small muted" style={{ display: 'block' }}>{t.companyName}</span>{t.title}
                  </button>
                ))}
              </div>
            )}
            {type === 'experience' && (
              <label className="field"><span>体験した日</span><input type="date" className="input" value={expDate} max={todayJst()} onChange={(e) => setExpDate(e.target.value)} /></label>
            )}
            <ErrorBox error={err} />
            <button className="btn primary big block" disabled={busy || !text.trim() || (type === 'theme' && !themeId)} onClick={submit}>{busy ? '提出中…' : '提出する'}</button>
          </>
        )}
        <button className="btn ghost danger block" onClick={discard}>この記録を削除</button>
      </main>
    </>
  );
}
