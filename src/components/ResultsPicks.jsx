// The pick list. It owns its Date / Market / Side / Player filters (Book / Team
// arrive from a "Where is it winning?" click as removable chips) and they narrow
// ONLY this list — the tables above always describe the whole ledger.
//
// Rows come from /api/picks (CDN-cached): the season's official card, or ONE day
// of every priced lean — never the whole ~700-a-night ledger.
import { useEffect, useMemo, useState } from 'react';
import { S, C, MON, alpha, goodBad } from '../lib/theme.js';
import { BOOK_LABEL } from '../lib/markets.js';
import { ONE_SIDED } from '../lib/model.js';
import { pct, am, num, units, shortDate } from '../lib/format.js';
import { MARKETS, MARKET_LABEL, RECS, record, recStr, decodePicks, agreesWithProj, betLabel, outcomeOf } from '../lib/ledger.js';
import { Card, Pill, SortBtn, cmp, Headshot, TeamLogo, InjTag, VsProjTag } from './ui.jsx';

export const NO_FILTERS = { date: null, market: null, side: null, book: null, team: null, q: '' };
const ROW_CAP = 300;
const RESULTS = [['all', 'All'], ['win', 'Won'], ['loss', 'Lost'], ['push', 'Push'], ['void', 'Void'], ['open', 'Open']];
const RES_STYLE = { win: ['✓', 'good'], loss: ['✗', 'bad'], push: ['P', 'muted'], void: ['VOID', 'faint'], open: ['open', 'faint'] };

export default function ResultsPicks({ results, rec, setRec, f, setF, res, setRes }) {
  const recDef = RECS.find((r) => r.key === rec);
  const oneDay = rec === 'all priced';
  const [data, setData] = useState({ key: null, rows: [], date: null, error: null });
  const [sort, setSort] = useState({ col: 'date', dir: 'desc' });
  const onSort = (col) => setSort((s) => ({ col, dir: s.col === col ? (s.dir === 'desc' ? 'asc' : 'desc') : col === 'player' ? 'asc' : 'desc' }));

  // Every priced lean is fetched one day at a time; the card tiers fetch the season once.
  const url = `/api/picks?tier=${recDef.api}${oneDay && f.date ? `&date=${f.date}` : ''}`;
  useEffect(() => {
    let live = true;
    setData((d) => ({ ...d, key: null }));
    fetch(url).then((r) => r.json()).then((out) => {
      if (!live) return;
      if (out.error) setData({ key: url, rows: [], date: null, error: out.error });
      else setData({ key: url, rows: decodePicks(out), date: out.date || null, error: null });
    }).catch((e) => live && setData({ key: url, rows: [], date: null, error: String(e.message || e) }));
    return () => { live = false; };
  }, [url]);
  const loading = data.key !== url;

  const days = useMemo(() => {
    const s = new Set((results.byDay || []).map((d) => d.game_date));
    for (const r of data.rows) s.add(r.game_date);
    if (f.date) s.add(f.date);
    return [...s].sort().reverse();
  }, [results, data.rows, f.date]);

  const ql = f.q.trim().toLowerCase();
  const filtered = data.rows.filter((r) => (!f.date || r.game_date === f.date) && (!f.market || r.stat === f.market) && (!f.side || r.side === f.side)
    && (!f.book || (r.book || '?') === f.book) && (!f.team || r.team === f.team || (r.position === 'GAME' && r.opp === f.team))
    && (!ql || r.player_name.toLowerCase().includes(ql)));
  const counts = { all: filtered.length };
  for (const r of filtered) { const o = outcomeOf(r); counts[o] = (counts[o] || 0) + 1; }
  const list = res === 'all' ? filtered : filtered.filter((r) => outcomeOf(r) === res);
  const rc = record(filtered.reduce((t, r) => (r.outcome === 'win' || r.outcome === 'loss' || r.outcome === 'push'
    ? { n: t.n + 1, w: t.w + (r.outcome === 'win'), l: t.l + (r.outcome === 'loss'), p: t.p + (r.outcome === 'push'), units: t.units + Number(r.units) } : t), { n: 0, w: 0, l: 0, p: 0, units: 0 }));

  const n = (k) => (r) => (r[k] == null ? null : Number(r[k]));
  const VAL = {
    date: (r) => r.game_date, player: (r) => r.player_name, bet: (r) => MARKETS.indexOf(r.stat) * 1000 + Number(r.line), price: n('am'),
    model: n('prob'), fair: n('fair'), edge: n('score'), proj: n('proj'),
    result: (r) => ({ win: 1, push: 0.5, loss: 0 })[r.outcome] ?? null, units: n('units'),
  };
  const sorted = list.slice().sort((a, b) => cmp(VAL[sort.col](a), VAL[sort.col](b), sort.dir) || (b.score ?? 0) - (a.score ?? 0));
  const anyFilter = Object.entries(f).some(([, v]) => v != null && v !== '');

  const sel = (k, label, allLabel, opts) => (
    <div>
      <div style={S.filterLabel}>{label}</div>
      <select style={{ ...S.select, ...(f[k] ? { borderColor: C.accent, color: C.accent } : null) }} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value || null })}>
        {allLabel && <option value="">{allLabel}</option>}
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
  const th = (col, label, title, left) => <th style={left ? S.thLeft : S.th}><SortBtn col={col} sort={sort} onSort={onSort} align={left ? 'left' : 'center'} title={title}>{label}</SortBtn></th>;

  return (
    <div id="nba-picks" style={{ scrollMarginTop: 12 }}>
      <Card flush title="Picks" meta={`${recDef.label} · these filters narrow only this list`}>
        <div style={{ padding: '10px 12px 0' }}>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
            {RECS.map((r) => <Pill key={r.key} size="chip" active={r.key === rec} title={r.title} onClick={() => { setRec(r.key); setRes('all'); }}>
              {r.label} <span style={{ opacity: 0.6 }}>{results.counts?.[r.key] ?? ''}</span></Pill>)}
          </div>
          <div style={{ ...S.filterBar, marginBottom: 8 }}>
            {sel('date', 'Date', oneDay ? null : 'All days', (oneDay && !f.date && data.date ? [[data.date, shortDate(data.date)]] : []).concat(days.filter((d) => !(oneDay && !f.date && d === data.date)).map((d) => [d, shortDate(d)])))}
            {sel('market', 'Market', 'All markets', MARKETS.map((m) => [m, MARKET_LABEL[m]]))}
            {sel('side', 'Side', 'Both', [['over', 'Over'], ['under', 'Under'], ['home', 'Home'], ['away', 'Away']])}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={S.filterLabel}>Player</div>
              <input type="search" style={{ ...S.searchIn, width: '100%' }} placeholder="Search player or game…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            </div>
            {[['book', (v) => (v === '?' ? 'book not recorded' : BOOK_LABEL[v] || v)], ['team', (v) => v]].filter(([k]) => f[k]).map(([k, lab]) => (
              <Pill key={k} size="chip" active onClick={() => setF({ ...f, [k]: null })} title="Remove this filter">{lab(f[k])} ✕</Pill>))}
          </div>
          {oneDay && <div style={{ fontSize: 10, color: C.faint, marginBottom: 8 }}>Every priced lean loads one day at a time (~700 rows a slate){data.date && !f.date ? ` — showing ${shortDate(data.date)}, the latest` : ''}.</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {RESULTS.filter(([k]) => k === 'all' || counts[k] || res === k).map(([k, l]) => (
                <Pill key={k} size="chip" active={res === k} onClick={() => setRes(k)}>{l} <span style={{ opacity: 0.6 }}>{counts[k] || 0}</span></Pill>))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: C.muted }}>
              {rc.n > 0 && <span>{recStr(rc)} · <b style={{ color: goodBad(rc.units) }}>{units(rc.units)}</b></span>}
              <span>{sorted.length > ROW_CAP ? `showing ${ROW_CAP} of ${sorted.length}` : `${sorted.length} shown`}</span>
              {anyFilter && <button style={S.btnGhost} onClick={() => { setF(NO_FILTERS); setRes('all'); }}>Clear filters</button>}
            </div>
          </div>
        </div>
        {data.error ? <div style={{ padding: 16, fontSize: 12, color: C.muted }}>Picks unavailable: {data.error}</div>
          : loading ? <div style={{ padding: 16, fontSize: 12, color: C.muted }}>Loading picks…</div>
          : !sorted.length ? <div style={{ padding: 16, fontSize: 12, color: C.muted }}>No {recDef.label.replace('★ ', '').toLowerCase()} match these filters.</div>
          : (
            <div style={S.tblWrap}><table style={S.tbl}>
              <thead><tr>
                {th('date', 'Date', null, true)}{th('player', 'Player', null, true)}{th('bet', 'Bet')}
                {th('price', 'Price', 'Best price on the side at freeze')}{th('model', 'Model', 'Model probability of the side')}
                {th('fair', 'Fair', 'No-vig consensus probability of the side')}{th('edge', 'Edge', 'Gate score: ln(model mean / market mean), toward the side')}
                {th('proj', 'Proj', 'Model mean (home margin or total for game lines)')}{th('result', 'Result')}{th('units', 'Units')}
              </tr></thead>
              <tbody>{sorted.slice(0, ROW_CAP).map((r, i) => {
                const game = r.position === 'GAME';
                const [mark, tone] = RES_STYLE[outcomeOf(r)];
                return (
                  <tr key={`${r.game_date}|${r.player_name}|${r.stat}|${i}`} className="row-hover">
                    <td style={{ ...S.tdLeft, fontFamily: MON, fontSize: 11, color: C.muted }}>{shortDate(r.game_date)}</td>
                    <td style={S.tdLeft}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {game ? <span style={{ display: 'inline-flex', gap: 2 }}><TeamLogo tri={r.opp} size={20} /><TeamLogo tri={r.team} size={20} /></span>
                        : <Headshot pid={r.player_id} name={r.player_name} team={r.team} size={24} />}
                      <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{r.player_name}</span>
                      {!game && <span style={{ fontSize: 10, color: C.faint, whiteSpace: 'nowrap' }}>{r.team} v {r.opp}</span>}
                      {r.injury_status && <InjTag inj={{ status: r.injury_status, detail: `${r.injury_status} at freeze` }} />}
                    </div></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      {betLabel(r)}
                      {r.official ? <span style={S.tag(alpha(C.good, 0.18), C.good)} title="Official card">★</span>
                        : r.qualifies ? <span style={S.tag(alpha(C.purple, 0.16), C.purple)} title="Cleared the gate on a probation market · tracked, not bet">gate</span> : null}
                      {!agreesWithProj(r) && <VsProjTag />}
                    </td>
                    <td style={S.td}>{am(r.am)} <span style={{ color: C.faint, fontSize: 10 }}>{BOOK_LABEL[r.book] || ''}</span></td>
                    <td style={S.td}>{pct(r.prob == null ? null : Number(r.prob), 1)}</td>
                    <td style={{ ...S.td, color: C.muted }}>{pct(r.fair == null ? null : Number(r.fair), 1)}</td>
                    <td style={S.td}>{r.score == null ? '—' : Number(r.score).toFixed(3)}</td>
                    <td style={S.td}>{ONE_SIDED.has(r.stat) ? pct(r.proj == null ? null : Number(r.proj), 1) : num(r.proj, game ? 1 : 2)}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: C[tone], whiteSpace: 'nowrap' }}>{mark}{r.actual != null ? ` ${Number(r.actual)}` : ''}</td>
                    <td style={{ ...S.td, color: r.units == null ? C.faint : goodBad(Number(r.units)), fontWeight: 700 }}>{r.units == null ? '—' : units(Number(r.units))}</td>
                  </tr>);
              })}</tbody>
            </table></div>
          )}
      </Card>
    </div>
  );
}
