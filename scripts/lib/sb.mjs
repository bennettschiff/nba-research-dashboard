// Supabase REST (SERVE project, shared with MLB/NFL/WNBA/NHL — 500 MB free plan).
// Retries only the instance being unavailable (5xx/429/408/network) — the same
// policy as the sibling labs. Writes here are upserts, so a retried write that
// actually landed is harmless; pass retry:false for a plain INSERT.
const SUPA = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const haveSupabase = () => Boolean(SUPA && KEY);

export async function sb(path, { method = 'GET', body, prefer, retry = true } = {}) {
  if (!haveSupabase()) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  const waits = retry ? [5000, 15000, 45000] : [];
  for (let attempt = 0; ; attempt++) {
    let res, err;
    try {
      res = await fetch(`${SUPA}/rest/v1/${path}`, {
        method,
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) { err = e; }
    const transient = err || res.status >= 500 || res.status === 429 || res.status === 408;
    if (!transient) {
      const txt = await res.text();
      if (!res.ok) throw new Error(`supabase ${method} ${path.split('?')[0]} → ${res.status} ${txt.slice(0, 300)}`);
      return txt ? JSON.parse(txt) : null;
    }
    if (attempt >= waits.length) throw new Error(`supabase ${method} ${path.split('?')[0]} → ${err ? err.message : res.status}`);
    await sleep(waits[attempt]);
  }
}

/** Page through a select 1,000 rows at a time (PostgREST's cap). */
export async function sbAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const sep = path.includes('?') ? '&' : '?';
    const rows = await sb(`${path}${sep}limit=1000&offset=${from}`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Upsert in chunks (keeps each request well under PostgREST's body limits). */
export async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    await sb(`${table}?on_conflict=${onConflict}`, { method: 'POST', body: rows.slice(i, i + 500), prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}
