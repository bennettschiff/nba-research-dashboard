// /api/results — the Results tab and the credits badge in ONE CDN-cached call.
// nba_results() aggregates the ledger inside Postgres (~10-30 KB however long the
// season gets), so page views never pull ledger rows: the SchiffPicks org blew
// the free plan's egress on 2026-09-05 on request COUNT, and this collapses it to
// roughly one origin hit per half hour.
import { rpc } from './_rpc.js';

export default async function handler(req, res) {
  try {
    const [results, credits] = await Promise.all([rpc('nba_results'), rpc('odds_credit_status').catch(() => null)]);
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({ ...results, credits });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: String(e.message || e) });
  }
}
