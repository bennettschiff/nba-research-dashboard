// The props board: ONE market at a time (a table mixing markets is not
// comparable top to bottom), the same three books on every market so the price
// columns never move, and every labelled column sorts. Tonight's games run
// across the top; the plays that clear the gate lead the table.
import { useMemo, useState, Fragment } from 'react';
import { S, C, MON, alpha, heat } from '../lib/theme.js';
import { STATS, STAT_LABEL, ONE_SIDED, amToProb } from '../lib/model.js';
import { BOOK_PREF, BOOK_LABEL } from '../lib/markets.js';
import { pct, num, signed, am } from '../lib/format.js';
import { agreesWithProj, projDiff, PROP_ORDER as STAT_ORDER, MARKET_SHORT as SHORT } from '../lib/ledger.js';
import { logVal, hitRate, thisSeason, sideRate, sideCount } from '../lib/gamelog.js';
import { Card, Pill, SortBtn, StickyTable, cmp, Headshot, PosTag, InjTag, StatusTag, Spark, VsProjTag, PickPill, Empty } from './ui.jsx';
import SlateStrip from './SlateStrip.jsx';
import PlayerPanel from './PlayerPanel.jsx';
import { OddsCell } from './OddsCell.jsx';

const tierOf = (m) => (!m || m.score == null ? 0 : m.official ? 6 : m.qualifies ? 5 : /below band/.test(m.reason) ? 2 : /above band/.test(m.reason) ? 1 : 3);

// Double-double upside: the longshots worth a look are the Yes priced at +150
// or longer whose CHANCES (rebound chances, potential assists — daily-predict's
// `ddUp`, tracking.js chanceMeans) say more than the price does. Descriptive:
// the gate and the price never read it.
const LONGSHOT_AM = 150;
const upsideFlag = (p, m) => p.ddUp?.p != null && m?.overAm != null && m.overAm >= LONGSHOT_AM && p.ddUp.p > amToProb(m.overAm);

export default function Board({ slate, onPlays }) {
  const [stat, setStat] = useState('fg3m');
  const [game, setGame] = useState('all');
  const [q, setQ] = useState('');
  const [pricedOnly, setPricedOnly] = useState(true);
  const [playsOnly, setPlaysOnly] = useState(false);
  const [hideStarted, setHideStarted] = useState(false);
  const [longOnly, setLongOnly] = useState(false); // double-double: Yes at +150 or longer
  const oneSided = ONE_SIDED.has(stat);
  const [sort, setSort] = useState({ col: 'rank', dir: 'desc' });
  const [open, setOpen] = useState(null);
  const onSort = (col) => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  // plays per market tonight, for the prop pills and the banner
  const playsBy = useMemo(() => {
    const out = {}; for (const p of slate.players) for (const [k, m] of Object.entries(p.markets || {})) if (m?.qualifies) out[k] = (out[k] || 0) + 1;
    return out;
  }, [slate]);
  const totalPlays = Object.values(playsBy).reduce((a, b) => a + b, 0);

  const startedGids = useMemo(() => new Set(slate.games.filter((g) => g.started).map((g) => g.gid)), [slate]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return slate.players
      .filter((p) => p.mu && p.playProb > 0)
      .filter((p) => !hideStarted || !startedGids.has(p.gid))
      .filter((p) => game === 'all' || p.gid === game)
      .filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.team.toLowerCase() === ql || p.opp.toLowerCase() === ql)
      .map((p) => {
        const m = p.markets?.[stat] || null;
        const line = m?.line ?? null;
        return { p, m, line, proj: p.mu[stat], l5: hitRate(p.log, stat, line, 5), l10: hitRate(p.log, stat, line, 10), szn: hitRate(thisSeason(p.log, slate.date), stat, line) };
      })
      .filter((r) => !pricedOnly || r.m)
      .filter((r) => !playsOnly || r.m?.qualifies)
      .filter((r) => !(oneSided && longOnly) || r.m?.overAm >= LONGSHOT_AM);
  }, [slate, stat, game, q, pricedOnly, playsOnly, hideStarted, startedGids, oneSided, longOnly]);

  const side = (r) => r.m?.side || 'over';
  const VAL = {
    name: (r) => r.p.name, min: (r) => r.p.minutes, proj: (r) => r.proj, line: (r) => r.line,
    // size of the disagreement either way, so ▼ puts the furthest-off lines first
    diff: (r) => { const d = projDiff({ stat, ...r }); return d == null ? null : Math.abs(d); },
    upside: (r) => r.p.ddUp?.p ?? null,
    model: (r) => r.m?.pSide, edge: (r) => r.m?.score, ev: (r) => r.m?.ev,
    l5: (r) => sideRate(r.l5, side(r)), l10: (r) => sideRate(r.l10, side(r)), szn: (r) => sideRate(r.szn, side(r)),
    // official → play → near miss (in band, held by GP / minutes / price) → small
    // edge → edge too big (usually news) → unpriced; edge within each
    rank: (r) => tierOf(r.m) * 10 + (r.m?.score ?? -5),
    ...Object.fromEntries(BOOK_PREF.map((b) => [b, (r) => { const q2 = r.m?.books?.[b]; return q2 ? (r.m.side === 'under' ? q2.under : q2.over) : null; }])),
  };
  const sorted = rows.slice().sort((a, b) => cmp(VAL[sort.col](a), VAL[sort.col](b), sort.dir));
  const plays = rows.filter((r) => r.m?.qualifies).length;

  const th = (col, label, title, left) => (
    <th style={left ? S.thLeft : S.th}><SortBtn col={col} sort={sort} onSort={onSort} align={left ? 'left' : 'center'} title={title}>{label}</SortBtn></th>
  );
  const rateCell = (h, sd, weakN) => {
    const r = sideRate(h, sd);
    return <td style={{ ...S.td, background: heat(r, !h || h.n < weakN) }}>{h ? sideCount(h, sd) : <span style={{ color: C.faintest }}>—</span>}</td>;
  };
  const COLS = 14 + BOOK_PREF.length + (oneSided ? 1 : 0);

  return (
    <div className="fade-in">
      <SlateStrip slate={slate} game={game} setGame={(g) => { setGame(g); setOpen(null); }} />

      {totalPlays > 0 && (
        <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap', borderColor: alpha(C.purple, 0.4), background: alpha(C.purple, 0.05) }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: C.purple }}>{totalPlays} prop play{totalPlays > 1 ? 's' : ''} tonight</span>
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STAT_ORDER.filter((s) => playsBy[s]).map((s) => <Pill key={s} size="chip" active={stat === s && playsOnly} onClick={() => { setStat(s); setPlaysOnly(true); setOpen(null); }}>{SHORT[s]} {playsBy[s]}</Pill>)}
          </span>
          <span style={{ flex: 1 }} />
          {onPlays && <button style={S.btn} onClick={onPlays}>Open the card →</button>}
        </div>
      )}

      <div style={S.filterBar}>
        <div>
          <div style={S.filterLabel}>Prop</div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {STAT_ORDER.map((s) => <Pill key={s} active={stat === s} onClick={() => { setStat(s); setOpen(null); }}>
              {SHORT[s]}{playsBy[s] ? <span style={{ color: C.purple, marginLeft: 4 }}>{playsBy[s]}</span> : null}</Pill>)}
          </div>
        </div>
        <div>
          <div style={S.filterLabel}>Game</div>
          <select style={S.select} value={game} onChange={(e) => { setGame(e.target.value); setOpen(null); }}>
            <option value="all">All games ({slate.games.length})</option>
            {slate.games.map((g) => <option key={g.gid} value={g.gid}>{g.away} @ {g.home}{g.started ? ' · started' : ''}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={S.filterLabel}>Search</div>
          <input style={{ ...S.searchIn, width: '100%' }} placeholder="Player or team (e.g. BOS)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Pill active={pricedOnly} onClick={() => setPricedOnly((v) => !v)} title="Only rows with a posted line">Has line</Pill>
          <Pill active={playsOnly} onClick={() => setPlaysOnly((v) => !v)} title="Only rows that clear the gate">Plays only</Pill>
          <Pill active={hideStarted} onClick={() => { setHideStarted((v) => !v); setOpen(null); }} title="Hide players whose game has already tipped off">Hide started{startedGids.size ? ` (${startedGids.size})` : ''}</Pill>
          {oneSided && <Pill active={longOnly} onClick={() => setLongOnly((v) => !v)} title={`Only Yes prices of +${LONGSHOT_AM} or longer`}>+{LONGSHOT_AM} &amp; up</Pill>}
        </div>
      </div>

      <Card flush style={{ overflow: 'clip' }} title={`${STAT_LABEL[stat]} · ${slate.date}`} meta={`${sorted.length} players · ${plays} play${plays === 1 ? '' : 's'} · click a player for his game log`}>
        {!sorted.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 12 }}>
            {playsOnly ? 'Nothing in this market clears the gate tonight.' : hideStarted && startedGids.size ? 'Nothing left once started games are hidden. Turn off “Hide started” to see them.' : pricedOnly ? 'No lines posted for this market yet — books post NBA props through the day. Turn off “Has line” to see every projection.' : 'No players match.'}
          </div>
        ) : (
          <StickyTable head={<tr>
            {th('name', 'Player', null, true)}
            {th('min', 'Min', 'Projected minutes')}
            {th('proj', 'Proj', oneSided ? 'Model P(double-double): pts / reb / ast / stl / blk on his projected means, mixed over his minutes' : 'Model mean')}
            {oneSided && th('upside', 'DD Upside', `P(double-double) at the rebounds and assists his rebound chances and potential assists say he should have (conversion shrunk to the league's), at tonight's minutes. ▲ = Yes at +${LONGSHOT_AM} or longer that this beats. Descriptive — not in the price or the gate`)}
            {th('line', 'Line', oneSided ? 'Books post the Yes only' : 'Consensus main line')}
            {th('diff', 'Diff', oneSided ? 'Model P(Yes) − the best Yes price’s own P (hold still in it), in points' : 'Projection − line (% of the line beneath). Sorts by size either way: biggest gap over or under first')}
            <th style={S.th} title="The side the model takes against the market">Pick</th>
            {th('model', 'Win %', oneSided ? 'P(Yes) at the market-anchored scale (model.js TRUST); the best Yes price’s own P beneath' : 'Probability of the pick at the market-anchored mean (model.js TRUST); the no-vig market beneath')}
            {th('edge', 'Edge', oneSided ? 'Gate score: ln(model scale / the scale the best Yes price implies). Positive = the model beats the ticket. The gate wants 0.06–0.30' : 'Gate score: ln(model mean / market-implied mean), toward the pick. The gate wants 0.06–0.30')}
            {th('ev', 'EV', 'Per 1u at the best price on the pick')}
            {BOOK_PREF.map((b) => <Fragment key={b}>{th(b, BOOK_LABEL[b], `${BOOK_LABEL[b]} price on the pick (best price bold)`)}</Fragment>)}
            {th('l5', 'L5', 'Last 5 games the pick would have hit')}
            {th('l10', 'L10', 'Last 10 games the pick would have hit')}
            {th('szn', 'Szn', 'Games this season the pick would have hit')}
            <th style={S.th} title="Last 10 games, colored by the pick against tonight's line">Last 10</th>
            {th('rank', 'Status', 'Plays first, then edge')}
          </tr>}>
            {sorted.map((r) => {
              const k = `${r.p.pid}|${r.p.name}`; const isOpen = open === k; const m = r.m;
              const diff = projDiff({ stat, ...r }); const sd = side(r);
              const rail = m?.official ? C.good : m?.qualifies ? C.purple : 'transparent';
              return (
                <Fragment key={k}>
                  <tr className="row-hover" style={{ cursor: 'pointer', background: isOpen ? alpha(C.accent, 0.05) : m?.qualifies ? alpha(C.purple, 0.035) : undefined }} onClick={() => setOpen(isOpen ? null : k)}>
                    <td style={{ ...S.tdLeft, boxShadow: `inset 3px 0 0 ${rail}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Headshot pid={r.p.pid} name={r.p.name} team={r.p.team} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{r.p.name} <InjTag inj={r.p.inj} /></div>
                          <div style={{ fontSize: 10, color: C.faint, display: 'flex', gap: 5, alignItems: 'center', whiteSpace: 'nowrap' }}>
                            <PosTag grp={r.p.grp} />{r.p.team} {r.p.home ? 'vs' : '@'} {r.p.opp}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={S.td}>{num(r.p.minutes, 1)}</td>
                    <td style={{ ...S.td, lineHeight: 1.2 }}>
                      <div style={{ fontWeight: 700 }}>{oneSided ? pct(r.proj, 1) : num(r.proj, 2)}</div>
                    </td>
                    {oneSided && <UpsideCell p={r.p} m={m} />}
                    <td style={{ ...S.td, fontWeight: 600 }}>{oneSided ? (m ? 'Yes' : '—') : r.line ?? '—'}</td>
                    <td style={{ ...S.td, lineHeight: 1.2 }}>
                      {diff == null ? <span style={{ color: C.faintest }}>—</span> : oneSided ? (
                        <div style={{ fontWeight: 700, color: diff > 0 ? C.good : C.bad }}>{signed(100 * diff, 1)}pp</div>
                      ) : <>
                        <div style={{ fontWeight: 700, color: diff > 0 ? C.good : diff < 0 ? C.bad : C.txt2 }}>{signed(diff, 2)}</div>
                        {r.line > 0 && <div style={{ fontSize: 9, color: C.faint }}>{signed(100 * diff / r.line, 0)}%</div>}
                      </>}
                    </td>
                    <td style={S.td}><PickPill side={m?.side} line={m?.line} stat={stat} />{m?.side && !agreesWithProj({ prob: m.pModel ?? m.pSide, stat }) && <VsProjTag />}</td>
                    <td style={{ ...S.td, lineHeight: 1.2 }}>
                      <div>{pct(m?.pSide, 1)}</div>
                      {m?.fairSide != null && <div style={{ fontSize: 9, color: C.faint }}>{oneSided ? 'price' : 'mkt'} {pct(m.fairSide, 1)}</div>}
                    </td>
                    <td style={{ ...S.td, fontWeight: 700, color: m?.score == null ? C.faint : m.qualifies ? C.purple : C.txt }}>{signed(m?.score, 3)}</td>
                    <td style={{ ...S.td, color: m?.ev == null ? C.faint : m.ev > 0 ? C.good : C.bad }}>{m?.ev == null ? '—' : `${(100 * m.ev).toFixed(1)}%`}</td>
                    {BOOK_PREF.map((b) => {
                      const q2 = m?.books?.[b]; const price = q2 ? (m.side === 'under' ? q2.under : q2.over) : null;
                      const best = price != null && price === (m.side === 'under' ? m.underAm : m.overAm);
                      return <td key={b} style={S.td}><OddsCell price={price} url={q2?.url} book={b} best={best} /></td>;
                    })}
                    {rateCell(r.l5, sd, 5)}
                    {rateCell(r.l10, sd, 8)}
                    {rateCell(r.szn, sd, 5)}
                    <td style={S.td}><Spark values={r.p.log.slice(-10).map((x) => logVal(x, stat))} line={r.line} side={sd} width={64} height={18} /></td>
                    <td style={S.td}><StatusTag m={m} /></td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={COLS} style={{ padding: 0, background: C.inset, borderBottom: `1px solid ${C.line}` }}>
                      {/* pinned to the visible width: the table scrolls sideways, the panel must not */}
                      <div style={{ position: 'sticky', left: 0, width: 'min(1368px, calc(100vw - 34px))' }}>
                        <PlayerPanel p={r.p} stat={stat} slate={slate} onClose={() => setOpen(null)} />
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </StickyTable>
        )}
      </Card>
      {!slate.players.length && <Empty>No slate today.</Empty>}
      <div style={{ fontSize: 10, color: C.faint, fontFamily: MON, marginTop: -4 }}>
        Win % prices the pick at a mean anchored to the market (opening week showed the model's raw disagreement with books is mostly noise). L5 / L10 / Szn count the games the pick would have hit.
      </div>
    </div>
  );
}
/** The DD Upside cell: chance-based P(DD), the rebounds / assists his chances imply beneath. */
function UpsideCell({ p, m }) {
  const u = p.ddUp;
  if (!u) return <td style={{ ...S.td, color: C.faintest }} title="Needs 3+ tracked games (stats.nba.com, the Mac job)">—</td>;
  const flag = upsideFlag(p, m);
  const vsModel = p.mu?.dd != null ? u.p - p.mu.dd : null;
  return (
    <td style={{ ...S.td, lineHeight: 1.2, background: flag ? alpha(C.good, 0.1) : undefined }}
      title={`From his chances: ${num(u.reb, 1)} reb (${pct(u.cReb, 0)} of chances) · ${num(u.ast, 1)} ast (${pct(u.cAst, 0)} of potential)` +
        (m?.overAm != null ? ` · best Yes ${am(m.overAm)} = ${pct(amToProb(m.overAm), 1)}` : '')}>
      <div style={{ fontWeight: 700, color: flag ? C.good : C.txt }}>{flag ? '▲ ' : ''}{pct(u.p, 1)}</div>
      <div style={{ fontSize: 9, color: vsModel == null || Math.abs(vsModel) < 0.005 ? C.faint : vsModel > 0 ? C.good : C.bad }}>
        {num(u.reb, 1)}r · {num(u.ast, 1)}a</div>
    </td>
  );
}

export { STATS };
