// The expanded row, laid out like the NFL lab's: who and where up top, a tile
// for every prop he has tonight (click one to re-point the panel), the game log
// with every stat against tonight's line, then why the model says what it says,
// the alt ladder priced by the same distribution the ledger uses, and context
// (injury, DARKO, stats.nba.com tracking when the Mac job has run).
import { useState } from 'react';
import { S, C, MON, alpha, heat } from '../lib/theme.js';
import * as M from '../lib/model.js';
import { BOOK_LABEL } from '../lib/markets.js';
import { pct, am, num, signed, shortDate, tipTime } from '../lib/format.js';
import { logVal, hitRate, thisSeason, sideRate, sideCount, mean, LOG_IX, withoutRows } from '../lib/gamelog.js';
import { PROP_ORDER as STAT_ORDER, MARKET_SHORT as SHORT } from '../lib/ledger.js';
import { Headshot, TeamLogo, InjTag, PosTag, StatusTag, PickPill, Spark, ConvBars, PctlRail } from './ui.jsx';
import { TRACK_IX } from '../lib/tracking.js';
const box = { ...S.inset, padding: 10, background: C.panel };
const h = { ...S.sectionLabel, marginBottom: 6, display: 'block' };
const kv = (k, v, c) => (
  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, padding: '2px 0' }}>
    <span style={{ color: C.muted }}>{k}</span><span style={{ fontFamily: MON, color: c || C.txt }}>{v}</span>
  </div>
);
const mult = (x) => (x == null ? '—' : `×${x.toFixed(3)}`);
const multColor = (x) => (x == null || Math.abs(x - 1) < 0.005 ? C.muted : x > 1 ? C.good : C.bad);

// The tracking tiles start collapsed; an open panel stays the default for the
// next player (per viewer), as in the NHL lab.
const ADV_KEY = 'nba-lab-adv-open';
const readAdvOpen = () => { try { return localStorage.getItem(ADV_KEY) === '1'; } catch { return false; } };

// game-log columns: [label, value(row, tracking row of that date), stat key the
// column grades against, tracking key]. REB CH and POT AST sit beside the stat
// they create — the per-game stats.nba.com tracking (scripts/local/
// pull-nba-tracking-log.mjs), so a game reads "5 boards of 12 chances".
const fmtPair = (a, b) => (a == null || b == null ? '—' : `${a}-${b}`);
const trk = (k) => (r, t) => t?.[TRACK_IX[k]] ?? '—';
const COLS = [
  ['MIN', (r) => r[LOG_IX.min], null],
  ['PTS', (r) => r[LOG_IX.pts], 'pts'],
  ['REB', (r) => r[LOG_IX.reb], 'reb'], ['REB CH', trk('rebCh'), null, 'rebCh'],
  ['AST', (r) => r[LOG_IX.ast], 'ast'], ['POT AST', trk('potAst'), null, 'potAst'],
  ['PRA', (r) => logVal(r, 'pra'), 'pra'], ['3PM-A', (r) => fmtPair(r[LOG_IX.fg3m], r[LOG_IX.fg3a]), 'fg3m'],
  ['STL', (r) => r[LOG_IX.stl], 'stl'], ['BLK', (r) => r[LOG_IX.blk], 'blk'], ['DD', (r) => (logVal(r, 'dd') ? '✓' : '·'), 'dd'],
  ['FG', (r) => fmtPair(r[LOG_IX.fgm], r[LOG_IX.fga]), null], ['FT', (r) => fmtPair(r[LOG_IX.ftm], r[LOG_IX.fta]), null],
  ['TOV', (r) => r[LOG_IX.tov] ?? '—', null], ['+/−', (r) => (r[LOG_IX.pm] == null ? '—' : signed(r[LOG_IX.pm], 0)), null],
];
const TRACK_TITLE = {
  'REB CH': 'Rebound chances: boards he was in position for (stats.nba.com tracking). — before the tracking log starts',
  'POT AST': 'Potential assists: passes that would have been assists had the shot dropped (stats.nba.com tracking). — before the tracking log starts',
};
const AVG_KEYS = { MIN: 'min', PTS: 'pts', REB: 'reb', AST: 'ast', STL: 'stl', BLK: 'blk', TOV: 'tov' };

export default function PlayerPanel({ p, stat, slate, onClose }) {
  const [focus, setFocus] = useState(stat);
  const [advOpen, setAdvOpen] = useState(readAdvOpen);
  const saveAdvOpen = (v) => { setAdvOpen(v); try { localStorage.setItem(ADV_KEY, v ? '1' : '0'); } catch { /* private window */ } };
  // teammate filter: null = his last 20 games; a pid = every game without that teammate
  const [matePid, setMatePid] = useState(null);
  // earlier seasons' games fold away under their season row, closed by default
  const [prevOpen, setPrevOpen] = useState(false);
  const m = p.markets?.[focus];
  const oneSided = M.ONE_SIDED.has(focus);
  const trackByDate = new Map((p.track?.g || []).map((t) => [t[TRACK_IX.date], t]));
  const mu = p.mu?.[focus];
  const g = slate.games.find((x) => x.gid === p.gid);
  const mates = p.wowy?.mates || [];
  const mate = mates.find((x) => x.pid === matePid) || null;
  const log = mate ? withoutRows(p, mate.pid) : p.log || [];
  const cur = thisSeason(p.log || [], slate.date);
  const sd = m?.side || 'over';
  const line = m?.line ?? null;
  const lastName = (n) => n.split(' ').slice(1).join(' ') || n;
  const withHit = mate && mate.with.hits[focus] != null ? { k: mate.with.hits[focus], n: mate.with.n } : null;
  const rates = mate
    ? [[`Without ${lastName(mate.name)}`, hitRate(log, focus, line)], [`With`, withHit]]
    : [['L5', hitRate(log, focus, line, 5)], ['L10', hitRate(log, focus, line, 10)], [`L${Math.min(20, log.length)}`, hitRate(log, focus, line, 20)], ['Season', hitRate(cur, focus, line)]];
  const seasonLab = (y) => `${y}-${String(y + 1).slice(2)} avg`;
  const foot = mate
    ? [{ lab: `Without ${lastName(mate.name)}`, rows: log, gp: log.length }, { lab: `With ${lastName(mate.name)}`, a: mate.with.avg, gp: mate.with.n }]
    : [{ lab: 'Last 10', rows: log.slice(-10) }, { lab: seasonLab(M.seasonOf(slate.date)), a: p.avg?.cur, gp: p.avg?.cur?.gp, track: p.track }, { lab: seasonLab(M.seasonOf(slate.date) - 1), a: p.avg?.prev, gp: p.avg?.prev?.gp }];
  const season = M.seasonOf(slate.date);
  const newest = log.slice().reverse();
  const nPrev = newest.filter((r) => M.seasonOf(r[0]) !== season).length;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* who and where */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Headshot pid={p.pid} name={p.name} team={p.team} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>{p.name} <PosTag grp={p.grp} /> <InjTag inj={p.inj} /></div>
          <div style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
            <TeamLogo tri={p.team} size={14} />{p.team} {p.home ? 'vs' : '@'} <TeamLogo tri={p.opp} size={14} />{p.opp}
            {g && <span style={{ fontFamily: MON, color: C.faint }}>· {g.started ? 'started' : tipTime(g.tipUTC)}{g.b2b?.[p.team] ? ' · back-to-back' : ''}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, marginLeft: 8, flexWrap: 'wrap' }}>
          {[['Proj min', num(p.minutes, 1)], ['GP this season', p.gpSeason], ['Avg min', p.avg?.cur ? num(p.avg.cur.min, 1) : p.avg?.prev ? `${num(p.avg.prev.min, 1)} (last yr)` : '—'],
            ['DARKO min', p.darko ? num(p.darko.minutes, 1) : '—'], ['Rotation', pct(p.rotRate)]].map(([k, v]) => (
            <div key={k}><div style={S.sectionLabel}>{k}</div><div style={{ fontFamily: MON, fontWeight: 700, fontSize: 13 }}>{v}</div></div>))}
        </div>
        <span style={{ flex: 1 }} />
        {onClose && <button style={S.btnGhost} onClick={onClose}>Close</button>}
      </div>
      {p.inj && <div style={{ fontSize: 11, color: C.warn, background: alpha(C.warn, 0.08), borderRadius: 6, padding: '5px 9px' }}><b>{p.inj.status}</b> — {p.inj.detail}</div>}

      {/* every prop tonight */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {STAT_ORDER.map((s) => {
          const mk = p.markets?.[s]; const on = s === focus; const h10 = hitRate(p.log, s, mk?.line, 10); // last 10 whatever the teammate filter
          return (
            <button key={s} onClick={() => setFocus(s)} style={{ ...S.inset, background: on ? alpha(C.accent, 0.08) : C.panel, border: `1px solid ${on ? C.accent : mk?.qualifies ? alpha(C.purple, 0.5) : C.line}`,
              padding: '7px 9px', textAlign: 'left', cursor: 'pointer', color: C.txt, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={S.sectionLabel}>{SHORT[s]}</span><StatusTag m={mk} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontFamily: MON }}>
                {M.ONE_SIDED.has(s) ? <>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{pct(p.mu?.[s], 0)}</span>
                  <span style={{ fontSize: 10, color: C.faint }}>model{mk ? ` · Yes ${am(mk.overAm)}` : ' · no price'}</span>
                </> : <>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{num(p.mu?.[s], 1)}</span>
                  <span style={{ fontSize: 10, color: C.faint }}>proj{mk ? ` · line ${mk.line}` : ' · no line'}</span>
                </>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: MON, color: C.muted }}>
                {mk ? <><PickPill side={mk.side} line={mk.line} stat={s} size={10} /> {pct(mk.pSide)} · L10 {sideCount(h10, mk.side)}</>
                  : M.ONE_SIDED.has(s) ? <span>L10 {sideCount(hitRate(p.log, s, 0.5, 10), 'over')}{p.ddUp ? ` · upside ${pct(p.ddUp.p, 0)}` : ''}</span>
                  : <span>L10 avg {num(mean((p.log || []).slice(-10).map((r) => logVal(r, s))), 1)}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* game log */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ ...h, marginBottom: 0 }}>Game log · {M.STAT_LABEL[focus]}{line != null && !oneSided ? ` vs ${line}` : ''}</span>
          {line != null && rates.map(([k, r]) => r && (
            <span key={k} style={{ fontFamily: MON, fontSize: 11, padding: '2px 7px', borderRadius: 4, background: heat(sideRate(r, sd), r.n < 5) || alpha(C.deep, 0.5) }}>
              {k} <b>{sideCount(r, sd)}</b>{m?.side ? ` ${m.side === 'over' ? 'o' : 'u'}` : ''}</span>))}
          <span style={{ flex: 1 }} />
          <Spark values={log.slice(-20).map((r) => logVal(r, focus))} line={line} side={sd} width={200} height={30} />
        </div>
        {mates.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ ...S.sectionLabel, marginRight: 2 }}>Without</span>
            {[null, ...mates].map((x) => {
              const on = (x?.pid ?? null) === matePid; const tint = x?.outTonight ? C.warn : C.accent;
              return (
                <button key={x?.pid ?? 'all'} onClick={() => setMatePid(x?.pid ?? null)} title={x ? `${x.nWithout} games without ${x.name}, ${x.with.n} with him (on this team, his last ${M.PARAMS.WOWY_GAMES} games)` : 'His last 20 games'}
                  style={{ fontFamily: MON, fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', color: on ? C.txt : x?.outTonight ? C.warn : C.muted,
                    background: on ? alpha(tint, 0.16) : 'transparent', border: `1px solid ${on ? tint : x?.outTonight ? alpha(C.warn, 0.5) : C.line}` }}>
                  {x ? <>{lastName(x.name)} <span style={{ color: C.faint }}>{x.nWithout}</span>{x.outTonight ? <b> · {x.status || 'OUT'}</b> : ''}</> : 'Nobody (last 20)'}
                </button>);
            })}
          </div>)}
        <div style={S.tblWrap}>
          <table style={{ ...S.tbl, fontFamily: MON, fontSize: 11 }}>
            <thead><tr>
              <th style={S.thLeft}>Date</th><th style={S.thLeft}>Opp</th>
              {COLS.map(([lab, , key, tk]) => <th key={lab} title={TRACK_TITLE[lab]} style={{ ...S.th, color: key === focus ? C.accent : tk ? C.faint : S.th.color, background: key === focus ? alpha(C.accent, 0.1) : S.th.background }}>{lab}</th>)}
            </tr></thead>
            <tbody>
              {newest.map((r, i, arr) => {
                const prev = M.seasonOf(r[0]) !== season;
                // a season boundary; the log's top row is one too when he has no
                // games this season, so the toggle never hides behind itself
                const newSeason = i === 0 ? prev : M.seasonOf(arr[i - 1][0]) !== M.seasonOf(r[0]);
                const v = logVal(r, focus); const hit = line == null || v == null ? null : sd === 'under' ? v < line : v > line;
                const t = trackByDate.get(r[0]);
                return [
                  newSeason && (prevOpen || i === 0 || M.seasonOf(arr[i - 1][0]) === season) && (
                    <tr key={`s${r[0]}`} onClick={() => setPrevOpen((o) => !o)} style={{ cursor: 'pointer' }} title={prevOpen ? 'Hide earlier seasons' : 'Show earlier seasons'}>
                      <td colSpan={COLS.length + 2} style={{ ...S.tdLeft, padding: '4px 12px', fontSize: 9, color: C.faint, background: alpha(C.deep, 0.5), letterSpacing: '0.08em' }}>
                        {prevOpen ? '▾' : '▸'} {M.seasonOf(r[0])}-{String(M.seasonOf(r[0]) + 1).slice(2)} SEASON
                        {!prevOpen && <span style={{ letterSpacing: 0 }}> · {nPrev} game{nPrev === 1 ? '' : 's'} hidden — click to show</span>}</td></tr>),
                  (!prev || prevOpen) && <tr key={r[0] + r[1]} className="row-hover">
                    <td style={{ ...S.tdLeft, padding: '5px 12px', color: C.muted, fontFamily: MON }}>{shortDate(r[0])}</td>
                    <td style={{ ...S.tdLeft, padding: '5px 12px', fontFamily: MON, whiteSpace: 'nowrap' }}>{r[2] ? 'vs' : '@'} {r[1]}</td>
                    {COLS.map(([lab, val, key, tk]) => (
                      <td key={lab} style={{ ...S.td, padding: '5px 8px', fontSize: 11, ...(tk ? { color: C.txt2 } : null),
                        ...(key === focus ? { background: hit == null ? alpha(C.accent, 0.06) : alpha(hit ? C.good : C.bad, 0.13), fontWeight: 700, color: hit == null ? C.txt : hit ? C.good : C.bad } : null),
                        ...(lab === 'MIN' && !r[3] ? { color: C.muted } : null) }}>
                        {val(r, t)}{lab === 'MIN' && !r[3] ? '*' : ''}
                      </td>))}
                  </tr>,
                ];
              })}
              {foot.map(({ lab, rows, a, gp, track }) => {
                if (!rows && !a) return null;
                const cell = (colLab, key, tk) => {
                  if (tk) {
                    if (rows) return num(mean(rows.map((r) => trackByDate.get(r[0])?.[TRACK_IX[tk]] ?? null)), 1);
                    return track?.[tk] != null ? num(track[tk], 1) : '';
                  }
                  if (rows) {
                    if (colLab === 'MIN') return num(mean(rows.map((r) => r[LOG_IX.min])), 1);
                    if (key === 'fg3m') return `${num(mean(rows.map((r) => r[LOG_IX.fg3m])), 1)}-${num(mean(rows.map((r) => r[LOG_IX.fg3a])), 1)}`;
                    if (key === 'dd') return `${rows.filter((r) => logVal(r, 'dd')).length}/${rows.length}`;
                    if (key) return num(mean(rows.map((r) => logVal(r, key))), 1);
                    return '';
                  }
                  if (key === 'pra') return num(a.pra ?? a.pts + a.reb + a.ast, 1);
                  if (key === 'fg3m') return `${num(a.fg3m, 1)}-${num(a.fg3a, 1)}`;
                  return AVG_KEYS[colLab] && a[AVG_KEYS[colLab]] != null ? num(a[AVG_KEYS[colLab]], 1) : '';
                };
                return (
                  <tr key={lab} style={{ background: alpha(C.deep, 0.35) }}>
                    <td colSpan={2} style={{ ...S.tdLeft, padding: '5px 12px', fontWeight: 700, fontSize: 11 }}>{lab}{gp != null ? <span style={{ color: C.faint, fontWeight: 400 }}> · {gp} gp</span> : ''}</td>
                    {COLS.map(([colLab, , key, tk]) => <td key={colLab} style={{ ...S.td, padding: '5px 8px', fontSize: 11, fontWeight: key === focus ? 700 : 500, color: key === focus ? C.accent : C.txt2 }}>{cell(colLab, key, tk)}</td>)}
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>* came off the bench · the {SHORT[focus]} column is graded against tonight’s {oneSided ? 'Yes' : 'line toward the pick'}
          {' '}· REB CH / POT AST: stats.nba.com tracking{p.track?.through ? ` through ${shortDate(p.track.through)}` : ' (appears after the nightly Mac pull)'}
          {mate && <> · games {mate.name} sat (injury or rest) on this team, his last {M.PARAMS.WOWY_GAMES} games; “With” is the rest of that window</>}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {oneSided ? <DoubleDouble p={p} m={m} slate={slate} /> : <>
          <Why p={p} stat={focus} mu={mu} m={m} slate={slate} />
          <Ladder stat={focus} mu={mu} m={m} min={p.minutes} />
        </>}
        <Context p={p} advOpen={advOpen} saveAdvOpen={saveAdvOpen} />
        <Creation t={p.track} />
      </div>
    </div>
  );
}

function Why({ p, stat, mu, m, slate }) {
  const f = p.factors || {}; const R = p.rates || {};
  const per36 = (r) => (r == null ? '—' : (r * 36).toFixed(2));
  const defKey = stat === 'pra' ? 'def_pts' : `def_${stat}`;
  return (
    <div style={box}>
      <span style={h}>Why {num(mu, 2)} {M.STAT_LABEL[stat].toLowerCase()}</span>
      {kv('Projected minutes', num(p.minutes, 1))}
      {kv('  team-minutes squeeze', mult(f.minScale), multColor(f.minScale))}
      {f.wowyMin != null && kv('  who covers tonight’s absences (his splits)', `${signed(f.wowyMin, 1)} min`, f.wowyMin > 0 ? C.good : C.bad)}
      {f.b2b && kv('  back-to-back', mult(f.b2b), C.bad)}
      {stat === 'fg3m' ? (<>
        {kv(`3PA per 36 (fades ~${M.PARAMS.HL_FG3A} games)`, per36(R.fg3a))}
        {kv(`3P% (fades ~${M.PARAMS.HL_FG3P} games, shrunk)`, pct(R.fg3p, 1))}
        {kv('Projected 3PA', num(p.mu?.fg3a, 2))}
      </>) : stat === 'pra' ? (
        kv('PTS / REB / AST per 36', `${per36(R.pts)} / ${per36(R.reb)} / ${per36(R.ast)}`)
      ) : kv(`${M.STAT_LABEL[stat]} per 36`, per36(R[stat]))}
      {kv('Pace (game vs his team)', mult(f.pace), multColor(f.pace))}
      {kv(`Opponent (${p.opp}) allows`, mult(f[defKey]), multColor(f[defKey]))}
      {['pts', 'fg3m', 'ast', 'pra'].includes(stat) && kv('Teammates out (usage)', mult(f.usage), multColor(f.usage))}
      {m?.muMarket != null && kv('Market-implied mean', num(m.muMarket, 2), C.muted)}
      {m?.muBlend != null && kv(`Priced at (TRUST ${M.PARAMS.TRUST})`, num(m.muBlend, 2), C.accent)}
      <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
        Negative binomial, size k={M.PARAMS.NB_K[stat]}, mixed over the minutes he actually plays
        {minBand(p.minutes) && <> — {minBand(p.minutes)} in 10 of 12 cases</>}. Model {slate.modelVersion}.
      </div>
    </div>
  );
}

/**
 * The minutes the mixture actually prices, with the two extreme nodes of twelve
 * dropped: "24–33 min" says more about why a 29-minute projection prices wide
 * than a size-k footnote does.
 */
function minBand(min) {
  const q = M.minuteNodes(min);
  if (!q) return null;
  const s = q.slice().sort((a, b) => a - b);
  return `${(min * s[1]).toFixed(0)}–${(min * s[s.length - 2]).toFixed(0)} min`;
}

function Ladder({ stat, mu, m, min }) {
  // model.js priceLadder: every rung at the board's market-anchored mean, so the
  // main rung's Win % is the board's
  const L = M.priceLadder(mu, stat, m, M.PARAMS, min);
  if (!L) return <div style={box}><span style={h}>Ladder</span><div style={{ fontSize: 11, color: C.faint }}>No projection.</div></div>;
  const sl = L.side === 'over' ? 'O' : 'U';
  const evTxt = (ev) => (ev == null ? '—' : `${ev > 0 ? '+' : ''}${(100 * ev).toFixed(0)}%`);
  const b = L.best;
  return (
    <div style={box}>
      <span style={h}>Ladder · {m ? `${L.side} ${m.line}` : 'no line posted'}</span>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MON, fontSize: 11 }}>
        <thead><tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase' }}>
          <th style={{ textAlign: 'left' }}>Rung</th><th title="P(the rung hits) at the market-anchored mean">Win</th><th title="The market's own P at this rung, no vig">Mkt</th>
          <th title="The price at which this rung breaks even for the model — bet it only at this or better">Fair</th>
          <th title="Posted price, or ~ an estimate: the market's P at this rung with the main line's hold">Book</th><th title="EV per 1u at Book">EV</th>
        </tr></thead>
        <tbody>
          {L.rungs.map((r) => {
            const star = b && r.line === b.line;
            return (
              <tr key={r.line} style={{ background: star ? alpha(C.good, 0.12) : r.main ? alpha(C.accent, 0.08) : undefined }}>
                <td style={{ padding: '3px 2px', fontWeight: r.main || star ? 700 : 400, whiteSpace: 'nowrap' }}>{star ? '★ ' : ''}{sl} {r.line}</td>
                <td style={{ textAlign: 'center', color: r.pWin < M.LADDER_MIN_P ? C.faint : C.txt }}>{pct(r.pWin)}</td>
                <td style={{ textAlign: 'center', color: C.muted }}>{pct(r.pMkt)}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{am(r.fair)}</td>
                <td style={{ textAlign: 'center', color: C.txt2 }}>{r.posted != null ? am(r.posted) : r.est != null ? <span style={{ color: C.muted }}>~{am(r.est)}</span> : '—'}</td>
                <td style={{ textAlign: 'center', color: r.ev == null ? C.faintest : r.ev > 0 ? C.good : C.muted, fontWeight: star ? 700 : 400 }}>{evTxt(r.ev)}</td>
              </tr>);
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11, marginTop: 6, color: b ? C.txt : C.muted }}>
        {!m ? 'No line posted — Fair is the break-even price for each rung.'
          : !b ? <>No rung beats its price. {L.rungs.find((r) => r.main)?.ev > 0 ? '' : 'The model’s lean is too thin to ladder.'}</>
          : b.main ? <><b>Stay on the main line.</b> {sl} {b.line} is the best rung ({evTxt(b.ev)} EV at {am(b.posted ?? b.est)}); further out, the price catches up with the model.</>
          : <><b>{(b.line - m.line) * (L.side === 'over' ? 1 : -1) > 0 ? 'Ladder to' : 'Buy down to'} {sl} {b.line}</b> at {am(b.fair)} or better — the book should be near {am(b.posted ?? b.est)} ({evTxt(b.ev)} EV, wins {pct(b.pWin)}).</>}
      </div>
      {m && <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
        Main: over {am(m.overAm)} {BOOK_LABEL[m.overBook] || ''} · under {am(m.underAm)} {BOOK_LABEL[m.underBook] || ''} · {m.nBooks} books two-sided, hold {pct(L.hold, 1)}.
        {' '}~ = estimated (alt markets aren’t bought): the market’s P at that rung with the main line’s vig, loaded onto the longshot as Shin has it. A book can hold more on an alt rung, so judge a real price against Fair. Rungs under {pct(M.LADDER_MIN_P)} are never recommended.
        {m.pModel != null && <> Model alone gives the pick {pct(m.pModel, 1)}.</>}
      </div>}
    </div>
  );
}

/**
 * The double-double panel, in place of Why + Ladder: the three ways he gets
 * there, the model's P against the Yes price, and the descriptive upside from
 * his tracked chances (daily-predict ddUp).
 */
function DoubleDouble({ p, m, slate }) {
  const mu = p.mu || {}; const P = M.PARAMS;
  const at10 = (s) => (mu[s] > 0 ? M.probLine(mu[s], 9.5, s, P, p.minutes).over : null);
  const u = p.ddUp;
  const l10 = hitRate(p.log, 'dd', 0.5, 10), cur = hitRate(thisSeason(p.log, slate.date), 'dd', 0.5);
  return (
    <>
      <div style={box}>
        <span style={h}>Why {pct(mu.dd, 1)} for a double-double</span>
        {['pts', 'reb', 'ast'].map((s) => kv(`${M.STAT_LABEL[s]}: proj ${num(mu[s], 1)}`, `${pct(at10(s), 0)} to reach 10`))}
        {(at10('stl') > 0.01 || at10('blk') > 0.01) && kv('Steals / blocks to 10', `${pct(at10('stl'), 1)} / ${pct(at10('blk'), 1)}`)}
        {kv('Model P(double-double)', pct(mu.dd, 1), C.accent)}
        {kv('Last 10 · this season', `${sideCount(l10, 'over')} · ${sideCount(cur, 'over')}`)}
        <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
          Each stat’s law (negative binomial, mixed over the minutes he plays), any two of five reaching 10 — independent given his minutes, which carry nearly all the co-movement (scripts/dd-audit.mjs). Model {slate.modelVersion}.
        </div>
      </div>
      <div style={box}>
        <span style={h}>Price · Yes only</span>
        {m ? (<>
          {kv('Best Yes', `${am(m.overAm)} ${BOOK_LABEL[m.overBook] || ''}`)}
          {kv('Its own P (hold still in it)', pct(m.fairSide, 1))}
          {kv(`Win % (TRUST ${P.TRUST})`, pct(m.pSide, 1), C.accent)}
          {kv('Fair price, model', am(m.pModel > 0 && m.pModel < 1 ? M.probToAm(m.pModel) : null))}
          {kv('EV at the best Yes', m.ev == null ? '—' : `${(100 * m.ev).toFixed(1)}%`, m.ev > 0 ? C.good : C.bad)}
          {kv('Books posting', m.nBooks)}
        </>) : <div style={{ fontSize: 11, color: C.faint }}>No double-double price posted.</div>}
        {u && (<>
          <div style={{ height: 6 }} />
          {kv('Upside, from his chances', pct(u.p, 1), u.p > (m?.fairSide ?? 1) ? C.good : C.txt)}
          {kv('  rebounds his chances imply', `${num(u.reb, 1)} (${pct(u.cReb, 0)} of chances)`)}
          {kv('  assists his chances imply', `${num(u.ast, 1)} (${pct(u.cAst, 0)} of potential)`)}
        </>)}
        <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
          A No is never a lean: the books don’t post it. The gate scores the model against the Yes as priced, so a play has to beat the hold. Upside is descriptive — never the price or the gate.
        </div>
      </div>
    </>
  );
}

/**
 * Creation and rebounding, per game and exact (scripts/local/pull-nba-tracking-log.mjs).
 *
 * Potential assists are the passes that WOULD have been assists had the shot
 * dropped, and rebound chances are the boards he was in position for — so the
 * full bar is what he generated and the solid part is what survived his
 * teammates' shooting and the scrum. A man whose bars are tall and hollow is
 * creating at his usual rate and getting nothing for it; his assist line is a
 * bounce-back, not a decline. One whose bars have shrunk has actually lost the
 * role. The box score alone cannot tell those apart.
 */
const ord = (p) => { const n = Math.round(100 * p), v = n % 100; return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'}`; };

function Creation({ t }) {
  if (!t?.g?.length) return null;
  const I = TRACK_IX;
  const ast = t.g.map((r) => ({ date: r[I.date], chance: r[I.potAst], made: r[I.ast] }));
  const reb = t.g.map((r) => ({ date: r[I.date], chance: r[I.rebCh], made: r[I.reb] }));
  const lg = t.league;
  const row = (label, per, conv, convPctl, pctl, lgPer, lgConv) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, padding: '1px 0' }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontFamily: MON, color: C.txt }}>
        {num(per, 1)}<span style={{ color: C.faint }}> /g</span>
        {lgPer != null && <span style={{ color: C.faint }}> vs {num(lgPer, 1)}</span>}
        {conv != null && <> · <span style={{ color: lgConv == null ? C.txt : conv >= lgConv ? C.good : C.bad }}>{pct(conv, 0)}</span>
          <span style={{ color: C.faint }}> conv{convPctl != null ? ` (${ord(convPctl)})` : ''}</span></>}
        {pctl != null && <span style={{ color: C.faint }}> · {ord(pctl)} by volume</span>}
      </span>
    </div>
  );
  return (
    <div style={box}>
      <span style={h}>Creation &amp; rebounding</span>
      <div style={{ fontSize: 10, color: C.faint, marginBottom: 6 }}>
        Bar = chances created, solid = converted. Dashed line is the league rate. Last {t.g.length} games.
      </div>

      {row('Potential assists', t.potAst, t.astConv, t.pctl?.astConv, t.pctl?.potAst, lg?.potAst, lg?.astConv)}
      <ConvBars games={ast} avg={lg?.potAst ?? null} color="var(--accent)" />
      <PctlRail p={t.pctl?.potAst} color="var(--accent)" />

      <div style={{ height: 8 }} />
      {row('Rebound chances', t.rebCh, t.rebConv, t.pctl?.rebConv, t.pctl?.rebCh, lg?.rebCh, lg?.rebConv)}
      <ConvBars games={reb} avg={lg?.rebCh ?? null} color="var(--accent2)" />
      <PctlRail p={t.pctl?.rebCh} color="var(--accent2)" />

      <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
        stats.nba.com per-game tracking{t.through ? ` through ${shortDate(t.through)}` : ''} · {t.gp} gp
        {lg?.n ? ` · percentiles over ${lg.n} players with 3+ games` : ''} — descriptive; enters the model once validated.
      </div>
    </div>
  );
}

function Context({ p, advOpen, saveAdvOpen }) {
  return (
    <div style={box}>
      <span style={h}>Context</span>
      {p.darko ? (<>
        {kv('DARKO DPM (off / def)', `${num(p.darko.dpm, 1)} (${num(p.darko.o_dpm, 1)} / ${num(p.darko.d_dpm, 1)})`)}
        {kv('DARKO projected minutes', num(p.darko.minutes, 1))}
      </>) : <div style={{ fontSize: 11, color: C.faint }}>No DARKO row.</div>}
      {p.avg?.prev && kv('Last season', `${p.avg.prev.gp} gp · ${num(p.avg.prev.min, 1)} min · ${num(p.avg.prev.pts, 1)} pts`)}
      {p.adv ? (
        <details open={advOpen} onToggle={(e) => saveAdvOpen(e.currentTarget.open)} style={{ marginTop: 6 }}>
          <summary style={{ ...S.sectionLabel, cursor: 'pointer', listStyle: 'none', margin: '4px 0' }}>Advanced stats {advOpen ? '▴' : '▾'}</summary>
          {p.adv.usg != null && kv('Usage %', pct(p.adv.usg, 1))}
          {p.adv.ts != null && kv('True shooting', pct(p.adv.ts, 1))}
          {p.adv.cs_fg3a != null && kv('Catch-and-shoot 3PA / g', num(p.adv.cs_fg3a, 1))}
          {p.adv.pu_fg3a != null && kv('Pull-up 3PA / g', num(p.adv.pu_fg3a, 1))}
          {p.adv.deflections != null && kv('Deflections / g', num(p.adv.deflections, 1))}
          <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>stats.nba.com tracking{p.adv.season ? ` (${p.adv.season})` : ''} — descriptive; enters the model once validated.</div>
        </details>) : <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>stats.nba.com tracking appears after the nightly Mac pull.</div>}
    </div>
  );
}

