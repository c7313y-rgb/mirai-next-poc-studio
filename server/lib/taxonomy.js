// 関心タグは自由記述にしない（副担任mirAIで集計・マッチングに使えなくなるため統制語彙にする）
// ※副担任mirAI側の分類体系に合わせて10/31までに確定すること（要件定義書 確認事項1）
export const INTEREST_TAGS = [
  'ものづくり・工学', '情報・デジタル', '医療・看護・福祉', '教育・子ども',
  '環境・エネルギー', '食・農業', '地域・まちづくり', '経済・ビジネス',
  '国際・語学', '法律・政治・行政', '芸術・デザイン', 'メディア・エンタメ',
  'スポーツ・健康', '自然科学・研究', '観光・交通', '心理・人間関係',
];

export const RECORD_TYPES = { reflection: '振り返り', theme: 'テーマ記録', experience: '体験記録' };

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter((t) => INTEREST_TAGS.includes(t)))].slice(0, 3);
}
