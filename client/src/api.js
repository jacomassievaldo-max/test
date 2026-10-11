import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

const readCookie = (n) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.split('=')[1];
api.interceptors.request.use((cfg) => {
  if (cfg.method !== 'get') { const t = readCookie('gv_csrf'); if (t) cfg.headers['X-CSRF-Token'] = t; }
  return cfg;
});

export const errMsg = (e) => e?.response?.data?.error || e?.message || 'Something went wrong';
export default api;

export const money = (cents, opts = {}) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: cents % 100 === 0 && !opts.exact ? 0 : 2 }).format((cents ?? 0) / 100);
export const num = (n) => new Intl.NumberFormat('pt-BR').format(n ?? 0);
export const compact = (n) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0);
export const ago = (d) => {
  const s = Math.max(1, (Date.now() - new Date(d)) / 1000);
  for (const [u, n] of [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]]) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return 'just now';
};
export const STAGE = { CONCEPT: 'Concept', PROTOTYPE: 'Prototype', ALPHA: 'Alpha', BETA: 'Beta', EARLY_ACCESS: 'Early Access', RELEASED: 'Released' };
