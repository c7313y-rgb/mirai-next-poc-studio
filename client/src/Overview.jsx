import { useApi, ErrorBox, Loading } from './ui.jsx';
import { Link } from './router.jsx';
import { pct, num } from './api.js';
import { SCENES } from './learning/scenes.js';
const M = {
  company: {
    eyebrow: 'PARTNER HOME',
    title: '社会の知見を、\n次の世代の学びへ。',
    body: '仕事の現場にある問いが、生徒の探究のはじまりになる。',
    cta: 'カリキュラムをつくる',
    path: '/curriculum',
    approachTitle: '仕事の知見を、社会を知る入口へ。',
    approachText: '企業の問いを教員と教材にし、生徒の学びを支える。広い社会学習から現場での体験、手帳での内省へつなぐ設計です。',
  },
  teacher: {
    eyebrow: 'TEACHER HOME',
    title: '今日の学びを、\n未来の選択につなぐ。',
    body: '企業のリアルな課題を教材に、一人ひとりの気づきに伴走しましょう。',
    cta: '授業を確認する',
    path: '/lessons',
    approachTitle: '手帳と対話で、生徒自身の選択を支える。',
    approachText: '企業テーマや現場での経験を、自分の言葉で考える材料に。先生の最終編集と対話を、生徒の自己決定につなげます。',
  },
  student: {
    eyebrow: 'MY LEARNING',
    title: '今日の「気になる」から、\nはじめよう。',
    body: '社会を知ることは、自分を知ること。小さな発見を記録していこう。',
    cta: '今日の授業へ',
    path: '/lessons',
    approachTitle: '「気になる」を試して、自分の言葉にしよう。',
    approachText: '社会の問いに出会い、体験して、手帳に書き戻す。先生と話しながら、次の一歩を自分で選んでいこう。',
  },
};
export default function Overview({ user }) {
  const role = user.role,
    m = M[role],
    info = useApi(
      role === 'company'
        ? '/company/report'
        : role === 'teacher'
          ? '/teacher/classes'
          : '/student/home',
    ),
    lessons = useApi(role === 'company' ? '/learning/company-report' : '/learning/lessons');
  if (info.loading) return <Loading />;
  if (info.error) return <ErrorBox error={info.error} onRetry={info.reload} />;
  const d = info.data;
  const scene = role === 'company' ? SCENES.company : role === 'teacher' ? SCENES.fieldwork : SCENES.reflection;
  const stats =
    role === 'company'
      ? [
          ['教材が届いた学校', d.totals.schoolsReached, '校'],
          ['テーマの閲覧', d.totals.views, '件'],
          ['生徒の関心率', pct(d.totals.interestRate), ''],
          [
            '採用された教材',
            lessons.data?.curricula.reduce((s, c) => s + c.adoptionCount, 0) ?? '—',
            '件',
          ],
        ]
      : role === 'teacher'
        ? [
            ['担当クラス', d.classes.length, 'クラス'],
            ['担当する生徒', d.classes.reduce((s, c) => s + c.students, 0), '人'],
            ['準備した授業', lessons.data?.lessons.length ?? '—', '件'],
            ['授業後アンケート', d.pendingLessonSurveys, '件 未回答'],
          ]
        : [
            ['今週の振り返り', d.stats.submittedThisWeek, '回'],
            ['積み重ねた記録', d.stats.total, '件'],
            ['届いているテーマ', d.themes.length, '件'],
            ['参加する授業', lessons.data?.lessons.length ?? '—', '件'],
          ];
  return (
    <div className="stack overview">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{m.eyebrow}</span>
          <h1>
            {role === 'company'
              ? user.company?.name
              : role === 'teacher'
                ? 'こんにちは、先生。'
                : 'こんにちは。今日も一歩、未来へ。'}
          </h1>
          <p className="muted small">
            {role === 'company'
              ? '企業パートナーの活動ダッシュボード'
              : role === 'teacher'
                ? `${user.school?.name} · 担当クラスの学びを見渡す`
                : `${user.class?.grade}年${user.class?.name}組 ${user.attendanceNo}番 · あなたの学びのワークスペース`}
          </p>
        </div>
        <span className="date-chip">
          {new Date().toLocaleDateString('ja-JP', {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })}
        </span>
      </div>
      <section className="overview-hero">
        <div>
          <span className="eyebrow">LEARNING CONNECTS OUR FUTURE</span>
          <h2>{m.title}</h2>
          <p>{m.body}</p>
          <Link className="btn primary" to={m.path}>
            {m.cta}　→
          </Link>
        </div>
        <figure>
          <img src={scene.src} alt={scene.alt} width="1536" height="1024" fetchPriority="high" />
          <figcaption>社会とつながる学び / AI生成イメージ</figcaption>
        </figure>
      </section>
      <div className="stats-grid">
        {stats.map(([label, val, unit], i) => (
          <div className="stat-tile" key={label}>
            <div className="spread">
              <span>{label}</span>
              <span className={`stat-icon stat-${i}`}>{['◈', '▤', '↗', '◎'][i]}</span>
            </div>
            <b>
              {val}
              <small>{unit}</small>
            </b>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="spread">
            <div>
              <span className="eyebrow">{role === 'company' ? 'YOUR IMPACT' : 'NEXT CLASS'}</span>
              <h2>{role === 'company' ? '教材が生んだ、学びの変化' : '授業の予定と進行'}</h2>
            </div>
            <Link to={role === 'company' ? '/curriculum' : '/lessons'} className="text-link">
              すべて見る →
            </Link>
          </div>
          <ErrorBox error={lessons.error} />
          {role === 'company' ? (
            <>
              <p className="small muted">
                理解度の前後比較は自己評価です。少人数の集計は個人の特定を防ぐため表示しません。
              </p>
              {lessons.data?.curricula.slice(0, 4).map((c) => (
                <article className="impact-row" key={c.curriculumId}>
                  <div>
                    <b>{c.title}</b>
                    <small>
                      教員採用 {c.adoptionCount}件 · 授業 {c.lessonCount}件
                    </small>
                  </div>
                  <div className="impact-score">
                    {c.suppressed ? '集計待ち' : `${num(c.beforeAverage)} → ${num(c.afterAverage)}`}
                    <small>理解度 / 5</small>
                  </div>
                </article>
              ))}
            </>
          ) : lessons.data?.lessons.length ? (
            lessons.data.lessons.slice(0, 4).map((l) => (
              <Link to="/lessons" className="class-preview" key={l.id}>
                <span className="lesson-symbol">▤</span>
                <div>
                  <small>
                    {l.className} · {l.duration}分
                  </small>
                  <b>{l.title}</b>
                </div>
                <span className={`badge ${l.status === 'active' ? 'pen' : ''}`}>
                  {{ active: '授業中', planned: '開始前', completed: '終了' }[l.status]}
                </span>
              </Link>
            ))
          ) : (
            <p className="muted">
              まだ授業がありません。
              {role === 'teacher'
                ? '教材ライブラリから授業を準備しましょう。'
                : '先生からの配信をお待ちください。'}
            </p>
          )}
        </section>
        <section className="panel quick-panel">
          <span className="eyebrow">QUICK ACCESS</span>
          <h2>次のアクション</h2>
          {(role === 'company'
            ? [
                ['01', '知見を教材にする', '入力・編集して学校へ提供', '/curriculum'],
                ['02', '生徒の反応を知る', '関心と匿名の声を確認', '/reports'],
                ['03', '素材を届ける', '参考資料やリンクを共有', '/materials'],
              ]
            : role === 'teacher'
              ? [
                  ['01', '授業を準備する', '教材の採用・編集・最終承認', '/curriculum'],
                  ['02', '生徒の記録を見る', '提出状況・コメント・要確認', '/classes'],
                  ['03', '授業を振り返る', '授業後アンケートに回答', '/lesson-surveys'],
                  ['04', '探究・面談に伴走する', '体験の記録と声かけ、実証の評価', '/journey'],
                ]
              : [
                  ['01', '今日の手帳を記録', '撮影・確認・提出', '/capture'],
                  ['02', '気になるテーマを探す', '社会のリアルな問いに出会う', '/themes'],
                  ['03', 'わたしの未来を見る', '関心・次の行動・mirAI共有', '/career'],
                  ['04', '体験を、自分の言葉に', '越境計画・手帳内省・先生との対話', '/journey'],
                ]
          ).map(([n, title, desc, path]) => (
            <Link className="quick-link" key={n} to={path}>
              <span>{n}</span>
              <div>
                <b>{title}</b>
                <small>{desc}</small>
              </div>
              <em>↗</em>
            </Link>
          ))}
        </section>
      </div>
      <section className="sd-role-note" aria-label="このサービスが大切にしていること">
        <div>
          <span className="sd-role-note-label">このサービスが大切にしていること</span>
          <h3>{m.approachTitle}</h3>
          <p>{m.approachText}</p>
        </div>
        <Link to="/about" className="sd-footer-link">学びの設計思想を見る →</Link>
      </section>
    </div>
  );
}
