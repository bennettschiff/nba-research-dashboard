// Ledger reading — labels, records and the pick-list row shape shared by the
// Results tab, the Plays tab and the board. No model math (src/lib/model.js) and
// no pricing (src/lib/markets.js): this only reads what the ledger froze.
import { PROPS, STAT_LABEL, ONE_SIDED } from './model.js';
import { BOOK_LABEL } from './markets.js';

export const GAME_MARKETS = ['spread', 'total', 'ml'];
export const MARKETS = [...PROPS, ...GAME_MARKETS];
export const MARKET_LABEL = { ...STAT_LABEL, spread: 'Spread', total: 'Total', ml: 'Moneyline' };
// The board's order (threes first — the house favorite) and its column labels.
export const PROP_ORDER = ['fg3m', 'pts', 'reb', 'ast', 'pra', 'stl', 'blk', 'dd'];
export const MARKET_SHORT = { pts: 'PTS', reb: 'REB', ast: 'AST', fg3m: '3PM', pra: 'PRA', stl: 'STL', blk: 'BLK', dd: 'DD', spread: 'Spread', total: 'Total', ml: 'ML' };
export const BOOKS = Object.keys(BOOK_LABEL);
export const SIDES = ['over', 'under', 'home', 'away'];
export const SIDE_LABEL = { over: 'Over', under: 'Under', home: 'Home', away: 'Away' };

// The records the page shows, narrowest first. `api` is /api/picks?tier=. Every
// gate play is official (model.js gateVerdict), so the ledger's `qualifying`
// record is the same rows and gets no pill of its own.
export const RECS = [
  { key: 'official', api: 'official', label: '★ Official', title: 'The card: every row that cleared the gate' },
  { key: 'all priced', api: 'all', label: 'Every priced lean', title: 'Every priced row, the bet-every-lean baseline (one day at a time in the list)' },
];
export const MIN_N = 25; // below this a rate prints uncolored, tagged "early"; units always color

const EMPTY = { n: 0, w: 0, l: 0, p: 0, units: 0 };
/** Win-loss-push, units, hit (pushes out) and ROI (per row, pushes in) — the SQL's definitions. */
export function record(r) {
  const x = { ...EMPTY, ...(r || {}) };
  const units = Number(x.units) || 0;
  return { n: x.n, w: x.w, l: x.l, p: x.p, units, hit: x.w + x.l ? x.w / (x.w + x.l) : null, roi: x.n ? units / x.n : null };
}
export function addRec(a, b) {
  return { n: a.n + b.n, w: a.w + b.w, l: a.l + b.l, p: a.p + b.p, units: a.units + Number(b.units || 0) };
}
/** Positional SQL rows ([.., n, w, l, p, units]) → record. */
export const recOf = (arr, at) => record({ n: arr[at], w: arr[at + 1], l: arr[at + 2], p: arr[at + 3], units: arr[at + 4] });
export const recStr = (r) => (r.n ? `${r.w}-${r.l}${r.p ? `-${r.p}` : ''}` : '—');

/** /api/picks rows are positional under `cols`. */
export function decodePicks(out) {
  if (!out?.cols || !out.rows) return [];
  return out.rows.map((a) => Object.fromEntries(out.cols.map((c, i) => [c, a[i]])));
}

/**
 * Does the pick agree with the model's own projection? The side is where the
 * model disagrees with the MARKET (pricePlayerStat), so the model can take an
 * over it gives under 50% when the market's mean is lower still (Cunningham 3s).
 * Those rows are tagged, not removed — the tag the NFL lab's card carries.
 *
 * Judged on the model's P(side), not mean vs line: counts are skewed, so a
 * blocks mean of 0.6 still makes "under 0.5" a >50% call (P(0) ≈ 0.55).
 */
export const agreesWithProj = ({ prob, stat }) => ONE_SIDED.has(stat) || prob == null || Number(prob) >= 0.5;

/**
 * The board's Diff: projection − line. A one-sided Yes has no line to be past,
 * so its diff is the model's P(Yes) − the posted price's P, as a fraction
 * (shown in points). row = { stat, proj, line, m }.
 */
export function projDiff({ stat, proj, line, m }) {
  if (ONE_SIDED.has(stat)) return m?.pModel != null && m?.fairSide != null ? m.pModel - m.fairSide : null;
  return line != null && proj != null ? proj - line : null;
}

/** "Over 24.5 Points", "LAL −6.5", "WAS ML". */
export function betLabel(r) {
  const L = Number(r.line);
  if (r.stat === 'ml') return `${r.side === 'home' ? r.team : r.opp} ML`;
  if (r.stat === 'spread') return `${r.side === 'home' ? r.team : r.opp} ${L > 0 ? '+' : ''}${L}`;
  if (ONE_SIDED.has(r.stat)) return `${MARKET_LABEL[r.stat]} Yes`;
  return `${SIDE_LABEL[r.side] || r.side} ${L} ${MARKET_LABEL[r.stat] || r.stat}`;
}

export const outcomeOf = (r) => r.outcome || 'open';
