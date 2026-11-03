// Shared by /api/results and /api/picks (the leading underscore keeps Vercel from
// routing it). Calls a Postgres function with the publishable key (read-only RLS).
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

export async function rpc(fn, body = {}) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${fn} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
