#!/usr/bin/env node
/**
 * pull-nba-odds.mjs — tonight's NBA prop + game-line board → Drive.
 *
 * The board never calls The Odds API. This runs from the pipeline workflow
 * (10:07 AM ET skeleton, 5:37 PM ET pre-tip), buys each not-yet-started game
 * once per pass, and APPENDS the raw responses as a snapshot to
 * scripts/out/odds/<date>.json.gz, which is archived to
 * gdrive:nba-research-dashboard-archive/odds/<date>.json.gz. The first snapshot of an
 * event is its OPEN, the last before tip its CLOSE — that is how CLV is graded.
 * Odds are never written to Postgres (the WNBA lab measured 31 MB there vs
 * 0.29 MB gzipped, on a 500 MB plan).
 *
 * ── COST ─────────────────────────────────────────────────────────────────────
 *   /events                1 call, 0 credits
 *   /events/{id}/odds      1 credit per market RETURNED; the 3 books below are
 *                          one billing region (≤10 books). ≤10 credits a game.
 * Shared key (20,000/mo across MLB/WNBA/NFL/NHL/NBA, resets on the 1st):
 *   · dry run unless --live, printing what --live would spend
 *   · --reserve (default 3000): refuse if the ceiling would take the account below it
 *   · events priced in the last --skip-fresher-than minutes (default 90) are skipped
 *   · every live run logs to public.odds_credit_log (source `nba_live`)
 *
 * ENV: ODDS_API_KEY (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for the credit log)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { etDate, triFromFullName } from './lib/nba-data.mjs';
import { sb, haveSupabase } from './lib/sb.mjs';
import { pullFile, pushFile } from './lib/drive.mjs';
import { BOOK_PREF } from '../src/lib/markets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';

// Keep in step with scripts/lib/markets.mjs (MARKET_KEYS). Each costs ≤1 credit a game.
export const PROP_MARKETS = [
  'player_points', 'player_rebounds', 'player_assists', 'player_threes',
  'player_points_rebounds_assists', 'player_steals', 'player_blocks',
  'player_double_double', // Yes only at all three books (probed 2026-11-02)
];
export const GAME_MARKETS = ['h2h', 'spreads', 'totals'];
// Only the books the card is bet at (src/lib/markets.js BOOK_PREF, nba-v5).
export const BOOKMAKERS = BOOK_PREF;

const argv = process.argv.slice(2);
const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const LIVE = argv.includes('--live');
const FORCE = argv.includes('--force');
const RESERVE = Number(argOf('--reserve') ?? 3000);
const FRESH_MIN = Number(argOf('--skip-fresher-than') ?? 90);
const DATE = argOf('--date') || etDate();
const KEY = process.env.ODDS_API_KEY;
if (!KEY) { console.error('[nba-odds] ODDS_API_KEY not set'); process.exit(1); }

let spent = 0, used = null, remaining = null;
async function odds(path, qs = '') {
  const res = await fetch(`${API}${path}?apiKey=${KEY}${qs ? '&' + qs : ''}`, { signal: AbortSignal.timeout(30_000) });
  spent += Number(res.headers.get('x-requests-last') || 0);
  if (res.headers.get('x-requests-used') != null) used = Number(res.headers.get('x-requests-used'));
  if (res.headers.get('x-requests-remaining') != null) remaining = Number(res.headers.get('x-requests-remaining'));
  const txt = await res.text();
  if (!res.ok) throw new Error(`odds ${path} → ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

const FILE = join(ROOT, `scripts/out/odds/${DATE}.json.gz`);
const REMOTE = `odds/${DATE}.json.gz`;
if (!existsSync(FILE)) pullFile(REMOTE, FILE); // a CI runner starts empty — resume today's file from Drive
const store = existsSync(FILE) ? JSON.parse(gunzipSync(readFileSync(FILE)).toString()) : { date: DATE, snapshots: [] };

const events = await odds(`/sports/${SPORT}/events`);
const now = Date.now();
const onDate = events.filter((e) => etDate(new Date(e.commence_time)) === DATE);
const upcoming = onDate.filter((e) => new Date(e.commence_time).getTime() > now);
const lastPulled = new Map();
for (const s of store.snapshots) for (const e of s.events) lastPulled.set(e.id, s.at);
const targets = upcoming.filter((e) => FORCE || !lastPulled.has(e.id) || now - Date.parse(lastPulled.get(e.id)) > FRESH_MIN * 60_000);
const ceiling = targets.length * (PROP_MARKETS.length + GAME_MARKETS.length);
console.log(`[nba-odds] ${DATE}: ${onDate.length} games, ${upcoming.length} not started, ${targets.length} to buy (ceiling ${ceiling} credits; remaining ${remaining ?? '?'})`);

if (!LIVE) { console.log('[nba-odds] dry run — pass --live to buy'); process.exit(0); }
if (remaining != null && remaining - ceiling < RESERVE) {
  console.error(`[nba-odds] refusing: ${remaining} remaining − ${ceiling} ceiling < ${RESERVE} reserve`); process.exit(1);
}

const snap = { at: new Date().toISOString(), events: [] };
for (const e of targets) {
  try {
    const j = await odds(`/sports/${SPORT}/events/${e.id}/odds`,
      // includeLinks/includeSids are free response flags (billing is per market
      // per region): they carry each outcome's bet-slip link to the board (src/lib/betslip.js)
      `regions=us&markets=${[...PROP_MARKETS, ...GAME_MARKETS].join(',')}&bookmakers=${BOOKMAKERS.join(',')}&oddsFormat=american&includeLinks=true&includeSids=true`);
    snap.events.push({ id: e.id, commence: e.commence_time, home: triFromFullName(e.home_team), away: triFromFullName(e.away_team), bookmakers: j.bookmakers || [] });
  } catch (err) { console.warn(`[nba-odds] ${e.away_team} @ ${e.home_team}: ${err.message}`); }
}
if (snap.events.length) store.snapshots.push(snap);
mkdirSync(dirname(FILE), { recursive: true });
writeFileSync(FILE, gzipSync(JSON.stringify(store)));
pushFile(FILE, REMOTE);
console.log(`[nba-odds] bought ${snap.events.length} games for ${spent} credits (used ${used}, remaining ${remaining}); snapshot ${store.snapshots.length} of the day archived`);

if (haveSupabase() && spent > 0) {
  await sb('odds_credit_log', { method: 'POST', retry: false, prefer: 'return=minimal',
    body: [{ game_date: DATE, source: 'nba_live', credits_used: used, credits_remaining: remaining }] });
}
