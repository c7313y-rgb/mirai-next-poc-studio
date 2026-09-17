import { useApi, Loading, ErrorBox, downloadText } from '../ui.jsx';
import { LearningHeader, LearningEmpty } from './LearningUI.jsx';
export default function Career() {
  const { data, error, loading, reload } = useApi('/learning/career');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { profile, experiences, sharing } = data;
  return (
    <div className="stack lr-page">
      <LearningHeader
        eyebrow="MY FUTURE / CAREER DESIGN"
        title="「気になる」が、未来の道しるべ。"
        description="日々の記録を振り返ると、自分らしい関心が見えてくる。次の一歩を見つけましょう。"
        variant="career"
      />
      <div className="two-col">
        <section className="panel">
          <span className="eyebrow">MY INTERESTS</span>
          <h2>記録から見えてきた関心</h2>
          <p className="muted small">
            {profile.recordCount}
            件の記録に付けられたタグの回数です。職業適性を示すものではありません。
          </p>
          {profile.interests.slice(0, 8).map((x) => (
            <div className="career-bar" key={x.tag}>
              <div className="spread">
                <b>{x.tag}</b>
                <span>{x.count}件</span>
              </div>
              <div className="meter">
                <i style={{ width: `${(x.count / profile.interests[0].count) * 100}%` }} />
              </div>
            </div>
          ))}
          {!profile.interests.length && (
            <LearningEmpty title="関心は、これから育つ。">
              授業の振り返りで気になった分野を選んでみましょう。
            </LearningEmpty>
          )}
        </section>
        <section className="panel next-action">
          <span className="eyebrow">MY NEXT STEP</span>
          <h2>次にやってみたいこと</h2>
          {profile.nextActions.length ? (
            profile.nextActions.map((x, i) => (
              <div className="next-action-item" key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <p>{x}</p>
              </div>
            ))
          ) : (
            <p>授業の振り返りで、次の行動を記録してみましょう。</p>
          )}
          <a className="btn" href="#/lessons">
            授業を振り返る →
          </a>
        </section>
      </div>
      <section className="panel stack">
        <div>
          <span className="eyebrow">LEARNING JOURNEY</span>
          <h2>学びと、自分の変化</h2>
        </div>
        {experiences.length ? (
          experiences.map((x, i) => (
            <article className="response-card" key={i}>
              <div className="spread">
                <h3>{x.title}</h3>
                <span className="badge pen">
                  自己評価 {x.before} → {x.after} / 5
                </span>
              </div>
              <p>{x.learning}</p>
              <p className="muted">次の行動：{x.nextAction}</p>
            </article>
          ))
        ) : (
          <p className="muted">授業の振り返りを保存すると、ここに学習の履歴が並びます。</p>
        )}
        <p className="muted small">理解度は自分の実感を振り返るための自己評価です。</p>
      </section>
      <section className="panel stack">
        <div className="spread">
          <div>
            <span className="eyebrow">MIRAI CONNECTION</span>
            <h2>副担任mirAIに、学びをつなぐ。</h2>
          </div>
          <span className="badge warn">共有プレビュー · 未接続</span>
        </div>
        <p>以下は、キャリアへの反映を検討するための拡張データのプレビューです。項目・利用目的・同意と受取側の仕様は未合意のため、副担任mirAIへの送信は行いません。</p>
        <div className="connection-flow">
          <div>
            <b>mirAI NEXT</b>
            <small>手帳・授業・振り返り</small>
          </div>
          <span>→</span>
          <div>
            <b>共有データ</b>
            <small>検討用データを確認</small>
          </div>
          <span>⇢</span>
          <div className="pending">
            <b>副担任mirAI</b>
            <small>取込仕様の確認待ち</small>
          </div>
        </div>
        <div className="two-col">
          <div>
            <h3>拡張共有で検討する項目</h3>
            {sharing.fields.map((x) => (
              <p className="share-field" key={x}>
                <span>✓</span>
                {x}
              </p>
            ))}
          </div>
          <div>
            <h3>共有しない項目</h3>
            {sharing.excluded.map((x) => (
              <p className="share-field excluded" key={x}>
                <span>−</span>
                {x}
              </p>
            ))}
            <p className="muted small">
              個人のキャリアデータは企業には公開されません。合意した範囲の標準連携データは運営画面から出力します。ここに表示する拡張項目は、合意前に外部へ渡さないでください。
            </p>
          </div>
        </div>
        <details className="json-details">
          <summary>検討用の拡張データを見る（未合意・未送信）</summary>
          <pre>{JSON.stringify(sharing.payload, null, 2)}</pre>
        </details>
        <p className="muted small">JSONには学びの記録が含まれます。共有端末には保存せず、保存した場合は利用後に削除してください。</p>
        <div className="spread">
          <span className="small muted">最終送信：なし ／ mirAI取込確認：未検証</span>
          <button
            className="btn"
            onClick={() =>
              downloadText(
                'mirai-career-preview.json',
                JSON.stringify(sharing.payload, null, 2),
                'application/json',
              )
            }
          >
            検討用JSONをこの端末に保存 ↓
          </button>
        </div>
      </section>
    </div>
  );
}
