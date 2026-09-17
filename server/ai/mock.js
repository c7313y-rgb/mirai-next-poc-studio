import { keywordConcern } from '../lib/safety.js';

// 外部送信なしで全機能を動かすためのデモ用プロバイダ。読み取り結果はダミー。
const TAG_RULES = [
  [/ロボット|機械|工場|ものづくり|設計|エンジン/, 'ものづくり・工学'],
  [/AI|プログラム|アプリ|ゲーム|パソコン|データ|IT/, '情報・デジタル'],
  [/病院|看護|介護|福祉|医療|薬/, '医療・看護・福祉'],
  [/保育|子ども|先生になりたい|教育|授業/, '教育・子ども'],
  [/環境|エネルギー|ゴミ|リサイクル|温暖化|脱炭素/, '環境・エネルギー'],
  [/農業|食べ物|料理|食品|野菜|お米/, '食・農業'],
  [/地域|まちづくり|商店街|地元|観光客/, '地域・まちづくり'],
  [/会社|お金|経営|商品|販売|マーケティング|起業/, '経済・ビジネス'],
  [/英語|海外|留学|外国/, '国際・語学'],
  [/法律|政治|選挙|市役所|行政/, '法律・政治・行政'],
  [/絵|デザイン|音楽|美術|写真/, '芸術・デザイン'],
  [/動画|YouTube|テレビ|アニメ|映画/, 'メディア・エンタメ'],
  [/部活|スポーツ|運動|サッカー|野球|健康/, 'スポーツ・健康'],
  [/実験|研究|理科|宇宙|生物|化学/, '自然科学・研究'],
  [/旅行|電車|鉄道|交通|ホテル/, '観光・交通'],
  [/友達|人間関係|気持ち|心理|話し合い/, '心理・人間関係'],
];

const SAMPLE_OCR = [
  '今日の探究の時間で、企業の人の話を聞いた。\n仕事は「困っている人を助ける仕組みを作ること」だと言っていたのが印象に残った。\n自分も地域の商店街を元気にする方法を考えてみたい。',
  '部活の試合で負けてくやしかった。\nでも最後まで声を出せたのはよかった。\n来週までに練習メニューを自分で考えてみる。',
  '工場見学の動画を見て、ロボットが人と一緒に働いているのがおもしろかった。\nプログラムを作る仕事にも興味がわいた。',
];

export const mockProvider = {
  name: 'mock',
  async ocr(images) {
    await new Promise((r) => setTimeout(r, 400));
    const i = images.reduce((a, img) => a + img.buffer.length, 0) % SAMPLE_OCR.length;
    return { text: `【デモ読み取り】\n${SAMPLE_OCR[i]}` };
  },
  async analyze({ text }) {
    const tags = TAG_RULES.filter(([re]) => re.test(text)).map(([, t]) => t).slice(0, 3);
    const concern = keywordConcern(text);
    const firstLine = String(text).replace(/【デモ読み取り】/, '').split(/\n/).map((s) => s.trim()).find(Boolean) || '記録';
    return {
      feedback: `「${firstLine.slice(0, 24)}${firstLine.length > 24 ? '…' : ''}」と書けているのがいいですね。自分の言葉で残すと、あとで見返したときに変化が分かります。次は「なぜそう感じたのか」を一言足してみませんか？`,
      tags,
      summary: firstLine.slice(0, 60),
      concern,
    };
  },
  async voiceSummary({ texts }) {
    return {
      summary: `${texts.length}件の記録から、テーマを自分の身近な生活や地域と結びつけて考える生徒が多く見られました（デモ要約）。`,
      points: ['身近な課題との結びつけ', '仕事内容への具体的な関心', 'もっと現場の話を聞きたいという声'],
      suggestion: '現場で働く人の短い動画があると、問いへの入り口が広がります。',
    };
  },
  async periodSummary({ texts }) {
    return `期間中に${texts.length}件の記録。${texts.at(-1)?.slice(0, 80) || ''}（デモ要約）`;
  },
  async freeText({ texts }) {
    return {
      categories: [{ name: '操作性', count: Math.ceil(texts.length / 2), gist: '撮影と提出は簡単という声（デモ）' }, { name: '内容', count: Math.floor(texts.length / 2), gist: 'テーマへの興味に関する声（デモ）' }],
      summary: `${texts.length}件の自由記述（デモ分類）`,
      actions: ['撮影のコツを授業冒頭で1分説明する'],
    };
  },
  async worksheet({ companyName }) {
    return {
      title: `${companyName}の仕事から考える「地域の困りごと」`,
      summary: '企業の事業を手がかりに、身近な地域の課題と解決の仕組みを考えます（デモ）。',
      questions: ['この会社がいなくなったら、誰が困るだろう？', 'あなたの地域で同じ困りごとはある？', '自分ならどんな仕組みで解決する？'],
      worksheet: '導入5分：企業紹介動画\n個人ワーク15分：問い1・2を手帳に書く\nグループ20分：解決アイデアを共有\n振り返り10分：手帳に「今日いちばん考えが変わったこと」を書く',
    };
  },
};
