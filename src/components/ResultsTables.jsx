// "Results by day" (day × prop) and "Where is it winning?" — the ledger-tracking
// tables, after the NHL and NFL labs (2026-10-15). Both read nba_results()'
// aggregates, never rows; a click points the pick list at that slice.
import { useState } from 'react';
import { S, C, MON, alpha, goodBad, heat } from '../lib/theme.js';
import { BOOK_LABEL } from '../lib/markets.js';
import { TEAM_ID } from '../lib/teams.js';
import { pct, units, shortDate } from '../lib/format.js';
import { MARKETS, MARKET_LABEL, MARKET_SHORT, PROP_ORDER, GAME_MARKETS, BOOKS, SIDES, SIDE_LABEL, RECS, MIN_N, record, addRec, recOf, recStr } from '../lib/ledger.js';
import { Card, Pill, SortBtn, cmp, TeamLogo } from './ui.jsx';

const REC_LABEL = Object.fromEntries(RECS.map((r) => [r.key, r.label]));

/** Record / Hit / Units / ROI. Rates below MIN_N print uncolored; units are realized money and always color. */
function RecCells({ rc, divider }) {
  const d = divider ? { borderLeft: `1px solid ${C.line}` } : null;
  if (!rc.n) return <><td style={{ ...S.td, ...d, color: C.faintest }}>—</td><td style={{ ...S.td, color: C.faintest }}>—</td><td style={{ ...S.td, color: C.faintest }}>—</td><td style={{ ...S.td, color: C.faintest }}>—</td></>;
  return (<>
    <td style={{ ...S.td, ...d }}>{recStr(rc)}</td>
    <td style={S.td}>{pct(rc.hit, 1)}</td>
    <td style={{ ...S.td, color: goodBad(rc.units), fontWeight: 700 }}>{units(rc.units)}</td>
    <td style={{ ...S.td, color: rc.n < MIN_N ? C.txt2 : goodBad(rc.roi) }}>{pct(rc.roi, 1)}</td>
  </>);
}
const recVal = (pre, get) => ({ [`${pre}Rec`]: (x) => get(x).n || null, [`${pre}Hit`]: (x) => get(x).hit, [`${pre}U`]: (x) => (get(x).n ? get(x).units : null), [`${pre}Roi`]: (x) => get(x).roi });

function useSort(initial) {
  const [sort, setSort] = useState(initial);
  const onSort = (col) => setSort((s) => ({ col, dir: s.col === col ? (s.dir === 'desc' ? 'asc' : 'desc') : col === 'key' || col === 'date' ? 'asc' : 'desc' }));
  return [sort, onSort];
}
function RecHeads({ pre, sort, onSort, divider }) {
  const th = (col, label, title, first) => <th style={{ ...S.th, ...(first && divider ? { borderLeft: `1px solid ${C.line}` } : null) }}><SortBtn col={`${pre}${col}`} sort={sort} onSort={onSort} title={title}>{label}</SortBtn></th>;
  return <>{th('Rec', 'Record', 'Won–lost(–push), voids left out', true)}{th('Hit', 'Hit')}{th('U', 'Units', '1u flat at the best price')}{th('Roi', 'ROI')}</>;
}

// ── Where is it winning? ────────────────────────────────────────────────────
// EVERY group listed, empty ones too: a table that only listed what had plays
// read as one that only listed the winners.
const SPLITS = [
  { key: 'market', label: 'Market', every: () => MARKETS, name: (k) => MARKET_LABEL[k] || k, rank: (k) => MARKETS.indexOf(k) },
  { key: 'side', label: 'Side', every: () => SIDES, name: (k) => SIDE_LABEL[k] || k, rank: (k) => SIDES.indexOf(k) },
  { key: 'book', label: 'Book', every: () => BOOKS, name: (k) => (k === '?' ? 'not recorded' : BOOK_LABEL[k] || k) },
  { key: 'team', label: 'Team', every: () => Object.keys(TEAM_ID), name: (k) => k },
];

export function Breakdown({ results, pick, onPick }) {
  const [splitKey, setSplit] = useState('market');
  const [rec, setRec] = useState('official');
  const [sort, onSort] = useSort({ col: 'key', dir: 'asc' });
  const split = SPLITS.find((s) => s.key === splitKey);
  const groups = new Map(split.every().map((k) => [k, record(null)]));
  for (const a of results.breakdown || []) if (a[0] === rec && a[1] === split.key) groups.set(a[2], recOf(a, 3));
  const VAL = { key: (x) => (split.rank ? split.rank(x.key) : x.key), ...recVal('g', (x) => x.rc) };
  const list = [...groups].map(([key, rc]) => ({ key, rc })).sort((a, b) => cmp(VAL[sort.col](a), VAL[sort.col](b), sort.dir) || (a.key < b.key ? -1 : 1));

  return (
    <Card title="Where is it winning?" flush right={<div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {SPLITS.map((s) => <Pill key={s.key} size="chip" active={s.key === splitKey} onClick={() => setSplit(s.key)}>{s.label}</Pill>)}
    </div>}>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', padding: '8px 12px 0' }}>
        {RECS.map((r) => <Pill key={r.key} size="chip" active={r.key === rec} onClick={() => setRec(r.key)} title={r.title}>{r.label}</Pill>)}
      </div>
      <div style={{ fontSize: 10, color: C.faint, padding: '6px 12px' }}>Every group is listed, empty ones too. Click a row to show its picks below.</div>
      <div style={{ ...S.tblWrap, maxHeight: 420, overflowY: 'auto' }}><table style={S.tbl}>
        <thead><tr><th style={S.thLeft}><SortBtn col="key" sort={sort} onSort={onSort} align="left">{split.label}</SortBtn></th><RecHeads pre="g" sort={sort} onSort={onSort} /></tr></thead>
        <tbody>{list.map((x) => {
          const on = pick[split.key] === x.key;
          return (
            <tr key={x.key} className="row-hover" style={{ cursor: 'pointer', background: on ? alpha(C.accent, 0.08) : undefined }}
              title={on ? 'Remove this filter from the pick list' : 'Show these picks'} onClick={() => onPick(split.key, x.key, rec)}>
              <td style={S.tdLeft}>{split.key === 'team'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TeamLogo tri={x.key} size={16} />{x.key}</span>
                : split.name(x.key)}</td>
              <RecCells rc={x.rc} />
            </tr>);
        })}</tbody>
      </table></div>
    </Card>
  );
}

// ── Results by day × prop ───────────────────────────────────────────────────
// One row per graded day, one cell per market (board order), in the record the
// page's pills pick. A cell points the pick list at that day × market; the date
// points it at the whole day. The running total is that record's units.
const GRID_MARKETS = [...PROP_ORDER, ...GAME_MARKETS];
const DAY_CAP = 14;
const TIER_KEY = { official: 'off', qualifying: 'q', 'all priced': 'all' };

function GridCell({ rc, onClick, title, strong }) {
  if (!rc.n) return <td style={{ ...S.td, color: C.faintest, padding: '6px 6px' }}>·</td>;
  return (
    <td className="row-hover" onClick={onClick} title={title} style={{ ...S.td, padding: '5px 6px', cursor: 'pointer', lineHeight: 1.25,
      background: rc.n >= 3 ? heat(rc.hit, rc.n < 10) : undefined, fontWeight: strong ? 700 : 400 }}>
      <div style={{ fontSize: 11 }}>{recStr(rc)}</div>
      <div style={{ fontSize: 9, color: goodBad(rc.units), fontWeight: 700 }}>{units(rc.units)}</div>
    </td>
  );
}

export function DayGrid({ results, tier, onDrill }) {
  const [all, setAll] = useState(false);
  const key = TIER_KEY[tier];
  const byDM = new Map();
  for (const a of results.dayMarket || []) if (a[2] === tier) byDM.set(`${a[0]}|${a[1]}`, recOf(a, 3));
  let run = 0;
  const season = Object.fromEntries(GRID_MARKETS.map((m) => [m, record(null)]));
  const days = (results.byDay || []).slice().sort((a, b) => (a.game_date < b.game_date ? -1 : 1)).map((d) => {
    const tot = record(d[key]); run += tot.units;
    const cells = Object.fromEntries(GRID_MARKETS.map((m) => { const rc = byDM.get(`${d.game_date}|${m}`) || record(null); season[m] = record(addRec(season[m], rc)); return [m, rc]; }));
    return { date: d.game_date, tot, cells, run };
  }).reverse();
  const shown = all ? days : days.slice(0, DAY_CAP);
  const seasonTot = days.reduce((t, d) => record(addRec(t, d.tot)), record(null));
  const dayLabel = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${d.toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' })} ${shortDate(iso)}`; };

  return (
    <Card title="Results by day" meta={`${REC_LABEL[tier]} · click a cell for its picks`} flush>
      <div style={S.tblWrap}><table style={S.tbl}>
        <thead><tr>
          <th style={S.thLeft}>Day</th>
          <th style={{ ...S.th, borderRight: `1px solid ${C.line}` }}>All</th>
          {GRID_MARKETS.map((m) => <th key={m} style={{ ...S.th, padding: '8px 6px', ...(m === GAME_MARKETS[0] ? { borderLeft: `1px solid ${C.line}` } : null) }}>{MARKET_SHORT[m]}</th>)}
          <th style={{ ...S.th, borderLeft: `1px solid ${C.line}` }} title={`${REC_LABEL[tier]} units through that day`}>Running</th>
        </tr></thead>
        <tbody>
          {!shown.length && <tr><td colSpan={GRID_MARKETS.length + 3} style={{ ...S.td, color: C.muted, padding: 18 }}>No graded days yet.</td></tr>}
          {shown.map((x) => (
            <tr key={x.date}>
              <td className="row-hover" onClick={() => onDrill(x.date, null)} title={`Show every ${shortDate(x.date)} pick`} style={{ ...S.tdLeft, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: MON, fontSize: 11 }}>{dayLabel(x.date)}</td>
              <GridCell rc={x.tot} strong onClick={() => onDrill(x.date, null)} title={`Every ${shortDate(x.date)} pick`} />
              {GRID_MARKETS.map((m) => <GridCell key={m} rc={x.cells[m]} onClick={() => onDrill(x.date, m)} title={`${shortDate(x.date)} · ${MARKET_LABEL[m]} picks`} />)}
              <td style={{ ...S.td, borderLeft: `1px solid ${C.line}`, color: goodBad(x.run), fontWeight: 700 }}>{units(x.run)}</td>
            </tr>
          ))}
          <tr style={{ background: alpha(C.deep, 0.35) }}>
            <td style={{ ...S.tdLeft, fontWeight: 700 }}>Season</td>
            <GridCell rc={seasonTot} strong onClick={() => onDrill(null, null)} title="Every pick" />
            {GRID_MARKETS.map((m) => <GridCell key={m} rc={season[m]} strong onClick={() => onDrill(null, m)} title={`Every ${MARKET_LABEL[m]} pick`} />)}
            <td style={{ ...S.td, borderLeft: `1px solid ${C.line}`, color: goodBad(seasonTot.units), fontWeight: 700 }}>{units(seasonTot.units)}</td>
          </tr>
        </tbody>
      </table></div>
      {days.length > DAY_CAP && <div style={{ padding: 8, textAlign: 'center' }}>
        <button style={S.btnGhost} onClick={() => setAll((v) => !v)}>{all ? `Show the last ${DAY_CAP} days` : `Show all ${days.length} days`}</button>
      </div>}
    </Card>
  );
}
