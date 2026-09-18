import { parseJson } from '../db.js';
import { INTEREST_TAGS } from './taxonomy.js';

const WORDS = {
  'ものづくり・工学': /ロボット|機械|工場|製造|設計|工学|ものづくり/,
  '情報・デジタル': /AI|データ|情報|デジタル|プログラム|アプリ/i,
  '医療・看護・福祉': /医療|看護|福祉|介護|病院/,
  '教育・子ども': /教育|子ども|学び|手帳|学習/,
  '環境・エネルギー': /環境|エネルギー|資源|再生|廃棄|リサイクル|持続可能|脱炭素/,
  '食・農業': /食|農|野菜|米|栽培/,
  '地域・まちづくり': /地域|まち|町|地方|商店街/,
  '経済・ビジネス': /経済|商品|販売|経営|起業|金融|ビジネス/,
  '国際・語学': /国際|語学|海外|外国|英語/,
  '法律・政治・行政': /法律|政治|行政|自治体/,
  '芸術・デザイン': /芸術|デザイン|美術|音楽|造形/,
  'メディア・エンタメ': /メディア|映画|映像|動画|アニメ/,
  'スポーツ・健康': /スポーツ|健康|運動|競技/,
  '自然科学・研究': /科学|研究|実験|生物|宇宙|化学/,
  '観光・交通': /観光|交通|旅行|鉄道|ホテル|物流/,
  '心理・人間関係': /心理|対話|人間関係|気持ち|コミュニケーション/,
};

// Only the requesting student's submitted tags and class-distributed themes are supplied.
// No profiling of ability, sensitive text matching, or external model calls.
export function recommendThemes(themes, records) {
  const counts = new Map();
  for (const rec of records) {
    const parsed = Array.isArray(rec.tags) ? rec.tags : parseJson(rec.tags, []);
    const tags = Array.isArray(parsed) ? parsed : [];
    for (const tag of new Set(tags.filter(t => INTEREST_TAGS.includes(t)))) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  const ranked = themes.map((theme, index) => {
    const source = `${theme.title} ${theme.summary} ${theme.field || ''} ${theme.companyIndustry || ''}`;
    const matches = [...counts].filter(([tag]) => WORDS[tag]?.test(source)).sort((a,b) => b[1]-a[1]);
    return {...theme, matchTags: matches.map(([tag,count]) => ({tag,count})), matchScore: matches.reduce((n,[,count])=>n+count,0), originalIndex:index};
  }).sort((a,b)=>b.matchScore-a.matchScore || a.originalIndex-b.originalIndex)
    .map(({originalIndex,...theme})=>theme);
  return { themes: ranked, basisRecordCount: records.length,
    method: 'interest-tag-rules/v1',
    note: '自分の提出記録にある関心タグと、配信されたテーマの内容を照合した候補です。能力・職業適性の判定ではありません。違う分野も自由に選べます。' };
}
