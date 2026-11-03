// The graded record, from /api/results (nba_results() aggregated in Postgres,
// CDN-cached) — the page never pulls the ledger's rows, only the pick list's
// slice through /api/picks. Reads top-down: which record → the headline numbers
// and the running total → results by day × prop (click into any cell) → the
// picks themselves → by market → where is it winning → does a bigger edge pay →
// calibration.
import { useState } from 'react';
import { S, C, MON, goodBad, heat } from '../lib/theme.js';
import { pct, units, shortDate } from '../lib/format.js';
import { MARKETS, MARKET_LABEL, MIN_N, record } from '../lib/ledger.js';
import { Card, Pill, Stat, Empty } from './ui.jsx';
import { Breakdown, DayGrid } from './ResultsTables.jsx';
import ResultsPicks, { NO_FILTERS } from './ResultsPicks.jsx';

// Every gate play is official (model.js gateVerdict): the ledger's `qualifying`
// record is the same rows, so it gets no pill of its own.
const TIERS = ['official', 'all priced'];
const TIER_LABEL = { official: '★ Official card', 'all priced': 'Every priced lean' };
const TIER_NOTE = {
  official: 'Every play that made the card.',
  'all priced': 'The bet-every-lean baseline: every priced row, gated or not. ~−4.5% is the vig.',
};
const DAY_KEY = { official: 'off', qualifying: 'q', 'all priced': 'all' };
// nba_results() buckets model P(side) with width_bucket(prob, 0.4, 0.9, 10)
const binLabel = (b) => (b < 1 ? '< 40%' : b > 10 ? '≥ 90%' : `${35 + 5 * b}–${40 + 5 * b}%`);
const mi = (s) => { const i = MARKETS.indexOf(s); return i < 0 ? 99 : i; };

// Open on the narrowest record that has player props in it.
function defaultTier(results) {
  const has = (t) => (results?.byMarket || []).some((r) => r.tier === t && r.n > 0 && !['spread', 'total', 'ml'].includes(r.stat));
  return has('official') ? 'official' : 'all priced';
}

export default function Results({ results }) {
  const [tier, setTierRaw] = useState(null);
  const [pickRec, setPickRec] = useState(null);
  const [pick, setPick] = useState(NO_FILTERS);
  const [pickRes, setPickRes] = useState('all');
  if (!results) return <Empty>Loading the record…</Empty>;
  if (results.error) return <Empty>Results unavailable: {results.error}</Empty>;
  if (!(results.byMarket || []).length) return <Empty>No graded picks yet — the ledger starts grading after opening night (2026-10-20).</Empty>;
  const t = tier || defaultTier(results);
  const rec = pickRec || t;
  const setTier = (x) => { setTierRaw(x); setPickRec(x); };

  const by = (results.byMarket || []).filter((r) => r.tier === t).sort((a, b) => mi(a.stat) - mi(b.stat));
  const tot = record(by.reduce((s, r) => ({ n: s.n + r.n, w: s.w + r.w, l: s.l + r.l, p: s.p + r.p, units: s.units + Number(r.units) }), { n: 0, w: 0, l: 0, p: 0, units: 0 }));
  const days = (results.byDay || []).slice().sort((a, b) => (a.game_date < b.game_date ? -1 : 1));
  const graded = days.filter((d) => d[DAY_KEY[t]]?.n);
  const last = graded.at(-1); const lastRec = last ? record(last[DAY_KEY[t]]) : null;
  const best = by.filter((r) => r.n >= 10).sort((a, b) => Number(b.units) - Number(a.units))[0];
  let run = 0; const series = [0, ...days.map((d) => (run += Number(d[DAY_KEY[t]]?.units || 0)))];
  const max = Math.max(1, ...series.map(Math.abs));

  // Point the list at one slice and scroll to it.
  const show = (next, r) => {
    setPick({ ...NO_FILTERS, ...next });
    if (r) setPickRec(r);
    setPickRes('all');
    requestAnimationFrame(() => document.getElementById('nba-picks')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const onBreakdownPick = (k, v, r) => (pick[k] === v ? setPick({ ...pick, [k]: null }) : show({ [k]: v }, r));
  // A grid cell keeps the page's record; "every priced lean" loads one day at a
  // time, so a season-wide click there opens the latest day.
  const onDrill = (date, market) => show({ date, market }, t);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {TIERS.map((x) => <Pill key={x} active={t === x} onClick={() => setTier(x)}>{TIER_LABEL[x]} <span style={{ opacity: 0.6 }}>{results.counts?.[x] ?? ''}</span></Pill>)}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>{TIER_NOTE[t]}</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="Record" value={tot.n ? `${tot.w}-${tot.l}${tot.p ? `-${tot.p}` : ''}` : '—'} sub={tot.hit != null ? `hit ${pct(tot.hit, 1)}` : 'nothing graded'} />
        <Stat label="Units" value={units(tot.units)} color={goodBad(tot.units)} sub="1u flat, best price at freeze" />
        <Stat label="ROI" value={pct(tot.roi, 1)} color={tot.n >= MIN_N ? goodBad(tot.roi) : C.txt} sub={`${tot.n} graded`} />
        <Stat label="Last day" value={lastRec ? units(lastRec.units) : '—'} color={lastRec ? goodBad(lastRec.units) : C.txt} sub={last ? `${shortDate(last.game_date)} · ${lastRec.w}-${lastRec.l}` : ''} />
        <Stat label="Best market" value={best ? MARKET_LABEL[best.stat] : '—'} sub={best ? `${units(Number(best.units))} · ${best.n} graded` : 'needs 10 graded'} />
        <Stat label="Days graded" value={graded.length} sub={days.length ? `since ${shortDate(days[0].game_date)}` : ''} />
      </div>

      <Card title="Running units" meta={TIER_LABEL[t]}>
        {tot.n ? (
          <svg width="100%" height="70" viewBox={`0 0 ${Math.max(1, series.length - 1)} 70`} preserveAspectRatio="none">
            <line x1="0" x2={series.length} y1="35" y2="35" style={{ stroke: 'var(--line)', strokeWidth: 0.5 }} vectorEffect="non-scaling-stroke" />
            <polyline fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: run >= 0 ? 'var(--good)' : 'var(--bad)', strokeWidth: 2 }}
              points={series.map((v, i) => `${i},${35 - (v / max) * 32}`).join(' ')} />
          </svg>
        ) : <div style={{ fontSize: 12, color: C.muted }}>
          Nothing graded in this record yet.
        </div>}
      </Card>

      <DayGrid results={results} tier={t} onDrill={onDrill} />
      <ResultsPicks results={results} rec={rec} setRec={setPickRec} f={pick} setF={setPick} res={pickRes} setRes={setPickRes} />

      <Card title="By market" meta={TIER_LABEL[t]} flush>
        <div style={S.tblWrap}><table style={S.tbl}>
          <thead><tr>{['Market', 'N', 'W-L-P', 'Hit', 'Model said', 'Market said', 'Units', 'ROI', 'CLV (prob)'].map((h, i) => <th key={h} style={i ? S.th : S.thLeft}>{h}</th>)}</tr></thead>
          <tbody>{by.map((r) => {
            const early = r.n < MIN_N;
            return (
              <tr key={r.stat} className="row-hover" style={{ cursor: 'pointer' }} onClick={() => onDrill(null, r.stat)} title={`Show ${MARKET_LABEL[r.stat]} picks`}>
                <td style={S.tdLeft}>{MARKET_LABEL[r.stat] || r.stat}{early && <span style={{ ...S.tag('transparent', C.faint) }}>early</span>}</td>
                <td style={S.td}>{r.n}</td><td style={S.td}>{r.w}-{r.l}-{r.p}</td>
                <td style={{ ...S.td, background: early ? undefined : heat(r.hit) }}>{pct(r.hit, 1)}</td>
                <td style={{ ...S.td, color: C.muted }}>{pct(r.avg_prob, 1)}</td>
                <td style={{ ...S.td, color: C.muted }}>{pct(r.avg_fair, 1)}</td>
                <td style={{ ...S.td, color: goodBad(Number(r.units)), fontWeight: 700 }}>{units(Number(r.units))}</td>
                <td style={{ ...S.td, color: early ? C.muted : goodBad(Number(r.roi)) }}>{pct(r.roi, 1)}</td>
                <td style={{ ...S.td, color: early ? C.muted : goodBad(Number(r.clv_prob)) }}>{r.clv_prob == null ? '—' : `${(100 * r.clv_prob).toFixed(1)}pp`}</td>
              </tr>);
          })}
          {!by.length && <tr><td colSpan={9} style={{ ...S.td, color: C.muted, padding: 18 }}>Nothing graded in this record yet.</td></tr>}</tbody>
        </table></div>
      </Card>
      <Breakdown results={results} pick={pick} onPick={onBreakdownPick} />
      <Card title="Does a bigger edge pay?" meta="every priced row, by gate score" flush>
        <div style={S.tblWrap}><table style={S.tbl}>
          <thead><tr><th style={S.thLeft}>Market</th>{Array.from({ length: 8 }, (_, i) => <th key={i} style={S.th}>{(i * 0.05).toFixed(2)}–{((i + 1) * 0.05).toFixed(2)}</th>)}</tr></thead>
          <tbody>{[...new Set((results.edgeBands || []).map((b) => b.stat))].sort((a, b) => mi(a) - mi(b)).map((st) => (
            <tr key={st}><td style={S.tdLeft}>{MARKET_LABEL[st] || st}</td>
              {Array.from({ length: 8 }, (_, i) => { const b = results.edgeBands.find((x) => x.stat === st && x.band === i + 1);
                return <td key={i} style={{ ...S.td, fontSize: 11, color: b ? goodBad(Number(b.units)) : C.faintest }}>{b ? `${units(Number(b.units))} (${b.n})` : '—'}</td>; })}
            </tr>))}</tbody>
        </table></div>
      </Card>
      <Card title="Model vs market vs reality" meta="calibration, bettable prices only" flush>
        <div style={S.tblWrap}><table style={S.tbl}>
          <thead><tr>{['Bin', 'N', 'Model', 'Market', 'Real'].map((h, i) => <th key={h} style={i ? S.th : S.thLeft}>{h}</th>)}</tr></thead>
          <tbody>{(results.calibration || []).map((c) => (
            <tr key={c.bin}><td style={{ ...S.tdLeft, fontFamily: MON }}>{binLabel(c.bin)}</td><td style={S.td}>{c.n}</td><td style={S.td}>{pct(c.pred, 1)}</td><td style={S.td}>{pct(c.mkt, 1)}</td>
              <td style={{ ...S.td, fontWeight: 700 }}>{pct(c.real, 1)}</td></tr>))}</tbody>
        </table></div>
        <div style={{ fontSize: 10, color: C.faint, padding: '8px 12px' }}>nba-v1 priced at the model's own mean and ran ~10pp over-confident; nba-v2 prices at a market-anchored mean (model.js TRUST).</div>
      </Card>
    </div>
  );
}
