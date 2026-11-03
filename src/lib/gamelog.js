// Reading the slate's positional game log (scripts/daily-predict.mjs writes it).
// The first 12 fields are the nba-v1 shape; nba-v2 slates append shooting,
// turnovers and plus-minus, nba-v6 the teammates who sat (field 18), so every
// reader tolerates their absence.
import { seasonOf, isDoubleDouble } from './model.js';

export const LOG_IX = { date: 0, opp: 1, home: 2, starter: 3, min: 4, pts: 5, reb: 6, ast: 7, fg3m: 8, fg3a: 9, stl: 10, blk: 11, fgm: 12, fga: 13, ftm: 14, fta: 15, tov: 16, pm: 17, sat: 18 };

/** His games without teammate `pid` (on tonight's team), oldest first: the last-20
 *  log plus the slate's `wowy.extra` rows, each naming who sat in field 18. */
export function withoutRows(p, pid) {
  const rows = [...(p.wowy?.extra || []), ...(p.log || [])].filter((r) => r[LOG_IX.sat]?.includes(pid));
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
}
export const logVal = (row, stat) => (stat === 'pra' ? row[5] + row[6] + row[7]
  : stat === 'dd' ? isDoubleDouble({ pts: row[LOG_IX.pts], reb: row[LOG_IX.reb], ast: row[LOG_IX.ast], stl: row[LOG_IX.stl], blk: row[LOG_IX.blk] })
  : row[LOG_IX[stat]] ?? null);

/** Over the line in the last `n` games (all games when n is null) → { k, n } or null. */
export function hitRate(log, stat, line, n = null) {
  if (line == null || !log?.length) return null;
  const xs = (n ? log.slice(-n) : log).map((r) => logVal(r, stat)).filter((x) => x != null);
  return xs.length ? { k: xs.filter((x) => x > line).length, n: xs.length } : null;
}

/** The games of the slate's season (by its date), oldest first. */
export const thisSeason = (log, date) => (log || []).filter((r) => seasonOf(r[0]) === seasonOf(date));

/** Hits toward the pick's side: an under hits when the stat stays below the line. */
export const sideRate = (h, side) => (h ? (side === 'under' ? (h.n - h.k) / h.n : h.k / h.n) : null);
export const sideCount = (h, side) => (h ? `${side === 'under' ? h.n - h.k : h.k}/${h.n}` : '—');

export const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
