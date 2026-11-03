// /api/picks — the Results tab's pick list, CDN-cached like /api/results.
//   ?tier=official|qualifying   the whole season (~15 gate plays a night)
//   ?tier=all&date=YYYY-MM-DD   ONE day of every priced lean (~700 rows, ~20 KB
//                               gzipped); no date → the latest day in the ledger
// A handful of distinct URLs, each cached 30 minutes: the ledger only moves when
// the pipeline grades or freezes a slate. Only the Results tab asks.
import { rpc } from './_rpc.js';

const TIERS = { official: 'official', qualifying: 'qualifying', all: 'all priced' };

export default async function handler(req, res) {
  const q = req.query || {};
  const tier = TIERS[q.tier] || 'qualifying';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : null;
  try {
    const out = await rpc('nba_pick_list', { p_tier: tier, p_date: date });
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: String(e.message || e) });
  }
}
