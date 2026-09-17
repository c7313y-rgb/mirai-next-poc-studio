import { useEffect, useState } from 'react';

// ハッシュルーティング（QRログインのトークンをサーバーログやRefererに残さないため）
export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => { setHash(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const [path, query = ''] = hash.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(query)) };
}

export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export const go = (to) => { window.location.hash = to; };

export function Link({ to, className, children, ...rest }) {
  return <a href={'#' + to} className={className} {...rest}>{children}</a>;
}
