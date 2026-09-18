import { useEffect, useState } from 'react';
import { Link, go, useRoute } from '../router.jsx';
import ServiceDesign from '../pages/ServiceDesign.jsx';
import { SCENES } from '../learning/scenes.js';
import { PublicCompany, PublicTeacher } from './CompanyTeacher.jsx';
import PublicStudent from './Student.jsx';
import { loadDemo, saveDemo, makeInitialState } from './model.js';

const roleInfo = {
  company: { name: '企業', en: 'COMPANY', title: '仕事の知見を、次の世代の学びへ。', detail: '企業の素材から授業の草案をつくり、学校へ提供する。', icon: '▥', scene: SCENES.company },
  teacher: { name: '教員', en: 'TEACHER', title: '社会との出会いを、自分で考える授業へ。', detail: '教材を自校向けに編集・承認し、授業を進める。', icon: '▤', scene: SCENES.fieldwork },
  student: { name: '生徒', en: 'STUDENT', title: '今日の「気になる」を、未来の一歩へ。', detail: '学びを振り返り、手帳と対話から自分の次の行動を選ぶ。', icon: '✧', scene: SCENES.reflection },
};

function availableStorage() { try { return window.localStorage; } catch { return undefined; } }

export default function PublicDemo() {
  const route = useRoute();
  const [initial] = useState(() => loadDemo(availableStorage()));
  const [state, setState] = useState(initial.state);
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState(initial.warning);
  const [resetOpen, setResetOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const role = route.path.slice(1);
  const current = roleInfo[role];
  useEffect(() => {
    try { saveDemo(availableStorage(), state); }
    catch { setWarning('端末に保存できませんでした。今の操作はこのタブ内で続けられますが、再読込すると失われる場合があります。'); }
  }, [state]);
  useEffect(() => { setNotice(''); setResetOpen(false); }, [route.path]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(id); }, [notice]);
  const reset = () => { setState(makeInitialState()); setRevision(value => value + 1); setResetOpen(false); setNotice('このブラウザーのデモを初期状態に戻しました。'); };

  if (route.path === '/about' || route.path === '/approach') return <><DemoNotice /><ServiceDesign publicDemo /></>;
  return <div className="pd-page">
    <header className="pd-header"><Link to="/" className="logo"><span className="logo-mark">m</span><span>mirAI <b>NEXT</b><small>学びと社会をつなぐ</small></span></Link><nav aria-label="公開デモの案内"><Link to="/about">学びの設計思想</Link><a href="https://github.com/c7313y-rgb/mirai-next-poc-studio" target="_blank" rel="noreferrer">ソースコード ↗</a></nav></header>
    <DemoNotice />
    {warning && <p className="pd-warning" role="status">{warning}</p>}
    {notice && <div className="pd-toast" role="status">{notice}</div>}
    {!current ? <main className="pd-main">
      <section className="pd-hero"><div><p className="eyebrow">LEARN TODAY. SHAPE TOMORROW.</p><h1>社会のリアルを、<br /><span>自分の未来</span>に変えていく。</h1><p>企業の知見と学校の学びをつなぐ、<br />副担任mirAI NEXTの公開デモです。</p><p className="pd-lead">デジタルで気づき、現場で出会い、<br />手帳と先生との対話で、自分の選択へ。</p><Link className="sd-footer-link" to="/about">このサービスが大切にしていること →</Link></div><figure><img src={SCENES.fieldwork.src} alt={SCENES.fieldwork.alt} width="1536" height="1024" /><figcaption>架空の学習シーン / AI生成イメージ</figcaption></figure></section>
      <section aria-labelledby="pd-roles"><div className="pd-section-title"><div><p className="eyebrow">TRY THE LEARNING JOURNEY</p><h2 id="pd-roles">あなたの役割から、体験する。</h2></div><span className="badge pen">登録・パスワード不要</span></div><div className="pd-role-grid">{Object.entries(roleInfo).map(([key, info]) => <article className="pd-role-card" key={key}><img src={info.scene.src} alt={info.scene.alt} width="1536" height="1024" /><div><span className="pd-role-tag">{info.icon} {info.en}</span><h3>{info.name}の体験</h3><p>{info.detail}</p><Link className="btn primary" to={`/${key}`}>{info.name}のデモを開く →</Link></div></article>)}</div></section>
      <section className="pd-how"><h2>5分で、ひとつながりの学びを体験。</h2><ol><li><b>企業</b><span>企業文を教材に変換し、学校へ提供。</span></li><li><b>教員</b><span>教材を採用・最終編集し、授業を作成。</span></li><li><b>生徒</b><span>授業前の理解度を保存。</span></li><li><b>教員 → 生徒</b><span>授業を進めて終了し、振り返りを未来へつなぐ。</span></li></ol><p>同じブラウザーの役割切替で一連の流れを体験できます。別の端末やブラウザーとは同期しません。</p></section>
      <section className="pd-scope"><h2>公開デモの提供範囲</h2><div className="pd-two-col"><div><h3>ここで試せること</h3><p>教材草案・指導要領の対応候補、教員の編集と承認、授業進行、自己評価と振り返り、探究4STEP、共有候補データの確認。</p></div><div><h3>サーバー版で扱うこと</h3><p>発行アカウントの認証、学校・企業ごとの権限制御、画像OCR、KPIの正式計測、複数端末の同期。本番の外部mirAI API接続は別途設定が必要です。</p></div></div></section>
    </main> : <main className="pd-main">
      <div className="pd-workspace-head"><div><p className="eyebrow">{current.en} / PUBLIC DEMO</p><h1>{current.name}のワークスペース</h1><p>{current.title}</p></div><Link to="/" className="btn ghost">体験の入口へ</Link></div>
      <nav className="pd-role-switch" aria-label="体験する役割を切り替える">{Object.entries(roleInfo).map(([key, info]) => <Link to={`/${key}`} className={key === role ? 'is-active' : ''} aria-current={key === role ? 'page' : undefined} key={key}>{info.icon} {info.name}</Link>)}</nav>
      <div className="pd-flow-note">同じブラウザー内で「企業 → 教員 → 生徒」と切り替え、教材の提供から授業・振り返りまで体験できます。</div>
      {role === 'company' ? <PublicCompany key={`company-${revision}`} state={state} onChange={setState} notify={setNotice} /> : role === 'teacher' ? <PublicTeacher key={`teacher-${revision}`} state={state} onChange={setState} notify={setNotice} /> : <PublicStudent key={`student-${revision}`} state={state} onChange={setState} notify={setNotice} />}
    </main>}
    <footer className="pd-footer"><div><b>mirAI NEXT</b><p>企業と学校と、一人ひとりの未来をつなぐ。</p><Link to="/about">学びの設計思想 →</Link></div><div><button className="btn ghost small" onClick={() => setResetOpen(!resetOpen)}>デモを初期状態に戻す</button>{resetOpen && <div className="pd-reset" role="alert"><p>このブラウザーで入力したデモ教材・授業・振り返りを消して、架空の初期データへ戻します。</p><div className="pd-actions"><button className="btn" onClick={() => setResetOpen(false)}>キャンセル</button><button className="btn danger" onClick={reset}>初期状態に戻す</button></div></div>}</div></footer>
  </div>;
}

function DemoNotice() { return <div className="pd-notice"><b>公開デモ</b><span>架空データで操作体験。入力内容はこのブラウザー内に保存されます。実在する生徒の情報や企業の機密情報は入力しないでください。</span></div>; }
