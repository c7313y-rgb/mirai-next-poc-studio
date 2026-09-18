import { useEffect } from 'react';
import { Link } from '../router.jsx';
import { SCENES } from '../learning/scenes.js';
import './service-design.css';

const steps = [
  { n: '01', label: 'デジタルで気づく', title: '日々の「気になる」を見つける。', text: '手帳に残した小さな発見を読み返し、問いかけをきっかけに自分の関心を考える。すぐに結論を出さず、変化や迷いも大切にします。', practice: '手帳の撮影・確認・提出／関心の振り返り' },
  { n: '02', label: '社会の問いと出会う', title: '広く知って、自分で選ぶ。', text: '企業の仕事や地域の課題を教材にして、さまざまな社会の姿に触れる。関心に近いテーマも、まだ知らない分野も見比べ、確かめたい問いを選びます。', practice: '企業テーマの検索／推薦理由の確認／体験の計画' },
  { n: '03', label: 'いつもの外で体験する', title: 'ひとつの現場を、深く知る。', text: '日常の生活圏を越え、地域や企業の現場で当事者と対話する。見聞きした事実と、自分の驚きや戸惑いを分けて残し、当たり前を見つめ直します。', practice: '体験した事実・感情・前提の変化を記録' },
  { n: '04', label: '手帳で深め、自分で決める', title: '自分の言葉で、次の一歩へ。', text: '心が動いたことを、NOLTYスコラ手帳などの紙の手帳に手書きで戻す。先生との対話で考えを深めながら、取り組みたい理由と次の行動を、生徒本人が言葉にします。', practice: '手帳との関連付け／教員との共有メモ／次の行動' },
];

function Scene({ scene, caption, eager = false }) {
  return <figure className="sd-scene"><img src={scene.src} alt={scene.alt} width="1536" height="1024" loading={eager ? 'eager' : 'lazy'} /><figcaption>{caption} <span>AI生成イメージ</span></figcaption></figure>;
}

export default function ServiceDesign({ user }) {
  useEffect(() => {
    const previous = document.title;
    document.title = '学びの設計思想 | 副担任mirAI NEXT';
    return () => { document.title = previous; };
  }, []);
  const entry = user ? 'ホームへ戻る' : 'ログイン画面へ';
  return (
    <div className="sd-page">
      <header className="sd-topbar">
        <Link to="/" className="logo" aria-label="mirAI NEXT ホーム"><span className="logo-mark">m</span><span>mirAI <b>NEXT</b><small>学びと社会をつなぐ</small></span></Link>
        <Link to="/" className="btn primary sd-entry">{entry}<span aria-hidden="true"> →</span></Link>
      </header>
      <main className="sd-main">
        <section className="sd-hero" aria-labelledby="sd-title">
          <div className="sd-hero-copy">
            <p className="sd-eyebrow">OUR APPROACH / 学びの設計思想</p>
            <h1 id="sd-title">答えを急がず、<br />自分の「なぜ」を育てる。</h1>
            <p className="sd-lead">デジタルで広げ、越境で揺さぶり、手帳で深める。</p>
            <p>副担任mirAI NEXTが大切にするのは、生徒自身が経験を振り返り、自分の言葉で未来を選ぶこと。企業の知見、現場での出会い、紙の手帳、先生との対話をつなぐ学びを目指します。</p>
            <div className="sd-promise"><b>問いかけが、考えるきっかけになる。</b><span>「どうして、そこが気になった？」<br />生徒の考えや志望理由を代筆する機能は設けていません。</span></div>
          </div>
          <Scene scene={SCENES.reflection} caption="心が動いた経験を、手帳に戻す。" eager />
        </section>

        <section className="sd-section" aria-labelledby="sd-cycle-title">
          <div className="sd-section-heading"><p className="sd-eyebrow">THE LEARNING CYCLE</p><h2 id="sd-cycle-title">気づきから、本人の自己決定まで。</h2><p>画面での学びを、現場へ。現場の経験を、手帳と対話へ。一度で終わらず、繰り返し深める4 STEPです。</p></div>
          <ol className="sd-cycle" aria-label="学びの循環"><li>デジタルの気づき</li><li>企業テーマ</li><li>実地の越境体験</li><li>紙の手帳で内省</li><li>教員との対話</li><li>本人の自己決定</li></ol>
          <ol className="sd-steps">{steps.map(step => <li key={step.n}><div className="sd-step-label"><span>{step.n}</span><b>{step.label}</b></div><h3>{step.title}</h3><p>{step.text}</p><p className="sd-practice"><span>PoCでできること</span>{step.practice}</p></li>)}</ol>
        </section>

        <section className="sd-section sd-world" aria-labelledby="sd-world-title">
          <div className="sd-section-heading"><p className="sd-eyebrow">WIDE TO DEEP</p><h2 id="sd-world-title">社会を広く知り、ひとつの現場を深く知る。</h2><p>最初から進路を決める必要はありません。いくつもの問いに出会い、実際に会い、聞き、感じたことから、自分の見方を更新していきます。</p></div>
          <div className="sd-scene-grid">
            <article><Scene scene={SCENES.company} caption="仕事の知見を、学校で考える問いへ。" /><h3>企業の知見を、教員と授業へつなぐ</h3><p>企業が提供する内容から教材の草案をつくり、教員が自校の目標や評価の観点に合わせて編集・承認します。社会の課題を、生徒が考えられる問いにして届けます。</p></article>
            <article><Scene scene={SCENES.fieldwork} caption="地域の当事者と話し、自分の前提に気づく。" /><h3>問いを持って、いつもの外へ出る</h3><p>現場で確かめたいことを準備し、当事者との対話で新しい視点を得る。実際の訪問は学校や受入先と計画し、アプリには目的・体験・振り返りを残します。</p></article>
          </div>
          <p className="sd-caption">画像は架空の学習場面です。実在する提携先や実施実績を示すものではありません。</p>
        </section>

        <section className="sd-section sd-people" aria-labelledby="sd-people-title">
          <div className="sd-section-heading"><p className="sd-eyebrow">THREE ROLES, ONE LEARNING JOURNEY</p><h2 id="sd-people-title">生徒の選択を、企業と先生が支える。</h2></div>
          <div className="sd-role-grid">
            <article><span className="sd-role-label">企業</span><h3>社会への入口をひらく</h3><p>仕事の知恵や現場の課題を教材にし、学校へ提供する。匿名の集計から、生徒が何に関心を持ったかを確かめます。</p></article>
            <article><span className="sd-role-label">教員</span><h3>学びの意味を一緒に考える</h3><p>教材の最終編集と授業の進行を担い、手帳や体験の記録をもとに対話する。生徒自身の言葉と選択を支えます。</p></article>
            <article><span className="sd-role-label">生徒</span><h3>経験を、自分の言葉にする</h3><p>関心を見つけ、試し、迷いも残す。手帳と先生との対話を通して、次に何をしたいかを自分で決めます。</p></article>
          </div>
        </section>

        <section className="sd-section sd-future" aria-labelledby="sd-future-title">
          <div className="sd-section-heading"><p className="sd-eyebrow">LONG-TERM VISION / 将来構想</p><h2 id="sd-future-title">3年間の変化が、自分の理由になる。</h2><p>目指すのは、一度の体験で完成する物語ではなく、日常の記録と越境体験を重ねていく循環です。</p></div>
          <div className="sd-years"><article><span>1〜2年次</span><h3>広げる、出会う、書き戻す。</h3><p>日々の手帳、企業テーマ、地域・企業での体験を行き来し、関心や見方の変化を残します。</p></article><article><span>3年次</span><h3>読み返す、対話する、自分で選ぶ。</h3><p>過去の経験を根拠に「なぜ取り組みたいか」を考え、教員との面談を通して進路や次の行動を言葉にします。</p></article></div>
          <p className="sd-future-note">3年間の本格運用は今後の構想です。長期保存への同意、学年移行・卒業時のデータの扱い、入試情報の利用は、学校や提供元と合意して整えていきます。</p>
        </section>

        <section className="sd-section sd-scope" aria-labelledby="sd-scope-title">
          <div className="sd-section-heading"><p className="sd-eyebrow">POC EDITION / 現在の提供範囲</p><h2 id="sd-scope-title">いま体験できることと、これからのこと。</h2><p>このページは、目指す学びの姿と現在のPoCの機能をあわせて紹介しています。</p></div>
          <div className="sd-scope-grid">
            <article><h3>いま体験できること</h3><ul><li>企業の教材草案づくり、学習指導要領の対応候補の確認、教員による編集・承認、授業の進行。</li><li>学校から届いたテーマの検索と、本人の提出記録にある関心タグに基づく候補の表示。</li><li>体験の計画・振り返り、手帳との関連付け、生徒本人にも共有される教員の面談メモ。</li></ul></article>
            <article><h3>現場とともに整えること</h3><ul><li>JMAMの企業・地域ネットワークとの接続、受入先の契約、訪問の手配や安全管理。</li><li>入試情報・合格体験談のデータベースとの連携と、3年間の継続運用。</li><li>副担任mirAI等との本番API接続。現在は標準CSV/JSONの確認・出力までです。</li></ul></article>
          </div>
          <details className="sd-details"><summary>問いかけ・AI・推薦の仕組みについて</summary><div><p>探究ストーリーの問いかけは、考えるきっかけとして用意した固定文です。新しいAI対話機能ではありません。デモの手帳OCRとコメントは模擬応答（mock）で、実物手帳でのAI品質や学習効果の実証は今後の確認事項です。</p><p>教材草案と推薦はローカルの規則による支援です。推薦は本人の直近最大100件の提出記録の関心タグを、配信中のテーマと照合します。強み・能力・職業適性を自動評価しません。気になった別の分野も自由に選べます。</p><p>学習指導要領の対応候補は、教員が自校の教育課程に照らして確認します。自動的な適合認定、入試の規制への適合や合格、学習成果を保証するものではありません。</p></div></details>
        </section>
        <section className="sd-close"><p className="sd-eyebrow">YOUR NEXT STEP</p><h2>今日の小さな気づきから、はじめよう。</h2><p>企業・教員・生徒、それぞれの画面から学びの循環に参加できます。</p><Link to="/" className="btn primary">{entry}<span aria-hidden="true"> →</span></Link></section>
      </main>
      <footer className="sd-footer"><span>副担任mirAI NEXT · 学びと社会をつなぐ</span><span>PoCのサービス設計思想</span></footer>
    </div>
  );
}
