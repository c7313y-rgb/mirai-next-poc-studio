import { INTEREST_TAGS, RECORD_TYPES } from '../lib/taxonomy.js';

export const OCR_PROMPT = `あなたは高校生の手帳（手書き）を読み取る担当です。
画像に書かれている手書き文字を、書かれている順番どおりにテキスト化してください。
- 読めない文字は「〓」で置き換え、推測で補わない
- 印刷されている罫線・日付欄などの定型文字は含めない
- 画像が複数ある場合は、ページの区切りに空行を入れる
- 出力はテキスト本文のみ（説明や前置きは不要）`;

export function analyzePrompt({ text, type, themeTitle }) {
  return `あなたは高校の「副担任」として、生徒の手帳記録に短いフィードバックを返します。
以下を必ずJSONのみで出力してください（前置き・コードブロック不要）。

{
  "feedback": "生徒へのコメント。肯定的かつ具体的に、記録の中の言葉を1つ拾って80〜140字。評価・採点・説教はしない。次に考えてみたい問いを1つ添える",
  "tags": ["関心分野タグ。次のリストから最大3つ。該当がなければ空配列"],
  "summary": "教員向けの要約。事実ベースで60字以内",
  "concern": { "flag": true/false, "reason": "心身の不調、いじめ、暴力、家庭の困りごと、希死念慮などを示す記述があれば簡潔な理由。なければ null" }
}

関心分野タグのリスト: ${INTEREST_TAGS.join(' / ')}
concern は迷ったら true（教員が確認する前提。見逃しの方が問題）。
記録の種類: ${RECORD_TYPES[type] || type}${themeTitle ? `（取り組んだテーマ: ${themeTitle}）` : ''}

--- 生徒の記録 ---
${text}`;
}

export function voicePrompt({ themeTitle, texts }) {
  return `企業が提供した探究テーマ「${themeTitle}」に対する高校生の記録（${texts.length}件）を、企業向けに匿名で要約します。
厳守事項:
- 個人・学校・地域を特定できる情報（氏名、あだ名、学校名、部活名と大会名の組み合わせ、具体的な家庭事情など）は一切含めない
- 記録の文章をそのまま引用しない（言い換える）
- 心身の不調など要配慮な内容は含めない
出力はJSONのみ: {"summary": "全体傾向を200字程度", "points": ["生徒の反応として多かった観点を3〜5個、各40字以内"], "suggestion": "テーマ改善のヒントを80字以内"}

--- 記録 ---
${texts.map((t, i) => `[${i + 1}] ${t}`).join('\n')}`;
}

export function periodSummaryPrompt({ texts }) {
  return `高校生の一定期間の手帳記録を、進路指導（志望理由書づくり等）の材料として要約します。
本人の関心・行動・気づきの変化が分かるように、事実ベースで200字以内。心身の不調など要配慮な内容は含めない。
出力は要約本文のみ。

--- 記録（古い順） ---
${texts.map((t) => `・${t}`).join('\n')}`;
}

export function freeTextPrompt({ title, texts }) {
  return `アンケート「${title}」の自由記述（${texts.length}件）を分類・要約します。
出力はJSONのみ: {"categories": [{"name": "分類名", "count": 件数, "gist": "内容の要旨 60字以内（原文引用しない）"}], "summary": "全体の要約 150字以内", "actions": ["運営として検討すべき改善を最大3つ"]}
個人を特定できる情報は含めない。

--- 自由記述 ---
${texts.map((t, i) => `[${i + 1}] ${t}`).join('\n')}`;
}

export function worksheetPrompt({ companyName, material }) {
  return `企業「${companyName}」の資料をもとに、高校の探究の時間（50分）で使うテーマ案を作ります。
出力はJSONのみ: {"title": "生徒が興味を持てるテーマ名 30字以内", "summary": "テーマ概要 150字以内", "questions": ["生徒への問い 3〜4個。正解が1つに決まらない問い"], "worksheet": "ワークシート案（導入5分・個人ワーク15分・グループ20分・振り返り10分の流れ。手帳に書く振り返りの問いを含める）"}
企業の宣伝にならないこと、高校生が自分ごととして考えられることを優先。

--- 企業資料 ---
${material}`;
}

export function extractJson(text) {
  const s = String(text || '').replace(/```json|```/g, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('AI応答にJSONが含まれていません');
  return JSON.parse(s.slice(start, end + 1));
}
