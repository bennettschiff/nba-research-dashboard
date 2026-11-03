// ── Bet-slip deep links ──────────────────────────────────────────────────────
// A price on the board is a thing you are about to bet, so it should be one tap
// from the slip that has it on already. The Odds API returns the link with the
// odds (includeLinks/includeSids are free response flags — see
// scripts/pull-nba-odds.mjs), and the three books we shop do not agree on how
// to hand it over. Ported from the NFL lab's src/lib/betslip.js (itself from the
// MLB lab's OddsLink.jsx); same API, same three books, same shapes.
//
// Pure — no DOM, no React. markets.js resolves the URL when it parses a
// snapshot; the UI layer is src/components/OddsCell.jsx.

export const BOOK_COLORS = { fanduel: '#2062c8', draftkings: '#0f8a44', hardrockbet: '#c2570f' };
export const BOOK_NAMES = { fanduel: 'FanDuel', draftkings: 'DraftKings', hardrockbet: 'Hard Rock' };

// Hard Rock, rebuilt from `sid` rather than used as given: the API's own link
// points at the app host and does not do the universal-link handoff, so from a
// browser it lands on a page instead of the slip. The share host does.
const HARD_ROCK = (sid) => `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/${sid}`;

/**
 * The URL that opens this outcome on the book's slip, or null — never a
 * homepage: a cell that drops you on a book's front page when you tapped a
 * specific price is worse than one that is not tappable.
 * @param book  Odds API bookmaker key
 * @param rec   { link, sid } from the outcome
 */
export function betslipUrl(book, rec) {
  if (!rec) return null;
  if (book === 'hardrockbet') return rec.sid ? HARD_ROCK(rec.sid) : null;
  return rec.link || null;
}
