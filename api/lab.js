// /api/lab — the header's status line and its Model Refresh button.
// GET  → lab_status('nba'): Odds API credits (the shared key, and this lab's spend
//        today / this month), the last odds pull and model run, and the schedule
//        the page works out "next" from. CDN-cached a minute, so every open board
//        collapses to about one SERVE call a minute (request COUNT is what the org
//        got throttled on — see api/results.js). `?t=` busts it; only a page that
//        just started a refresh sends one.
// POST {password} → lab_refresh('nba', password): the password check, the
//        10-minute throttle and the workflow dispatch all live in Postgres
//        (db/lab_header.sql in the NFL repo), so nothing secret is here.
import { rpc } from './_rpc.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const out = await rpc('lab_refresh', { p_lab: 'nba', p_password: String(body.password ?? '') });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(out);
    }
    const out = await rpc('lab_status', { p_lab: 'nba' });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: String(e.message || e) });
  }
}
