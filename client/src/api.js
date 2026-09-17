export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

async function request(method, url, body, { form } = {}) {
  const headers = { 'x-requested-with': 'mirai-next' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch('/api' + url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError('通信できませんでした。ネットワーク接続を確認してください', 0);
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401 && !url.startsWith('/auth')) {
    window.dispatchEvent(new CustomEvent('mn:unauthorized'));
  }
  if (!res.ok) throw new ApiError(data?.error || `エラーが発生しました（${res.status}）`, res.status, data);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b, o) => request('POST', u, b, o),
  put: (u, b) => request('PUT', u, b),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
};

export const pct = (v, d = 0) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`);
export const num = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));
export const dateJa = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' }) : '—');
export const dateTimeJa = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const todayJst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const TYPE_LABEL = { reflection: '振り返り', theme: 'テーマ記録', experience: '体験記録' };
