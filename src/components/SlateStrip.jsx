// Tonight's games across the top of the board, as the NFL lab carries them: tip,
// the two teams with the market spread, the model's score, and how many props
// clear the gate in that game. A card click narrows the board to the game.
import { S, C, MON, alpha } from '../lib/theme.js';
import { num, tipTime } from '../lib/format.js';
import { TeamLogo } from './ui.jsx';

export default function SlateStrip({ slate, game, setGame }) {
  const plays = {};
  for (const p of slate.players) for (const m of Object.values(p.markets || {})) if (m?.qualifies) plays[p.gid] = (plays[p.gid] || 0) + 1;
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 12 }}>
      {slate.games.map((g) => {
        const on = game === g.gid; const sp = g.market?.spread; const tot = g.market?.total;
        const row = (tri, pts, line) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <TeamLogo tri={tri} size={18} />
            <span style={{ fontWeight: 700, width: 34 }}>{tri}</span>
            <span style={{ fontFamily: MON, fontSize: 10, color: C.faint, flex: 1 }}>{line ?? ''}{g.b2b?.[tri] ? ' · B2B' : ''}</span>
            <span style={{ fontFamily: MON, fontWeight: 700 }}>{num(pts, 1)}</span>
          </div>
        );
        const hl = sp?.line; const spread = (home) => (hl == null ? null : `${home ? (hl > 0 ? '+' : '') + hl : (-hl > 0 ? '+' : '') + -hl}`);
        return (
          <button key={g.gid} onClick={() => setGame(on ? 'all' : g.gid)} title={on ? 'Show every game' : 'Show only this game'}
            style={{ ...S.card, marginBottom: 0, minWidth: 190, flex: '0 0 auto', padding: '8px 10px', textAlign: 'left', cursor: 'pointer', color: C.txt,
              border: `1px solid ${on ? C.accent : C.line}`, background: on ? alpha(C.accent, 0.07) : C.panel, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: MON, color: C.faint }}>
              <span style={{ color: g.started ? C.warn : C.accent, fontWeight: 700 }}>{g.started ? 'STARTED' : tipTime(g.tipUTC)}</span>
              <span>model</span>
            </div>
            {row(g.away, g.proj?.awayPts, spread(false))}
            {row(g.home, g.proj?.homePts, spread(true))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: MON, color: C.faint, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 4 }}>
              <span>O/U {tot?.line ?? '—'} · proj {num(g.proj?.total, 1)}</span>
              {plays[g.gid] ? <span style={{ color: C.purple, fontWeight: 700 }}>{plays[g.gid]} play{plays[g.gid] > 1 ? 's' : ''}</span> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
