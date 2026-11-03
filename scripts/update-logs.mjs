// Keep the season box-score logs current — the model's whole evidence base.
//
//   node scripts/update-logs.mjs                     current season: every FINAL game
//                                                    on the schedule not yet in the log
//   node scripts/update-logs.mjs --season=2025 --backfill
//                                                    scan game ids 00225 00001… until the
//                                                    run of misses says the season is over
//
// Writes scripts/out/logs/{players,teams}_<YYYY-YY>.jsonl.gz. Those files are the
// durable product and live on Drive (gdrive:nba-research-dashboard-archive/logs/), NOT in
// Supabase — a season is ~26k player rows, ~1 MB gzipped, ~12 MB as Postgres rows.
// CI pulls them down before a run and pushes them back after (see daily-predict.yml).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  fetchCdnBox, fetchSchedule, fetchEspnBoxes, gameIdFor, seasonLabel, seasonStartYear,
  readJsonlGz, writeJsonlGz, etDate, normName,
} from './lib/nba-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const start = args.season ? +args.season : seasonStartYear();
const label = seasonLabel(start);
const PF = join(ROOT, `scripts/out/logs/players_${label}.jsonl.gz`);
const TF = join(ROOT, `scripts/out/logs/teams_${label}.jsonl.gz`);

const players = readJsonlGz(PF), teams = readJsonlGz(TF);
const have = new Set(teams.map((t) => t.gid));
console.log(`${label}: ${have.size} games already logged`);

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

let added = 0, blocked = 0;
function take(box) {
  if (!box || have.has(box.game.gid)) return;
  players.push(...box.players); teams.push(...box.teams); have.add(box.game.gid); added++;
}

if (args.backfill) {
  // Ids are dense from 00001; the NBA Cup final sits just past the 1230 and is
  // not a regular-season stat game, but it IS 002-prefixed — harmless either way.
  let seq = 1, misses = 0;
  while (misses < 25 && seq < 1400) {
    const batch = Array.from({ length: 12 }, (_, k) => gameIdFor(start, seq + k)).filter((g) => !have.has(g));
    const res = await pool(batch, 6, (gid) => fetchCdnBox(gid));
    for (const r of res) { if (r.box) { take(r.box); misses = 0; } else { misses++; if (r.status === 403) blocked++; } }
    seq += 12;
    if (seq % 120 === 1) console.log(`  …seq ${seq}, ${have.size} games`);
  }
} else {
  const sched = await fetchSchedule();
  const today = etDate();
  const due = (sched?.games || []).filter((g) => g.date < today || g.status === 3).filter((g) => !have.has(g.gid));
  console.log(`schedule: ${sched?.games?.length ?? 'unreachable'} games, ${due.length} final and unlogged`);
  const res = await pool(due, 6, (g) => fetchCdnBox(g.gid));
  const missingDates = new Set();
  res.forEach((r, k) => { if (r.box) take(r.box); else { if (r.status === 403) blocked++; missingDates.add(due[k].date); } });
  // cdn.nba.com refused (datacenter IP) → ESPN for those dates. ESPN rows carry
  // pid=null; reattach the NBA id from any earlier row of the same name+team so
  // the player's history stays one series.
  if (missingDates.size) {
    const idOf = new Map(players.filter((p) => p.pid).map((p) => [`${normName(p.name)}|${p.team}`, p.pid]));
    for (const d of missingDates) {
      for (const box of await fetchEspnBoxes(d)) {
        const sched1 = due.find((g) => g.date === d && g.home === box.game.home && g.away === box.game.away);
        if (!sched1 || have.has(sched1.gid)) continue;
        box.game.gid = sched1.gid;
        for (const p of box.players) { p.gid = sched1.gid; p.pid = idOf.get(`${normName(p.name)}|${p.team}`) ?? null; p.src = 'espn'; }
        // team rows rebuilt from the player rows so pace/defense still compute
        for (const tri of [box.game.home, box.game.away]) {
          const ps = box.players.filter((p) => p.team === tri), os = box.players.filter((p) => p.team !== tri);
          const sum = (a, k) => a.reduce((s, p) => s + (p[k] || 0), 0);
          const t = { gid: sched1.gid, date: d, team: tri, opp: tri === box.game.home ? box.game.away : box.game.home, home: tri === box.game.home,
            pts: sum(ps, 'pts'), opp_pts: sum(os, 'pts'), fga: sum(ps, 'fga'), fta: sum(ps, 'fta'), oreb: sum(ps, 'oreb'), tov: sum(ps, 'tov'),
            fg3a: sum(ps, 'fg3a'), fg3m: sum(ps, 'fg3m'), reb: sum(ps, 'reb'), ast: sum(ps, 'ast'), stl: sum(ps, 'stl'), blk: sum(ps, 'blk'),
            min: 240, out: [], src: 'espn' };
          t.poss = +(t.fga + 0.44 * t.fta - t.oreb + t.tov).toFixed(1);
          box.teams.push(t);
        }
        take(box);
      }
    }
  }
}

players.sort((a, b) => a.date.localeCompare(b.date) || a.gid.localeCompare(b.gid));
teams.sort((a, b) => a.date.localeCompare(b.date) || a.gid.localeCompare(b.gid));
writeJsonlGz(PF, players); writeJsonlGz(TF, teams);
console.log(`${label}: +${added} games → ${have.size} total, ${players.length} player rows${blocked ? `, ${blocked} cdn 403s` : ''}`);
