// Tonight's card: every row that clears the score-space gate is an official
// play. Each row opens the same player panel as the board. Below: the near
// misses (clear the edge band and the price, held back by games played or
// minutes — NOT plays) and each market's standing (probation → proven), from
// scripts/review-gates.mjs' rule — a track record, not a filter on the card.
import { useMemo, useState, Fragment } from 'react';
import { S, C, MON, alpha, heat, goodBad } from '../lib/theme.js';
import { STAT_LABEL, GATES, MODEL_VERSION, ONE_SIDED } from '../lib/model.js';
import { BOOK_PREF, BOOK_LABEL } from '../lib/markets.js';
import { pct, num, signed, units, tipTime } from '../lib/format.js';
import { agreesWithProj, projDiff, MARKETS, MARKET_LABEL, MARKET_SHORT, PROP_ORDER } from '../lib/ledger.js';
import { logVal, hitRate, thisSeason, sideRate, sideCount } from '../lib/gamelog.js';
import { Card, Pill, SortBtn, StickyTable, cmp, Headshot, PosTag, InjTag, VsProjTag, PickPill, StatusTag, Stat, Spark, Empty } from './ui.jsx';
import PlayerPanel from './PlayerPanel.jsx';
import { OddsCell } from './OddsCell.jsx';

const PROMOTE_N = 150; // scripts/review-gates.mjs: n ≥ 150, ROI ≥ +3%, CLV ≥ 0
const NEAR_CAP = 25;   // opening week the games-played rule holds back nearly every in-band row

// The board's columns (Board.jsx), plus Tip and the market on the pick since
// the card mixes markets; every labelled column sorts. Default: official, then edge.
function PlayTable({ list, slate, open, setOpen }) {
  const [sort, setSort] = useState({ col: 'rank', dir: 'desc' });
  const onSort = (col) => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  const tipOf = (p) => slate.games.find((x) => x.gid === p.gid);
  const rows = useMemo(() => list.map(({ p, stat, m }) => ({
    p, stat, m, g: tipOf(p), line: m.line, proj: p.mu[stat],
    l5: hitRate(p.log, stat, m.line, 5), l10: hitRate(p.log, stat, m.line, 10), szn: hitRate(thisSeason(p.log, slate.date), stat, m.line),
  })), [list, slate]);
  const VAL = {
    name: (r) => r.p.name, tip: (r) => (r.g?.tipUTC ? Date.parse(r.g.tipUTC) : null), min: (r) => r.p.minutes, proj: (r) => r.proj, line: (r) => r.line,
    diff: (r) => { const d = projDiff(r); return d == null ? null : Math.abs(d); },
    pick: (r) => `${MARKET_SHORT[r.stat]} ${r.m.side}`, model: (r) => r.m.pSide, edge: (r) => r.m.score, ev: (r) => r.m.ev,
    l5: (r) => sideRate(r.l5, r.m.side), l10: (r) => sideRate(r.l10, r.m.side), szn: (r) => sideRate(r.szn, r.m.side),
    rank: (r) => (r.m.official ? 10 : 0) + (r.m.score ?? -5),
    ...Object.fromEntries(BOOK_PREF.map((b) => [b, (r) => { const q2 = r.m.books?.[b]; return q2 ? (r.m.side === 'under' ? q2.under : q2.over) : null; }])),
  };
  const sorted = rows.slice().sort((a, b) => cmp(VAL[sort.col](a), VAL[sort.col](b), sort.dir));
  const th = (col, label, title, left) => (
    <th style={left ? S.thLeft : S.th}><SortBtn col={col} sort={sort} onSort={onSort} align={left ? 'left' : 'center'} title={title}>{label}</SortBtn></th>
  );
  const rateCell = (h, sd, weakN) => {
    const r = sideRate(h, sd);
    return <td style={{ ...S.td, background: heat(r, !h || h.n < weakN) }}>{h ? sideCount(h, sd) : <span style={{ color: C.faintest }}>—</span>}</td>;
  };
  const COLS = 15 + BOOK_PREF.length;
  return (
    <StickyTable head={<tr>
      {th('name', 'Player', null, true)}
      {th('tip', 'Tip', 'Tip-off (ET)')}
      {th('min', 'Min', 'Projected minutes')}
      {th('proj', 'Proj', 'Model mean')}
      {th('line', 'Line', 'Consensus main line')}
      {th('diff', 'Diff', 'Projection − line (% of the line beneath). Sorts by size either way: biggest gap over or under first')}
      {th('pick', 'Pick', 'Market and the side the model takes against the market')}
      {th('model', 'Win %', 'Probability of the pick at the market-anchored mean (model.js TRUST); the no-vig market beneath')}
      {th('edge', 'Edge', 'Gate score: ln(model mean / market-implied mean), toward the pick. The gate wants 0.06–0.30')}
      {th('ev', 'EV', 'Per 1u at the best price on the pick')}
      {BOOK_PREF.map((b) => <Fragment key={b}>{th(b, BOOK_LABEL[b], `${BOOK_LABEL[b]} price on the pick (best price bold)`)}</Fragment>)}
      {th('l5', 'L5', 'Last 5 games the pick would have hit')}
      {th('l10', 'L10', 'Last 10 games the pick would have hit')}
      {th('szn', 'Szn', 'Games this season the pick would have hit')}
      <th style={S.th} title="Last 10 games, colored by the pick against tonight's line">Last 10</th>
      {th('rank', 'Status', 'Official first, then edge')}
    </tr>}>
      {sorted.map((r) => {
        const { p, stat, m, g } = r;
        const k = `${p.pid}|${stat}`; const isOpen = open === k;
        const oneSided = ONE_SIDED.has(stat); const diff = projDiff(r);
        return (
          <Fragment key={k}>
            <tr className="row-hover" style={{ cursor: 'pointer', background: isOpen ? alpha(C.accent, 0.05) : undefined }} onClick={() => setOpen(isOpen ? null : k)}>
              <td style={{ ...S.tdLeft, boxShadow: `inset 3px 0 0 ${m.official ? C.good : C.purple}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Headshot pid={p.pid} name={p.name} team={p.team} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{p.name} <InjTag inj={p.inj} /></div>
                    <div style={{ fontSize: 10, color: C.faint, display: 'flex', gap: 5, alignItems: 'center', whiteSpace: 'nowrap' }}>
                      <PosTag grp={p.grp} />{p.team} {p.home ? 'vs' : '@'} {p.opp}
                    </div>
                  </div>
                </div>
              </td>
              <td style={{ ...S.td, color: C.muted, fontSize: 11 }}>{g?.started ? 'started' : tipTime(g?.tipUTC)}</td>
              <td style={S.td}>{num(p.minutes, 1)}</td>
              <td style={{ ...S.td, fontWeight: 700 }}>{oneSided ? pct(r.proj, 1) : num(r.proj, 2)}</td>
              <td style={{ ...S.td, fontWeight: 600 }}>{oneSided ? 'Yes' : r.line ?? '—'}</td>
              <td style={{ ...S.td, lineHeight: 1.2 }}>
                {diff == null ? <span style={{ color: C.faintest }}>—</span> : oneSided ? (
                  <div style={{ fontWeight: 700, color: diff > 0 ? C.good : C.bad }}>{signed(100 * diff, 1)}pp</div>
                ) : <>
                  <div style={{ fontWeight: 700, color: diff > 0 ? C.good : diff < 0 ? C.bad : C.txt2 }}>{signed(diff, 2)}</div>
                  {r.line > 0 && <div style={{ fontSize: 9, color: C.faint }}>{signed(100 * diff / r.line, 0)}%</div>}
                </>}
              </td>
              <td style={S.td}><span style={{ fontSize: 10, color: C.muted, marginRight: 5 }}>{MARKET_SHORT[stat]}</span><PickPill side={m.side} line={m.line} stat={stat} />
                {!agreesWithProj({ prob: m.pModel ?? m.pSide, stat }) && <VsProjTag />}</td>
              <td style={{ ...S.td, lineHeight: 1.2 }}><div>{pct(m.pSide, 1)}</div><div style={{ fontSize: 9, color: C.faint }}>{oneSided ? 'price' : 'mkt'} {pct(m.fairSide, 1)}</div></td>
              <td style={{ ...S.td, fontWeight: 700, color: C.purple }}>{signed(m.score, 3)}</td>
              <td style={{ ...S.td, color: m.ev == null ? C.faint : m.ev > 0 ? C.good : C.bad }}>{m.ev == null ? '—' : `${(100 * m.ev).toFixed(1)}%`}</td>
              {BOOK_PREF.map((b) => {
                const q2 = m.books?.[b]; const price = q2 ? (m.side === 'under' ? q2.under : q2.over) : null;
                const best = price != null && price === (m.side === 'under' ? m.underAm : m.overAm);
                return <td key={b} style={S.td}><OddsCell price={price} url={q2?.url} book={b} best={best} /></td>;
              })}
              {rateCell(r.l5, m.side, 5)}
              {rateCell(r.l10, m.side, 8)}
              {rateCell(r.szn, m.side, 5)}
              <td style={S.td}><Spark values={p.log.slice(-10).map((x) => logVal(x, stat))} line={r.line} side={m.side} width={64} height={18} /></td>
              <td style={S.td}><StatusTag m={m} /></td>
            </tr>
            {isOpen && <tr><td colSpan={COLS} style={{ padding: 0, background: C.inset, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ position: 'sticky', left: 0, width: 'min(1368px, calc(100vw - 34px))' }}><PlayerPanel p={p} stat={stat} slate={slate} onClose={() => setOpen(null)} /></div>
            </td></tr>}
          </Fragment>);
      })}
    </StickyTable>
  );
}

export default function Plays({ slate, results }) {
  const [mkt, setMkt] = useState('all');
  const [open, setOpen] = useState(null);
  const rows = [], near = [];
  for (const p of slate.players) for (const [stat, m] of Object.entries(p.markets || {})) {
    if (!m || m.score == null) continue;
    if (m.qualifies) rows.push({ p, stat, m });
    else if (/GP this season|proj min/.test(m.reason || '') && m.score >= GATES.band.min && m.score <= GATES.band.max) near.push({ p, stat, m });
  }
  const byEdge = (a, b) => (b.m.official - a.m.official) || b.m.score - a.m.score;
  const shown = rows.filter((r) => mkt === 'all' || r.stat === mkt).sort(byEdge);
  const nearAll = near.filter((r) => mkt === 'all' || r.stat === mkt).sort(byEdge);
  const nearShown = nearAll.slice(0, NEAR_CAP);
  const count = (s) => rows.filter((r) => r.stat === s).length;
  const gameLeans = slate.games.reduce((t, g) => t + ['spread', 'total', 'ml'].filter((k) => g.price?.[k] && g.market?.[k]).length, 0);
  const provenMarkets = Object.values(GATES.markets).filter((v) => v === 'official').length;
  const standing = (st) => (st === 'official' ? 'proven' : st);
  const q = Object.fromEntries((results?.byMarket || []).filter((r) => r.tier === 'qualifying').map((r) => [r.stat, r]));

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="Official plays tonight" value={rows.length} sub="every play that clears the gate" color={C.good} />
        <Stat label="Near misses" value={near.length} sub="edge in band, held back by GP / minutes" />
        <Stat label="Games" value={slate.games.length} sub={`${gameLeans} game-line leans on the Games tab`} />
        <Stat label="Proven markets" value={`${provenMarkets} / ${Object.keys(GATES.markets).length}`} sub={`a market is proven at ${PROMOTE_N} graded plays, ROI ≥ +3%`} />
      </div>

      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
        <Pill size="chip" active={mkt === 'all'} onClick={() => setMkt('all')}>All {rows.length}</Pill>
        {PROP_ORDER.map((s) => <Pill key={s} size="chip" active={mkt === s} onClick={() => setMkt(s)}>{MARKET_SHORT[s]} {count(s)}</Pill>)}
      </div>

      <Card style={{ overflow: 'clip' }} title="Tonight's plays" meta={`${shown.length} · edge ${GATES.band.min}–${GATES.band.max} · price ${GATES.price.min} to +${GATES.price.max} · ≥${GATES.minGpSeason} GP · ≥${GATES.minMinutes} min · click a row for his game log`} flush>
        {shown.length ? <PlayTable list={shown} slate={slate} open={open} setOpen={setOpen} /> : <div style={{ padding: 16, fontSize: 12, color: C.muted }}>
          Nothing clears the gate{mkt === 'all' ? '' : ` in ${STAT_LABEL[mkt]}`} yet — lines post through the day{near.length ? ', and early in the season most edges are held back by the games-played rule (see the near misses below)' : ''}.
        </div>}
      </Card>

      {nearShown.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ ...S.card, marginBottom: 0, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, listStyle: 'none' }}>
            Near misses · {nearAll.length > NEAR_CAP ? `top ${NEAR_CAP} of ${nearAll.length}` : nearAll.length} <span style={{ fontSize: 10, color: C.faint, fontWeight: 400, fontFamily: MON }}>not plays — clear the edge band and the price, held back by games played or projected minutes ▾</span>
          </summary>
          <div style={{ ...S.card, borderTop: 'none', borderRadius: '0 0 10px 10px' }}><PlayTable list={nearShown} slate={slate} open={open} setOpen={setOpen} /></div>
        </details>
      )}

      <Card title="Market standing" meta={`graded gate plays · promotion counts ${MODEL_VERSION} rows only (weekly review)`} flush>
        <div style={S.tblWrap}><table style={S.tbl}>
          <thead><tr>{['Market', 'Standing', 'Graded gate plays', 'Record', 'ROI', 'Units', 'Tonight'].map((h, i) => <th key={h} style={i ? S.th : S.thLeft}>{h}</th>)}</tr></thead>
          <tbody>{MARKETS.map((k) => {
            const r = q[k]; const st = GATES.markets[k]; const n = r?.n || 0; const frac = Math.min(1, n / PROMOTE_N);
            const tonight = ['spread', 'total', 'ml'].includes(k) ? '—' : count(k);
            return (
              <tr key={k}>
                <td style={S.tdLeft}>{MARKET_LABEL[k]}</td>
                <td style={S.td}><span style={S.tag(alpha(st === 'official' ? C.good : C.purple, 0.15), st === 'official' ? C.good : C.purple)}>{standing(st)}</span></td>
                <td style={{ ...S.td, minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: alpha(C.deep, 0.8), overflow: 'hidden' }}>
                      <div style={{ width: `${100 * frac}%`, height: '100%', background: st === 'official' ? C.good : C.purple }} /></div>
                    <span style={{ fontSize: 11 }}>{n} / {PROMOTE_N}</span>
                  </div>
                </td>
                <td style={S.td}>{r ? `${r.w}-${r.l}${r.p ? `-${r.p}` : ''}` : '—'}</td>
                <td style={{ ...S.td, color: r ? goodBad(Number(r.roi)) : C.faint }}>{r ? pct(Number(r.roi), 1) : '—'}</td>
                <td style={{ ...S.td, color: r ? goodBad(Number(r.units)) : C.faint, fontWeight: 700 }}>{r ? units(Number(r.units)) : '—'}</td>
                <td style={S.td}>{tonight}</td>
              </tr>);
          })}</tbody>
        </table></div>
        <div style={{ fontSize: 10, color: C.faint, padding: '8px 12px' }}>
          A market is marked proven at {PROMOTE_N} graded gate plays with ROI ≥ +3% and closing-line value ≥ 0, and back to probation if its last {PROMOTE_N} run ROI ≤ −5%. Every gate play is on the official card either way — the standing is the market's track record, not a filter.
        </div>
      </Card>
      {!slate.players.length && <Empty>No slate.</Empty>}
    </div>
  );
}
