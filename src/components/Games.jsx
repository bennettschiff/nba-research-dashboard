// Spreads, totals and moneylines — one card per game. Priced and graded in the
// ledger like every prop, and on PROBATION: the game engine is a fair predictor
// of the score and has no record yet against closing prices.
import { S, C, MON, alpha } from '../lib/theme.js';
import { pct, am, num, signed, tipTime } from '../lib/format.js';
import { BOOK_LABEL } from '../lib/markets.js';
import { Card, TeamLogo, InjTag, Empty } from './ui.jsx';

function Market({ label, pick, model, fair, price, book, edgeLabel }) {
  return (
    <div style={{ ...S.inset, padding: '8px 10px', minWidth: 150, flex: 1 }}>
      <div style={S.sectionLabel}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, margin: '4px 0', fontFamily: MON }}>{pick ?? '—'}</div>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: MON, lineHeight: 1.6 }}>
        model {pct(model, 1)} · fair {pct(fair, 1)}<br />
        best {am(price)} {BOOK_LABEL[book] || ''}{edgeLabel ? ` · ${edgeLabel}` : ''}
      </div>
    </div>
  );
}

// Every rotation player carrying a report, by team, worst status first — the
// same badge the board and the plays carry.
const INJ_RANK = { OUT: 0, SUSP: 0, DOUBTFUL: 1, QUESTIONABLE: 2, DTD: 2, PROBABLE: 3 };
function Injuries({ players, teams }) {
  if (!players.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
      {teams.map((t) => (
        <div key={t} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {players.filter((p) => p.team === t).sort((a, b) => (INJ_RANK[a.inj.status] ?? 2) - (INJ_RANK[b.inj.status] ?? 2) || (b.minutes || 0) - (a.minutes || 0)).map((p) => (
            <div key={p.pid} title={p.inj.detail} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, minWidth: 0 }}>
              <InjTag inj={p.inj} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: p.inj.status === 'OUT' ? C.muted : C.txt }}>{p.name}</span>
            </div>))}
        </div>))}
    </div>
  );
}

export default function Games({ slate }) {
  if (!slate.games.length) return <Empty>No games today.</Empty>;
  return (
    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
      {slate.games.map((g) => {
        const mk = g.market, pr = g.price, pj = g.proj;
        const sp = mk?.spread, tot = mk?.total, ml = mk?.ml;
        const spHome = pr?.spread ? pr.spread.pHome >= 0.5 : null;
        const tOver = pr?.total ? pr.total.pOver >= 0.5 : null;
        const mlHome = pr?.ml ? pr.ml.pHome >= 0.5 : null;
        return (
          <Card key={g.gid} style={{ marginBottom: 0 }}
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TeamLogo tri={g.away} /> {g.away} @ {g.home} <TeamLogo tri={g.home} /></span>}
            meta={g.started ? 'started' : tipTime(g.tipUTC)}>
            <div style={{ display: 'flex', justifyContent: 'space-around', fontFamily: MON, marginBottom: 10 }}>
              {[[g.away, pj.awayPts], [g.home, pj.homePts]].map(([t, pts]) => (
                <div key={t} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{num(pts, 1)}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{t}{g.b2b?.[t] ? ' · B2B' : ''}</div>
                </div>
              ))}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{num(pj.total, 1)}</div>
                <div style={{ fontSize: 10, color: C.muted }}>total · pace {num(pj.pace, 1)}</div>
              </div>
            </div>
            <Injuries players={slate.players.filter((p) => p.gid === g.gid && p.inj)} teams={[g.away, g.home]} />
            {!mk ? <div style={{ fontSize: 11, color: C.faint, textAlign: 'center' }}>No market pulled yet.</div> : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {sp && <Market label={`Spread · model ${signed(-pj.margin, 1)} ${g.home}`}
                  pick={`${spHome ? g.home : g.away} ${signed(spHome ? sp.line : -sp.line, 1)}`}
                  model={spHome ? pr.spread.pHome : pr.spread.pAway} fair={sp.fairHome != null ? (spHome ? sp.fairHome : 1 - sp.fairHome) : null}
                  price={spHome ? sp.homeAm : sp.awayAm} book={spHome ? sp.homeBook : sp.awayBook} />}
                {tot && <Market label={`Total · model ${num(pj.total, 1)}`} pick={`${tOver ? 'Over' : 'Under'} ${tot.line}`}
                  model={tOver ? pr.total.pOver : pr.total.pUnder} fair={tot.fairOver != null ? (tOver ? tot.fairOver : 1 - tot.fairOver) : null}
                  price={tOver ? tot.overAm : tot.underAm} book={tOver ? tot.overBook : tot.underBook} />}
                {ml && <Market label="Moneyline" pick={mlHome ? g.home : g.away} model={mlHome ? pr.ml.pHome : pr.ml.pAway}
                  fair={ml.fairHome != null ? (mlHome ? ml.fairHome : 1 - ml.fairHome) : null} price={mlHome ? ml.homeAm : ml.awayAm} book={mlHome ? ml.homeBook : ml.awayBook} />}
              </div>
            )}
            <div style={{ fontSize: 10, color: C.faint, marginTop: 8, background: alpha(C.purple, 0.06), padding: '4px 8px', borderRadius: 5 }}>
              PROBATION — graded every night, not the card until its own record earns it in.
            </div>
          </Card>
        );
      })}
    </div>
  );
}
