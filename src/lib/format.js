// Formatting only — no model math (that is src/lib/model.js).
export const pct = (p, d = 0) => (p == null || !Number.isFinite(p) ? '—' : `${(100 * p).toFixed(d)}%`);
export const pct1 = (p) => pct(p, 1);
export const am = (a) => (a == null ? '—' : a > 0 ? `+${a}` : `${a}`);
export const num = (x, d = 1) => (x == null || !Number.isFinite(+x) ? '—' : (+x).toFixed(d));
export const signed = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '—' : `${x >= 0 ? '+' : ''}${(+x).toFixed(d)}`);
export const units = (u) => (u == null ? '—' : `${u >= 0 ? '+' : ''}${(+u).toFixed(2)}u`);
export const tipTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
export const shortDate = (iso) => { const [, m, d] = String(iso).split('-'); return `${+m}/${+d}`; };
export const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
