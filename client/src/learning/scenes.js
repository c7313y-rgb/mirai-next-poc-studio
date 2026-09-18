export const SCENES = {
  company: { src: '/images/enterprise-v2.webp', alt: '企業の技術者と教員が素材を囲んで授業を考える架空のシーン' },
  fieldwork: { src: '/images/fieldwork-v2.webp', alt: '地域の農家と対話する生徒と教員の架空の越境学習シーン' },
  reflection: { src: '/images/reflection-v2.webp', alt: '体験を手帳に書き、自分の次の一歩を考える生徒のイラスト' },
};
export function sceneForTheme(theme) {
  const text = `${theme.title || ''} ${theme.summary || ''} ${theme.field || ''}`;
  if (/食|農|地域|環境|まち/.test(text)) return SCENES.fieldwork;
  if (/工|製造|ロボット|情報|デジタル|技術/.test(text)) return SCENES.company;
  return SCENES.reflection;
}
