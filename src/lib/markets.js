// Odds API responses → the consensus market each prop and game line is priced
// against. Pure; shared by daily-predict (what gets frozen into the ledger) and
// the board (the book-by-book cells), so both read the same number.
import { devig, PARAMS, ONE_SIDED } from './model.js';
import { normName } from './names.js';
import { betslipUrl } from './betslip.js';

export const MARKET_KEYS = {
  player_points: 'pts', player_rebounds: 'reb', player_assists: 'ast', player_threes: 'fg3m',
  player_points_rebounds_assists: 'pra', player_steals: 'stl', player_blocks: 'blk',
  // Yes / No with no point: read as over / under 0.5 (model.js ONE_SIDED — the
  // books post only the Yes)
  player_double_double: 'dd',
};
// The three books every row shows, in this order — the house board (FanDuel,
// DraftKings, Hard Rock), so price columns never move between markets. They are
// also the ONLY books read (nba-v5): the consensus, the best price and the gate
// all come from books the card can be bet at. BOOK_LABEL keeps the others so
// ledger rows from before nba-v5 still read.
export const BOOK_PREF = ['fanduel', 'draftkings', 'hardrockbet'];
const BOOK_SET = new Set(BOOK_PREF);
export const BOOK_LABEL = { fanduel: 'FD', hardrockbet: 'HR', draftkings: 'DK', fanatics: 'FAN', betmgm: 'MGM', williamhill_us: 'CZR', espnbet: 'ESPN', betrivers: 'BR' };

const mode = (xs) => { const c = new Map(); for (const x of xs) c.set(x, (c.get(x) || 0) + 1); let b = null, n = -1; for (const [x, k] of c) if (k > n || (k === n && x < b)) { b = x; n = k; } return b; };

/**
 * Latest quote per event across the day's snapshots, plus the first (the open).
 * → Map<eventId, { latest, open, at, openAt }>
 */
export function latestByEvent(store) {
  const out = new Map();
  for (const s of store?.snapshots || []) {
    for (const e of s.events) {
      const cur = out.get(e.id);
      if (!cur) out.set(e.id, { latest: e, open: e, at: s.at, openAt: s.at });
      else { cur.latest = e; cur.at = s.at; }
    }
  }
  return out;
}

/**
 * One event → { props: Map<"normName|stat", market>, game: { spread, total, ml } }.
 * market = { player, stat, line, fairOver, overAm, underAm, overBook, underBook, books: {key:{line,over,under,overUrl,underUrl}}, nBooks }
 */
export function parseEvent(ev, P = PARAMS) {
  const raw = new Map(); // key → book → {line, over, under}
  const game = { spreads: [], totals: [], h2h: [] };
  for (const bk of ev?.bookmakers || []) {
    if (!BOOK_SET.has(bk.key)) continue; // snapshots before nba-v5 carry 8 books
    for (const mk of bk.markets || []) {
      const stat = MARKET_KEYS[mk.key];
      if (stat) {
        for (const o of mk.outcomes || []) {
          const k = `${normName(o.description)}|${stat}`;
          const byBook = raw.get(k) || raw.set(k, { player: o.description, stat, books: {} }).get(k);
          // a book can list several lines for one player; keep each by line
          const bl = (byBook.books[bk.key] ||= {});
          const pt = o.point ?? 0.5; // a Yes/No market carries no point
          const q = (bl[pt] ||= { line: pt });
          // the outcome's own bet-slip link (pulled with includeLinks/includeSids)
          const url = betslipUrl(bk.key, { link: o.link, sid: o.sid });
          if (/^(over|yes)$/i.test(o.name)) { q.over = o.price; if (url) q.overUrl = url; } else if (/^(under|no)$/i.test(o.name)) { q.under = o.price; if (url) q.underUrl = url; }
        }
      } else if (mk.key === 'spreads') {
        for (const o of mk.outcomes) game.spreads.push({ book: bk.key, team: o.name, point: o.point, price: o.price });
      } else if (mk.key === 'totals') {
        for (const o of mk.outcomes) game.totals.push({ book: bk.key, side: o.name, point: o.point, price: o.price });
      } else if (mk.key === 'h2h') {
        for (const o of mk.outcomes) game.h2h.push({ book: bk.key, team: o.name, price: o.price });
      }
    }
  }
  const props = new Map();
  for (const [k, { player, stat, books }] of raw) props.set(k, consensus(player, stat, books, P));
  return { props, game };
}

function consensus(player, stat, books, P = PARAMS) {
  // the main line is the one most books post with BOTH sides
  const twoSided = [];
  for (const lines of Object.values(books)) for (const q of Object.values(lines)) if (q.over != null && q.under != null) twoSided.push(q.line);
  const line = twoSided.length ? mode(twoSided) : mode(Object.values(books).flatMap((l) => Object.keys(l).map(Number)));
  let fs = 0, fn = 0, overAm = null, underAm = null, overBook = null, underBook = null; const at = {};
  for (const [book, lines] of Object.entries(books)) {
    const q = lines[line]; if (!q) continue;
    at[book] = { line, over: q.over ?? null, under: q.under ?? null, overUrl: q.overUrl ?? null, underUrl: q.underUrl ?? null };
    if (q.over != null && q.under != null) { fs += devig(q.over, q.under, P); fn++; }
    if (q.over != null && (overAm == null || q.over > overAm)) { overAm = q.over; overBook = book; }
    if (q.under != null && (underAm == null || q.under > underAm)) { underAm = q.under; underBook = book; }
  }
  // a book's OTHER lines for this player — the alt ladder the panel prices
  const ladder = {};
  for (const lines of Object.values(books)) for (const q of Object.values(lines)) {
    const L = (ladder[q.line] ||= { line: q.line, over: null, under: null });
    if (q.over != null && (L.over == null || q.over > L.over)) L.over = q.over;
    if (q.under != null && (L.under == null || q.under > L.under)) L.under = q.under;
  }
  // a one-sided market has no two-sided book: count the books posting the Yes
  const nBooks = ONE_SIDED.has(stat) ? Object.values(at).filter((q) => q.over != null).length : fn;
  return { player, stat, line, fairOver: fn ? +(fs / fn).toFixed(4) : null, overAm, underAm, overBook, underBook, books: at, nBooks,
    ladder: Object.values(ladder).sort((a, b) => a.line - b.line) };
}

/** Game lines in the HOME team's terms. homeName/awayName are the Odds API full names. */
export function gameConsensus(game, homeName, awayName, P = PARAMS) {
  const sp = game.spreads.filter((o) => o.team === homeName);
  const spLine = sp.length ? mode(sp.map((o) => o.point)) : null;
  const pair = (side, other, rows, keyOf) => {
    let s = 0, n = 0, best = null, bestBook = null;
    for (const r of rows.filter((o) => keyOf(o) === side)) {
      const opp = rows.find((o) => o.book === r.book && keyOf(o) === other);
      if (opp) { s += devig(r.price, opp.price, P); n++; }
      if (best == null || r.price > best) { best = r.price; bestBook = r.book; }
    }
    return { fair: n ? s / n : null, best, bestBook };
  };
  const spRows = game.spreads.filter((o) => (o.team === homeName && o.point === spLine) || (o.team === awayName && o.point === -spLine));
  const h = pair(homeName, awayName, spRows, (o) => o.team), a = pair(awayName, homeName, spRows, (o) => o.team);
  const tot = game.totals.length ? mode(game.totals.filter((o) => o.side === 'Over').map((o) => o.point)) : null;
  const tRows = game.totals.filter((o) => o.point === tot);
  const ov = pair('Over', 'Under', tRows, (o) => o.side), un = pair('Under', 'Over', tRows, (o) => o.side);
  const mh = pair(homeName, awayName, game.h2h, (o) => o.team), ma = pair(awayName, homeName, game.h2h, (o) => o.team);
  return {
    spread: spLine != null ? { line: spLine, fairHome: h.fair, homeAm: h.best, awayAm: a.best, homeBook: h.bestBook, awayBook: a.bestBook } : null,
    total: tot != null ? { line: tot, fairOver: ov.fair, overAm: ov.best, underAm: un.best, overBook: ov.bestBook, underBook: un.bestBook } : null,
    ml: game.h2h.length ? { fairHome: mh.fair, homeAm: mh.best, awayAm: ma.best, homeBook: mh.bestBook, awayBook: ma.bestBook } : null,
  };
}
