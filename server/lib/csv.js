// RFC4180 準拠の最小CSVパーサ／ライタ（Excel保存のBOM付きUTF-8に対応）
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
    i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r, idx) => {
    const o = { __line: idx + 2 };
    header.forEach((h, j) => { o[h] = (r[j] ?? '').trim(); });
    return o;
  });
}

const esc = (v) => {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('|') : String(v);
  // CSVインジェクション対策（Excelで数式として解釈させない）
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
};

export function toCsv(columns, rows) {
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return '\uFEFF' + [head, ...body].join('\r\n') + '\r\n';
}
