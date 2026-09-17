import { q, parseJson } from './db.js';

// KPI目標値は要件定義書 v0.1 の「案」。10/31 の甲乙確定後に運営画面から変更する。
export const DEFAULT_SETTINGS = {
  poc_start: '2026-12-01',
  poc_end: '2027-03-31',
  // 冬休み等、週次アクティブ率(K-S2)の分母から除外する期間
  excluded_periods: [{ from: '2026-12-26', to: '2027-01-07', label: '冬休み' }],
  inactive_days: 14,
  voice_min_records: 5,       // 企業向け匿名要約を作る最小件数
  school_min_cell: 5,         // 企業レポートで学校別数値を出す最小閲覧者数
  company_show_school_names: false, // 企業に学校名を見せるか（学校の同意取得後に true）
  kpi_targets: {
    'K-S1': 3, 'K-S2': 0.5, 'K-S3': 0.6, 'K-S4': 0.8, 'K-S5': 4.0,
    'K-S6_rate': 0.6, 'K-S6_avg': 3.5,
    'K-C1': 5, 'K-C2': 5, 'K-C3': 0.3, 'K-C4': 0.6,
    'K-X1': 20, 'K-X2': 1.0,
  },
};

export function getSettings() {
  const rows = q.all('SELECT key, value FROM settings');
  const s = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) s[r.key] = parseJson(r.value, s[r.key]);
  s.kpi_targets = { ...DEFAULT_SETTINGS.kpi_targets, ...(s.kpi_targets || {}) };
  return s;
}

export function saveSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('設定の形式が正しくありません');
  for (const key of ['school_min_cell', 'voice_min_records']) {
    if (key in patch && (!Number.isInteger(patch[key]) || patch[key] < 3 || patch[key] > 50)) throw new Error('匿名集計の最少人数は3〜50の整数で指定してください');
  }
  if ('inactive_days' in patch && (!Number.isInteger(patch.inactive_days) || patch.inactive_days < 1 || patch.inactive_days > 365)) throw new Error('未提出の確認日数は1〜365で指定してください');
  if ('company_show_school_names' in patch && typeof patch.company_show_school_names !== 'boolean') throw new Error('学校名公開の設定形式が正しくありません');
  const allowed = Object.keys(DEFAULT_SETTINGS);
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) continue;
    q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v));
  }
  return getSettings();
}
