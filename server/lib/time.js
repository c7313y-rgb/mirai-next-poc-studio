// すべての日付判定は日本時間（学校の授業日）で行う
const TZ = 'Asia/Tokyo';

export function jstDate(d = new Date()) {
  return new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(dateStr, -dow);
}
// JSTの日付範囲 [from, to] をUTCのISO範囲 [start, endExclusive) に変換
export function jstRangeToUtc(from, to) {
  const start = new Date(from + 'T00:00:00+09:00').toISOString();
  const end = new Date(addDays(to, 1) + 'T00:00:00+09:00').toISOString();
  return [start, end];
}
export const minDate = (...ds) => ds.filter(Boolean).sort()[0];
export const maxDate = (...ds) => ds.filter(Boolean).sort().at(-1);
