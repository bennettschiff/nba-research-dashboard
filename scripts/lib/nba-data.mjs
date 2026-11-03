// NBA data layer — the ONE place that knows where box scores, the schedule and
// injuries come from, and what shape they arrive in.
//
// Sources (probed 2026-10-14, see docs/DATA_SOURCES.md):
//   cdn.nba.com   schedule, box scores, play-by-play. Akamai-fronted: curl gets a
//                 403, Node's fetch (undici) with a browser header pack gets 200.
//                 This is the cloud backbone — GitHub Actions run it.
//   ESPN          injuries (Rotowire's notes, licensed) and a box-score FALLBACK
//                 when cdn.nba.com refuses a datacenter IP. ESPN carries no NBA
//                 person IDs, so the fallback joins on normalized name + team.
//   stats.nba.com NOT here. It blocks every datacenter IP (Vercel, Actions, the
//                 Supabase nba-proxy all time out). Only the Mac job reaches it —
//                 scripts/local/pull-nba-stats.mjs.
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CDN_HEADERS = { 'User-Agent': UA, Referer: 'https://www.nba.com/', Origin: 'https://www.nba.com', Accept: 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getJSON(url, { headers = {}, tries = 4, timeout = 20_000 } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const r = await fetch(url, { headers, signal: ac.signal });
      if (r.status === 403 || r.status === 404) return { status: r.status, json: null };
      if (r.ok) return { status: 200, json: await r.json() };
      last = r.status;
    } catch (e) { last = String(e); }
    finally { clearTimeout(t); }
    await sleep(400 * (i + 1));
  }
  return { status: last, json: null };
}

// ── names ── the one normalizer lives in src/lib/names.js (the board uses it too)
import { normName } from '../../src/lib/names.js';
export { normName };

// ESPN and the books use a few non-NBA tricodes.
const TRI_FIX = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BKN: 'BKN', BRK: 'BKN', CHO: 'CHA' };
export const fixTri = (t) => TRI_FIX[String(t || '').toUpperCase()] || String(t || '').toUpperCase();

export const TEAMS = {
  ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets', CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers', DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons', GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'LA Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies', MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves', NOP: 'New Orleans Pelicans', NYK: 'New York Knicks',
  OKC: 'Oklahoma City Thunder', ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs', TOR: 'Toronto Raptors',
  UTA: 'Utah Jazz', WAS: 'Washington Wizards',
};
// The Odds API names teams in full ("Los Angeles Clippers").
export function triFromFullName(full) {
  const f = String(full || '').toLowerCase();
  if (f.includes('clippers')) return 'LAC';
  for (const [tri, name] of Object.entries(TEAMS)) {
    const nick = name.split(' ').at(-1).toLowerCase();
    if (f.endsWith(nick)) return tri;
  }
  return null;
}

// ── season / ids ─────────────────────────────────────────────────────────────
// Season label "2026-27" ↔ game-id prefix "00226". Regular season = '002'.
export const seasonLabel = (startYear) => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
export const seasonStartYear = (d = new Date()) => {
  const et = etParts(d);
  return et.month >= 9 ? et.year : et.year - 1; // Sep onward belongs to the new season
};
export const gameIdFor = (startYear, seq) => `002${String(startYear % 100).padStart(2, '0')}${String(seq).padStart(5, '0')}`;

// ── dates (always Eastern — the league's day) ─────────────────────────────────
export function etParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24 };
}
export const etDate = (d = new Date()) => { const p = etParts(d); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; };
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── schedule ─────────────────────────────────────────────────────────────────
// → [{ gid, date (ET), tipUTC, home, away, status (1 pre, 2 live, 3 final), cup }]
export async function fetchSchedule() {
  const { json } = await getJSON('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', { headers: CDN_HEADERS, timeout: 40_000 });
  if (!json) return null;
  const out = [];
  for (const d of json.leagueSchedule?.gameDates || []) {
    for (const g of d.games || []) {
      if (!String(g.gameId).startsWith('002')) continue; // regular season only (Cup group games ARE 002)
      out.push({
        gid: g.gameId,
        date: String(g.gameDateEst).slice(0, 10),
        tipUTC: g.gameDateTimeUTC,
        home: g.homeTeam?.teamTricode, away: g.awayTeam?.teamTricode,
        status: g.gameStatus,
        cup: /Cup/i.test(g.gameLabel || '') || /Cup/i.test(g.gameSubLabel || ''),
      });
    }
  }
  return { season: json.leagueSchedule?.seasonYear, games: out };
}

// ── box scores ───────────────────────────────────────────────────────────────
const isoMin = (s) => { const m = /PT(\d+)M([\d.]+)S/.exec(s || ''); return m ? +(+m[1] + +m[2] / 60).toFixed(2) : 0; };
// Possessions, the standard estimate. Team-level so both sides agree on pace.
export const possOf = (t) => t.fga + 0.44 * t.fta - t.oreb + t.tov;

/** Parse a cdn.nba.com box into { game, players[], teams[] } compact rows. */
export function parseCdnBox(j) {
  const g = j?.game;
  if (!g || g.gameStatus !== 3) return null;
  const date = String(g.gameEt || g.gameTimeUTC).slice(0, 10);
  const players = [], teams = [];
  for (const side of ['homeTeam', 'awayTeam']) {
    const T = g[side], O = g[side === 'homeTeam' ? 'awayTeam' : 'homeTeam'];
    const home = side === 'homeTeam';
    const ts = T.statistics || {};
    const team = {
      gid: g.gameId, date, team: T.teamTricode, opp: O.teamTricode, home,
      pts: T.score, opp_pts: O.score,
      fga: ts.fieldGoalsAttempted, fta: ts.freeThrowsAttempted, oreb: ts.reboundsOffensive,
      tov: ts.turnoversTotal ?? ts.turnovers, fg3a: ts.threePointersAttempted, fg3m: ts.threePointersMade,
      reb: ts.reboundsTotal, ast: ts.assists, stl: ts.steals, blk: ts.blocks,
      min: isoMin(ts.minutes), out: [],
    };
    team.poss = +possOf(team).toFixed(1);
    for (const p of T.players || []) {
      const s = p.statistics || {};
      const played = p.played === '1';
      if (!played) {
        // INACTIVE = out (injury/rest); ACTIVE + not played = coach's decision.
        team.out.push({ pid: p.personId, why: p.status === 'INACTIVE' ? (p.notPlayingReason || 'INACTIVE') : 'DNP' });
        continue;
      }
      players.push({
        gid: g.gameId, date, pid: p.personId, name: p.name, pos: p.position || '',
        team: T.teamTricode, opp: O.teamTricode, home, starter: p.starter === '1' ? 1 : 0,
        min: isoMin(s.minutes), pts: s.points, reb: s.reboundsTotal, oreb: s.reboundsOffensive,
        dreb: s.reboundsDefensive, ast: s.assists, stl: s.steals, blk: s.blocks, tov: s.turnovers,
        fg3m: s.threePointersMade, fg3a: s.threePointersAttempted, fga: s.fieldGoalsAttempted,
        fgm: s.fieldGoalsMade, fta: s.freeThrowsAttempted, ftm: s.freeThrowsMade, pf: s.foulsPersonal,
        pm: s.plusMinusPoints,
      });
    }
    teams.push(team);
  }
  return { game: { gid: g.gameId, date, home: g.homeTeam.teamTricode, away: g.awayTeam.teamTricode }, players, teams };
}

export async function fetchCdnBox(gid) {
  const { status, json } = await getJSON(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gid}.json`, { headers: CDN_HEADERS });
  return { status, box: json ? parseCdnBox(json) : null };
}

// ── ESPN (injuries + box fallback) ───────────────────────────────────────────
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

/**
 * Injury report → Map<normName|team, { status, detail, date }>.
 * status: OUT | DOUBTFUL | QUESTIONABLE | PROBABLE | DTD | SUSP.
 */
export async function fetchInjuries() {
  const { json } = await getJSON(`${ESPN}/injuries`, { timeout: 30_000 });
  if (!json) return null;
  const map = new Map();
  for (const t of json.injuries || []) {
    for (const it of t.injuries || []) {
      const a = it.athlete || {};
      const tri = fixTri(a.team?.abbreviation || t.abbreviation || '');
      const fant = String(it.details?.fantasyStatus?.abbreviation || it.details?.fantasyStatus?.description || '').toUpperCase();
      const raw = (fant === 'OUT' || fant === 'OFS' ? 'OUT ' : '') + String(it.status || it.type?.description || '').toUpperCase();
      const status = raw.includes('OUT') ? 'OUT' : raw.includes('DOUBT') ? 'DOUBTFUL'
        : raw.includes('QUESTION') ? 'QUESTIONABLE' : raw.includes('PROB') ? 'PROBABLE'
        : raw.includes('SUSP') ? 'SUSP' : raw.includes('DAY') ? 'DTD' : raw || 'DTD';
      map.set(`${normName(a.displayName)}|${tri}`, {
        name: a.displayName, team: tri, status,
        detail: it.shortComment || it.details?.type || '', date: it.date || null,
      });
    }
  }
  return map;
}
export const injuryFor = (inj, name, team) => inj?.get(`${normName(name)}|${team}`) || null;
/**
 * A soft tag (DTD / questionable / probable) older than 3 days before the game is
 * stale — ESPN leaves preseason rest days on the report as "Day-To-Day" for a
 * week (118 of 139 entries on 2026-10-14). OUT and SUSP never go stale here.
 */
export function liveInjury(inj, gameDate) {
  if (!inj) return null;
  if (['OUT', 'SUSP'].includes(inj.status)) return inj;
  if (inj.date && Date.parse(gameDate + 'T23:00:00Z') - Date.parse(inj.date) > 3 * 86400_000) return null;
  return inj;
}
// Probability a player with this tag plays at all. Used to discount the
// minutes the model gives him and to decide whether his teammates absorb some.
export const PLAY_PROB = { OUT: 0, SUSP: 0, DOUBTFUL: 0.2, QUESTIONABLE: 0.6, DTD: 0.7, PROBABLE: 0.95 };

/** ESPN box fallback for one date → same compact rows as parseCdnBox (pid = null). */
export async function fetchEspnBoxes(dateIso) {
  const { json } = await getJSON(`${ESPN}/scoreboard?dates=${dateIso.replace(/-/g, '')}&limit=30`);
  const out = [];
  for (const e of json?.events || []) {
    if (e.status?.type?.state !== 'post') continue;
    const c = e.competitions?.[0];
    const home = fixTri(c?.competitors?.find((x) => x.homeAway === 'home')?.team?.abbreviation);
    const away = fixTri(c?.competitors?.find((x) => x.homeAway === 'away')?.team?.abbreviation);
    const { json: sum } = await getJSON(`${ESPN}/summary?event=${e.id}`);
    const players = [];
    for (const tb of sum?.boxscore?.players || []) {
      const team = fixTri(tb.team?.abbreviation); const opp = team === home ? away : home;
      const st = tb.statistics?.[0]; if (!st) continue;
      const ix = (k) => st.labels.indexOf(k);
      const made = (v) => +(String(v).split('-')[0]) || 0, att = (v) => +(String(v).split('-')[1]) || 0;
      for (const a of st.athletes || []) {
        if (a.didNotPlay || !a.stats?.length) continue;
        const s = a.stats;
        players.push({
          gid: `espn-${e.id}`, date: dateIso, pid: null, name: a.athlete?.displayName,
          pos: a.athlete?.position?.abbreviation || '', team, opp, home: team === home, starter: a.starter ? 1 : 0,
          min: +s[ix('MIN')] || 0, pts: +s[ix('PTS')] || 0, reb: +s[ix('REB')] || 0, oreb: +s[ix('OREB')] || 0,
          dreb: +s[ix('DREB')] || 0, ast: +s[ix('AST')] || 0, stl: +s[ix('STL')] || 0, blk: +s[ix('BLK')] || 0,
          tov: +s[ix('TO')] || 0, fg3m: made(s[ix('3PT')]), fg3a: att(s[ix('3PT')]), fgm: made(s[ix('FG')]),
          fga: att(s[ix('FG')]), ftm: made(s[ix('FT')]), fta: att(s[ix('FT')]), pf: +s[ix('PF')] || 0, pm: +s[ix('+/-')] || 0,
        });
      }
    }
    out.push({ game: { gid: `espn-${e.id}`, date: dateIso, home, away }, players, teams: [] });
  }
  return out;
}

// ── jsonl.gz store (the season log files that live on Drive) ─────────────────
export function readJsonlGz(path) {
  if (!existsSync(path)) return [];
  const txt = gunzipSync(readFileSync(path)).toString('utf8');
  return txt.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
export function writeJsonlGz(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
}
