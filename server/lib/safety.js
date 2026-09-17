// 要確認アラートの補助判定。AI判定と OR で使う「取りこぼし防止用の安全網」。
// 検知を保証するものではない（要件定義書5.1）。語彙は学校・NOLTYと協議して更新すること。
const CONCERN_PATTERNS = [
  { re: /死にたい|しにたい|消えたい|きえたい|いなくなりたい|生きてる意味|自殺|じさつ/, reason: '希死念慮を示す可能性のある記述' },
  { re: /リスカ|自傷|切りたい/, reason: '自傷を示す可能性のある記述' },
  { re: /いじめ|イジメ|無視され|仲間はずれ|悪口を言われ/, reason: 'いじめ・対人トラブルを示す可能性のある記述' },
  { re: /殴られ|叩かれ|暴力|虐待/, reason: '暴力被害を示す可能性のある記述' },
  { re: /眠れない|ねむれない|食べられない|学校に行きたくない|行きたくない|つらい|辛い|しんどい|助けて/, reason: '心身の不調・困りごとを示す可能性のある記述' },
];

export function keywordConcern(text) {
  const t = String(text || '');
  for (const p of CONCERN_PATTERNS) if (p.re.test(t)) return { flag: true, reason: p.reason };
  return { flag: false, reason: null };
}

// 企業向け要約の出力前フィルタ（AI指示に加えた二重化）。完全ではないため運営の承認を必須にしている。
export function scrubPii(text, extraTerms = []) {
  let s = String(text || '');
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '［メール］');
  s = s.replace(/0\d{1,4}-?\d{1,4}-?\d{3,4}/g, '［電話番号］');
  s = s.replace(/[一-龥ぁ-んァ-ヶ]{1,6}(さん|くん|君|ちゃん|先生)/g, '［人物］');
  for (const term of extraTerms.filter(Boolean)) s = s.split(term).join('［学校］');
  return s;
}
