// ── NBA pricing model (public reference implementation) ─────────────────────
//
// The production projection engine (minutes allocation, injury and teammate
// on/off adjustments, opponent and pace context, team ratings) and its fitted
// parameters are private, and so is the nightly job that runs it. What stays
// here is the part the UI needs to price a projection against a market:
//
//   law       negative binomial per stat (var = mu + mu^2 / k)
//   no-vig    Shin's method for two-way prices
//   ladder    EV at every alternate line, with an estimated price where the
//             book posts none
//   gates     which priced rows qualify as plays (gates.json)
//
// Every number in PARAMS is illustrative, not fitted.
import GATE_FILE from './gates.json' with { type: 'json' };

export const MODEL_VERSION = 'nba-public-1';

export const STATS = ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'pra'];
// Every prop market: the counting stats plus the double-double, a joint market
// priced from them (probDoubleDouble) with no mean of its own.
export const PROPS = [...STATS, 'dd'];
export const STAT_LABEL = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', fg3m: '3-Pointers', stl: 'Steals', blk: 'Blocks', pra: 'PRA', dd: 'Double-Double' };

// Every number the backtest may move. `node scripts/backtest.mjs --fit` refits
// them; docs/BACKTEST.md records what each one is worth.
export const PARAMS = {
  // recency half-lives, in games
  HL_MIN: 5, HL_PTS: 15, HL_REB: 30, HL_AST: 20, HL_STL: 40, HL_BLK: 40, HL_FG3A: 20, HL_FG3P: 200, HL_TOV: 30, HL_USG: 20,
  HL_TEAM: 20, OFFSEASON_GAMES: 20,
  K_FG3P: 100,                 // pseudo-attempts toward the league 3P%
  // minutes prior and team squeeze
  MIN_PRIOR_GAMES: 3, MIN_HL_SLOW: 30, MIN_EARLY_K: 2, DARKO_EARLY_GP: 3,
  MIN_SCALE: [0.85, 1.15], MIN_TARGET: 30, MIN_REG: 0.1, MIN_KEEP: 40,
  // teammate on/off
  USG_K: 0.25, WOWY_GAMES: 100, WOWY_K: 10, WOWY_MIN: 0.25,
  // pricing
  NB_K: { pts: 10, reb: 30, ast: 20, fg3m: 20, stl: 20, blk: 15, pra: 20 },
  MIN_SIM: null,               // production prices a minutes mixture; public build uses the plain NB
  TRUST: 0.5,                  // weight on the model vs. the market's implied mean
  DEVIG: 'shin',
  DD_RHO: 0,
  // game lines
  HCA: 2.5, SIGMA_MARGIN: 13.5, SIGMA_TOTAL: 18,
};

export const LEAGUE = { fg3p: 0.358, pace: 99.5, ortg: 114.5 };
export const posGroup = (pos) => { const p = String(pos || '').toUpperCase(); return p.startsWith('C') || p === 'F-C' ? 'C' : p.startsWith('G') ? 'G' : 'F'; };

// ── primitives ───────────────────────────────────────────────────────────────
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const decay = (hl) => Math.pow(0.5, 1 / hl);

/**
 * Exponential weights over a chronological list of games, newest = 1.
 * A season boundary adds OFFSEASON_GAMES of extra fading.
 */
export function ageWeights(games, hl, P = PARAMS) {
  const n = games.length; const w = new Array(n); const d = decay(hl);
  let age = 0;
  for (let i = n - 1; i >= 0; i--) {
    w[i] = Math.pow(d, age);
    const prev = games[i - 1];
    age += 1 + (prev && seasonOf(prev.date) !== seasonOf(games[i].date) ? P.OFFSEASON_GAMES : 0);
  }
  return w;
}
export const seasonOf = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? y : y - 1; };

// ── distributions ────────────────────────────────────────────────────────────
function lgamma(x) { // Lanczos
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1; let a = c[0]; const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/** NB pmf with mean mu and size k (var = mu + mu²/k). */
export function nbPmf(x, mu, k) {
  if (mu <= 0) return x === 0 ? 1 : 0;
  const p = k / (k + mu);
  return Math.exp(lgamma(x + k) - lgamma(k) - lgamma(x + 1) + k * Math.log(p) + x * Math.log(1 - p));
}
/**
 * P(X < n) and P(X = n) in one pass, by the pmf recurrence
 *   p(0) = (k/(k+μ))^k,  p(x+1) = p(x) · (x+k)/(x+1) · μ/(k+μ)
 * — no lgamma per term, which matters because the minutes mixture evaluates
 * this once per node per bisection step.
 */
function nbAt(n, mu, k) {
  if (!(mu > 0)) return [n > 0 ? 1 : 0, n === 0 ? 1 : 0];
  const r = mu / (k + mu);
  let p = Math.exp(k * Math.log(k / (k + mu))), c = 0;
  for (let x = 0; x < n; x++) { c += p; p *= ((x + k) / (x + 1)) * r; }
  return [c, p];
}
/** P(X ≥ n). */
export function nbTail(n, mu, k) {
  if (n <= 0) return 1;
  return clamp(1 - nbAt(n, mu, k)[0], 0, 1);
}

// ── minutes mixture hook ────────────────────────────────────────────────────
// Production prices each stat as a mixture over the player's minutes
// distribution. PARAMS.MIN_SIM is null here, so every caller gets the plain NB.
export function minuteNodes(min, P = PARAMS) {
  const S = P.MIN_SIM;
  if (!S?.q?.length || !(min > 0)) return null;
  const at = S.at;
  let i = 0; while (i < at.length - 2 && min > at[i + 1]) i++;
  const t = clamp((min - at[i]) / (at[i + 1] - at[i]), 0, 1);  // flat outside the anchors
  return S.q[i].map((a, j) => a + t * (S.q[i + 1][j] - a));
}
/** [P(X < n), P(X = n)] for one stat at projected minutes `min`. */
function statAt(n, mu, stat, P = PARAMS, min = null) {
  const k = P.NB_K[stat] ?? 10;
  const q = minuteNodes(min, P);
  if (!q) return nbAt(n, mu, k);
  let c = 0, p = 0;
  for (const s of q) { const [ci, pi] = nbAt(n, mu * s, k); c += ci; p += pi; }
  return [c / q.length, p / q.length];
}
/** P(X = x) under the stat's law. */
export function statPmf(x, mu, stat, P = PARAMS, min = null) { return statAt(x, mu, stat, P, min)[1]; }
/** P(X < n) under the stat's law. */
export function statBelow(n, mu, stat, P = PARAMS, min = null) { return statAt(n, mu, stat, P, min)[0]; }
export function normalCdf(z) { const s = z < 0 ? -1 : 1; const x = Math.abs(z) / Math.SQRT2; const t = 1 / (1 + 0.3275911 * x); const y = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x); return (1 + s * y) / 2; }

/**
 * Over/under/push probabilities for a stat at a line. Half lines cannot push;
 * on an integer line the over needs line+1 and exactly `line` pushes (books
 * refund it), so the three always sum to 1.
 *
 * `min` is the projected minutes: pass it and the law is the minutes mixture
 * (minuteNodes); leave it out and it is the plain negative binomial.
 */
export function probLine(mu, line, stat, P = PARAMS, min = null) {
  if (!(mu > 0)) return { over: 0, under: 1, push: 0 };
  if (Number.isInteger(line)) {
    const [below, push] = statAt(line, mu, stat, P, min);
    return { over: clamp(1 - below - push, 0, 1), under: clamp(below, 0, 1), push };
  }
  const over = clamp(1 - statBelow(Math.floor(line) + 1, mu, stat, P, min), 0, 1);
  return { over, under: 1 - over, push: 0 };
}

/**
 * The mean the market implies: the μ whose P(over line) equals the no-vig price.
 * Inverted through the SAME law the model is priced with (pass the same `min`),
 * or `score = ln(μ_model/μ_market)` compares two different distributions.
 */
export function impliedMean(line, pOverFair, stat, P = PARAMS, min = null) {
  let lo = 0.01, hi = Math.max(4, line * 4);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const p = probLine(mid, line, stat, P, min); const pv = p.over / Math.max(1e-9, p.over + p.under);
    if (pv < pOverFair) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── odds ─────────────────────────────────────────────────────────────────────
export const amToDec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
export const amToProb = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100));
export const probToAm = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p));
/**
 * Shin's no-vig for a two-outcome market, exact closed form.
 *
 * Shin (1993) models the overround as a bookmaker's defence against insiders,
 * which makes the vig fall unevenly across the two sides rather than
 * proportionally — so `a/(a+b)` systematically misreads the longshot. For n = 2
 * the insider share z solves in closed form, no iteration:
 *
 *   z = (π₊ − 1)(π₋² − π₊) / (π₊(π₋² − 1)),   π₊ = π₁+π₂,  π₋ = π₁−π₂
 *   p_i = [√(z² + 4(1−z)·π_i²/π₊) − z] / (2(1−z))
 *
 * Falls back to multiplicative where the closed form is undefined or degenerate
 * (no overround, a one-sided market, |π₋| → 1).
 */
export function shinDevig(overAm, underAm) {
  const a = amToProb(overAm), b = amToProb(underAm);
  const sum = a + b;
  const z = shinZ(overAm, underAm);
  if (z == null) return a / sum;
  const p = (pi) => (Math.sqrt(z * z + 4 * (1 - z) * (pi * pi) / sum) - z) / (2 * (1 - z));
  const po = p(a);
  return po > 0 && po < 1 ? po : a / sum;
}
/** Shin's insider share z for a two-way price (null: no overround, or degenerate). */
export function shinZ(overAm, underAm) {
  const a = amToProb(overAm), b = amToProb(underAm);
  const sum = a + b, dif = a - b;
  if (!(sum > 1)) return null;
  const den = sum * (dif * dif - 1);
  if (!(Math.abs(den) > 1e-12)) return null;
  const z = ((sum - 1) * (dif * dif - sum)) / den;
  return z > 0 && z < 1 ? z : null;
}
/**
 * shinDevig run forwards: the price a book quotes for a side whose fair
 * probability is p, at insider share z — π = √(z·p + (1−z)·p²) · Σ√(…) over both
 * sides. The vig lands on the longshot, which is what shinDevig takes back off.
 */
export function shinVig(p, z) {
  const f = (x) => Math.sqrt(z * x + (1 - z) * x * x);
  return f(p) * (f(p) + f(1 - p));
}
/**
 * Two-sided no-vig. PARAMS.DEVIG picks the method; every consumer (markets.js's
 * per-book consensus, the game lines) goes through here, so the board, the
 * ledger and the backtest can never disagree about what "fair" means.
 */
export const devig = (overAm, underAm, P = PARAMS) => {
  if (P.DEVIG === 'shin') return shinDevig(overAm, underAm);
  const a = amToProb(overAm), b = amToProb(underAm);
  return a / (a + b);
};
/** EV per 1u staked at american price `am`, given win/push probability. */
export const evAt = (am, pWin, pPush = 0) => pWin * (amToDec(am) - 1) - (1 - pWin - pPush);

// ── game lines ───────────────────────────────────────────────────────────────
/** Price the game markets. spread is the HOME line (e.g. -5.5). */
export function priceGame(g, { spread, total } = {}, P = PARAMS) {
  const out = {};
  if (spread != null) { const pCover = normalCdf((g.margin + spread) / P.SIGMA_MARGIN); out.spread = { line: spread, pHome: pCover, pAway: 1 - pCover }; }
  if (total != null) { const pO = normalCdf((g.total - total) / P.SIGMA_TOTAL); out.total = { line: total, pOver: pO, pUnder: 1 - pO }; }
  out.ml = { pHome: normalCdf(g.margin / P.SIGMA_MARGIN), pAway: 1 - normalCdf(g.margin / P.SIGMA_MARGIN) };
  return out;
}

// ── pricing a prop against the market ────────────────────────────────────────
/**
 * The verdict for one player-stat against a consensus market.
 * market = { line, overAm, underAm (best prices), fairOver (no-vig consensus P(over)) }
 * → side, model prob of the side, EV at the best price, and the SCORE that gates
 *   use: ln(μ_model / μ_market) signed toward the side (score space, never prob).
 */
export function pricePlayerStat(mu, stat, market, P = PARAMS, min = null) {
  if (!(mu > 0) || !market || market.line == null) return null;
  const pr = probLine(mu, market.line, stat, P, min);
  const muMkt = market.fairOver != null ? impliedMean(market.line, market.fairOver, stat, P, min) : null;
  // The side is where the model DISAGREES with the market, not where the model
  // sits vs 50%: model 51% over against a 61% no-vig over is an UNDER lean (the
  // opening-night Cunningham 3s row). Without a two-sided market, the model's own
  // favorite.
  const pOverN = pr.over / Math.max(1e-9, pr.over + pr.under);
  const side = market.fairOver != null ? (pOverN >= market.fairOver ? 'over' : 'under') : (pr.over >= pr.under ? 'over' : 'under');
  const am = side === 'over' ? market.overAm : market.underAm;
  const score = muMkt ? (side === 'over' ? 1 : -1) * Math.log(mu / muMkt) : null;
  // The price is taken at the market-anchored mean (TRUST); pModel keeps the
  // model's own probability for the "vs proj" read and the player panel.
  const muB = anchoredMean(mu, muMkt, P);
  const pb = muB === mu ? pr : probLine(muB, market.line, stat, P, min);
  const pSide = side === 'over' ? pb.over : pb.under;
  return {
    side, pSide: +pSide.toFixed(4), pPush: +pb.push.toFixed(4), pModel: +(side === 'over' ? pr.over : pr.under).toFixed(4),
    fairSide: market.fairOver != null ? +(side === 'over' ? market.fairOver : 1 - market.fairOver).toFixed(4) : null,
    am: am ?? null, ev: am != null ? +evAt(am, pSide, pb.push).toFixed(4) : null,
    muMarket: muMkt != null ? +muMkt.toFixed(3) : null, muBlend: +muB.toFixed(3), score: score != null ? +score.toFixed(4) : null,
  };
}

// ── double-double (a joint market) ───────────────────────────────────────────
/**
 * P(10+ in at least two of pts / reb / ast / stl / blk). The categories are
 * taken as independent GIVEN the minutes he plays, on each of the twelve
 * minutes nodes, then averaged — the mixture carries the one correlation that
 * dominates (a 38-minute night lifts all of them together), and what is left
 * after conditioning on minutes is measured, not assumed: `DD_RHO` (fitted by
 * scripts/dd-audit.mjs) lifts the per-node P(both) of each pair toward its
 * upper bound to take up the residual pts–reb / pts–ast co-movement.
 *
 * `scale` multiplies every mean — the market's implied P(DD) is the scale whose
 * law reproduces it (ddImpliedScale), so score = −ln(scale) is ln(μ_model/μ_mkt)
 * in the same sense as every other market, and the gate band applies unchanged.
 */
export const DD_STATS = ['pts', 'reb', 'ast', 'stl', 'blk'];
/** Did a box score {pts, reb, ast, stl, blk} have one? 1 or 0 — what the ledger grades. */
export const isDoubleDouble = (b) => (DD_STATS.filter((c) => (b?.[c] ?? 0) >= 10).length >= 2 ? 1 : 0);
export function probDoubleDouble(mu, P = PARAMS, min = null, scale = 1) {
  if (!mu) return 0;
  const q = minuteNodes(min, P) || [1];
  const rho = P.DD_RHO ?? 0;
  let tot = 0;
  for (const s of q) {
    const p = DD_STATS.map((c) => (mu[c] > 0 ? 1 - nbAt(10, mu[c] * s * scale, P.NB_K[c] ?? 10)[0] : 0));
    // P(≥2 of n) = 1 − P(0) − P(1) under independence, then each pair's joint
    // moved `rho` of the way from p_i·p_j toward min(p_i, p_j)
    let none = 1, one = 0;
    for (const x of p) { one = one * (1 - x) + none * x; none *= 1 - x; }
    let pr = 1 - none - one;
    if (rho) for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) pr += rho * (Math.min(p[i], p[j]) - p[i] * p[j]);
    tot += clamp(pr, 0, 1);
  }
  return tot / q.length;
}

/** The common scale on his means at which the law gives P(DD) = pFair (bisection in log space). */
export function ddImpliedScale(mu, pFair, P = PARAMS, min = null) {
  if (!(pFair > 0 && pFair < 1)) return null;
  let lo = Math.log(0.2), hi = Math.log(5);
  if (probDoubleDouble(mu, P, min, Math.exp(hi)) < pFair || probDoubleDouble(mu, P, min, Math.exp(lo)) > pFair) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (probDoubleDouble(mu, P, min, Math.exp(mid)) < pFair) lo = mid; else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

/**
 * Markets the books post as a YES only. FanDuel, DraftKings and Hard Rock all
 * post the double-double that way (probed 2026-11-02) — and nobody bets the No
 * anyway — so, as with the NFL lab's anytime TD, the Yes is the only side.
 */
export const ONE_SIDED = new Set(['dd']);

/**
 * The double-double verdict, in pricePlayerStat's shape so the ledger, the gate
 * and the board treat it as one more market: line 0.5, side always 'over' (Yes).
 *
 * There is no No to devig against, and no fair price is invented: the market
 * reference is the best posted Yes AS PRICED, hold and all (the NFL lab's
 * anytime-TD score, ln(model λ / λ of the raw price)). So score > 0 means the
 * model beats the ticket you can actually buy, and it is exactly when EV > 0.
 * A model under the price is no lean at all — the NFL lab booked every Yes into
 * a 15–30% hold for four weeks and lost 281 units doing it — so daily-predict
 * writes a double-double to the ledger only when score > 0.
 */
export function priceDoubleDouble(mu, market, P = PARAMS, min = null) {
  if (!mu || !market) return null;
  const pModel = probDoubleDouble(mu, P, min);
  const am = market.overAm ?? null;
  const pPrice = am != null ? amToProb(am) : null;
  const s = pPrice != null ? ddImpliedScale(mu, pPrice, P, min) : null;
  const score = s ? -Math.log(s) : null;
  // priced at the market-anchored scale, as every other market is (TRUST)
  const sB = s ? Math.pow(s, 1 - P.TRUST) : 1;
  const pb = sB === 1 ? pModel : probDoubleDouble(mu, P, min, sB);
  return {
    side: 'over', pSide: +pb.toFixed(4), pPush: 0, pModel: +pModel.toFixed(4),
    fairSide: pPrice != null ? +pPrice.toFixed(4) : null, // the price's own P — the hold is still in it
    am, ev: am != null ? +evAt(am, pb).toFixed(4) : null,
    muMarket: s ? +s.toFixed(4) : null, muBlend: +sB.toFixed(4), score: score != null ? +score.toFixed(4) : null,
  };
}

/** μ_market^(1−TRUST) · μ_model^TRUST — the mean the price believes (no market → the model's own). */
export function anchoredMean(mu, muMarket, P = PARAMS) {
  return muMarket > 0 && mu > 0 ? muMarket * Math.pow(mu / muMarket, P.TRUST) : mu;
}

// ── the alt ladder ───────────────────────────────────────────────────────────
/**
 * Is it worth laddering the pick? The odds pull buys main lines only (alt
 * markets would roughly double the credits), so the rungs are priced from what
 * the main line already says:
 *
 *   Win %   P(side) at the market-anchored mean, through the minutes mixture —
 *           the board's Win % at the main line, extended up the ladder
 *   Fair    the price at which that rung breaks even for the model
 *   Book    a posted price when a book has the rung; otherwise ESTIMATED: the
 *           market's own P at that rung (its implied mean, same law), re-vigged
 *           with Shin at the main line's insider share z (mean over the
 *           two-sided books) — the same law devig() takes off, so the vig lands
 *           on the longshot rungs the way nba-v8 measured it does
 *
 * Rungs step toward the pick's side (one back for reference), 1 apart (2 for
 * pts / PRA). The recommended rung is the best EV at Book among those the model
 * still gives LADDER_MIN_P — past that a rung is a lottery ticket priced off a
 * tail the backtest never checked. Books can still hold more on alt rungs than
 * Shin at the main's z says; Fair is the number to hold a real price to.
 */
export const LADDER_MIN_P = 0.2;
const twoSided = (books) => Object.values(books || {}).filter((q) => q?.over != null && q?.under != null);
const avgOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const bookHold = (books) => avgOf(twoSided(books).map((q) => amToProb(q.over) + amToProb(q.under) - 1));
export const bookShinZ = (books) => avgOf(twoSided(books).map((q) => shinZ(q.over, q.under)).filter((z) => z != null));
export function priceLadder(mu, stat, market, P = PARAMS, min = null) {
  if (!(mu > 0)) return null;
  const side = market?.side || 'over'; const dir = side === 'over' ? 1 : -1;
  const step = stat === 'pts' || stat === 'pra' ? 2 : 1;
  const base = market?.line ?? Math.round(mu) + 0.5;
  const muMkt = market?.muMarket ?? null;
  const muP = anchoredMean(mu, muMkt, P);
  const hold = bookHold(market?.books) ?? 0.045;
  const z = bookShinZ(market?.books) ?? 0.02;
  const lines = [...new Set([-1, 0, 1, 2, 3, 4].map((k) => base + dir * k * step))].filter((L) => L >= 0.5).sort((a, b) => a - b);
  const pick = (pr) => (side === 'over' ? pr.over : pr.under);
  const rungs = lines.map((line) => {
    const pr = probLine(muP, line, stat, P, min); const pWin = pick(pr);
    const pMkt = muMkt ? pick(probLine(muMkt, line, stat, P, min)) : null;
    const posted = market?.ladder?.find((L) => L.line === line)?.[side] ?? null;
    const est = pMkt != null ? probToAm(Math.min(0.98, shinVig(pMkt, z))) : null;
    const price = posted ?? est;
    return { line, pWin: +pWin.toFixed(4), pMkt: pMkt != null ? +pMkt.toFixed(4) : null, fair: pWin > 0 && pWin < 1 ? probToAm(pWin) : null,
      posted, est, ev: price != null ? +evAt(price, pWin, pr.push).toFixed(4) : null, main: line === market?.line };
  });
  const ok = rungs.filter((r) => r.ev > 0 && r.pWin >= LADDER_MIN_P);
  const best = ok.length ? ok.reduce((a, b) => (b.ev > a.ev ? b : a)) : null;
  return { side, hold: +hold.toFixed(4), z: +z.toFixed(4), rungs, best };
}

// ── official gate (score space) ──────────────────────────────────────────────
// Every priced row is graded; every row that clears the gate is `official` — the
// card. A market's standing in gates.json (all opened on PROBATION, promoted from
// its own graded record) is a track-record label, not a filter: holding probation
// markets off the card left the ledger's Official record at 0 while the Plays tab
// carried 70 plays (2026-10-26). src/lib/gates.json is written ONLY by
// scripts/review-gates.mjs, which logs every change to docs/GATE_CHANGELOG.md —
// never hand-edit it.
export const GATES = GATE_FILE;
export function gateVerdict(row, G = GATES) {
  const st = G.markets[row.stat];
  if (!st) return { qualifies: false, official: false, reason: 'market not gated' };
  if (row.score == null) return { qualifies: false, official: false, reason: 'unpriced' };
  if (row.score < G.band.min) return { qualifies: false, official: false, reason: 'edge below band' };
  if (row.score > G.band.max) return { qualifies: false, official: false, reason: 'edge above band (likely news)' };
  if (row.am != null && (row.am < G.price.min || row.am > G.price.max)) return { qualifies: false, official: false, reason: 'price out of range' };
  // the edge must survive the price: a Maxey blocks over at −125 cleared the band at −4.7% EV
  if (row.ev != null && !(row.ev > 0)) return { qualifies: false, official: false, reason: 'no EV at the best price' };
  // a play is a bet ON the projection: the side is where the model disagrees with
  // the market, which can still be against the model (Merrill 3s: proj 1.78, market
  // ~2.1 → under 1.5 at model P 49%). Grading those tests the market, not us.
  // A one-sided Yes (double-double) has no projection to be against: it is a
  // longshot whose P sits under 50% at any plus price, and the score itself
  // already says the model beats the posted Yes.
  const oneSided = ONE_SIDED.has(row.stat);
  if (!oneSided && row.side && row.p_model != null && !(row.p_model > 0.5)) return { qualifies: false, official: false, reason: 'against the projection' };
  if (!oneSided && row.side && row.proj != null && row.line != null && !(row.side === 'over' ? row.proj > row.line : row.proj < row.line)) return { qualifies: false, official: false, reason: 'against the projection' };
  if (row.position !== 'GAME') {
    // minGpSeason, or every game his team has played when it has played fewer: a
    // fixed 3 in week one picked whichever team had played a third game (one
    // team's players were the whole card), not which rows had the edge.
    const needGp = Math.max(1, Math.min(G.minGpSeason, row.team_gp ?? G.minGpSeason));
    if ((row.gp_season ?? 0) < needGp) return { qualifies: false, official: false, reason: `<${needGp} GP this season` };
    if ((row.minutes ?? 0) < G.minMinutes) return { qualifies: false, official: false, reason: `<${G.minMinutes} proj min` };
  }
  return { qualifies: true, official: true, reason: st === 'official' ? 'official' : 'probation' };
}

/**
 * One play per player. His props share one minutes-and-usage projection, so when
 * it runs hot every stat clears together — seven Maxey overs are one bet, not
 * seven. Keeps his qualifying row with the best EV (score breaks a tie); the rest
 * are held. rows: [{ stat, ev, score, verdict }] → the same rows, verdicts settled.
 */
export function onePerPlayer(rows) {
  const q = rows.filter((r) => r.verdict?.qualifies);
  if (q.length < 2) return rows;
  const key = (r) => [r.ev ?? -Infinity, r.score ?? -Infinity];
  const best = q.reduce((a, b) => { const [ea, sa] = key(a), [eb, sb] = key(b); return eb > ea || (eb === ea && sb > sa) ? b : a; });
  return rows.map((r) => (r.verdict?.qualifies && r !== best
    ? { ...r, verdict: { qualifies: false, official: false, reason: `one play per player (${best.stat} is his)` } } : r));
}
