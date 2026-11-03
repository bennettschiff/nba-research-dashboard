// ── Shared UI primitives ─────────────────────────────────────────────────────
// Small, dumb, reusable. No model logic lives here.
import { useState, useRef, useLayoutEffect } from 'react';
import { S, C, MON, alpha, readable, POS_COLORS } from '../lib/theme.js';
import { headshotUrl, logoUrl, TEAM_COLOR } from '../lib/teams.js';
import { ONE_SIDED } from '../lib/model.js';

export function Card({ title, meta, right, children, flush, style }) {
  return (
    <div style={{ ...S.card, ...style }}>
      {(title || meta || right) && (
        <div style={S.cardHead}>
          <div style={S.cardTitle}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {meta && <span style={S.cardMeta}>{meta}</span>}
            {right}
          </div>
        </div>
      )}
      <div style={flush ? undefined : S.cardBody}>{children}</div>
    </div>
  );
}

export const SectionLabel = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
    <span style={S.sectionLabel}>{children}</span>{right}
  </div>
);

export const Empty = ({ children }) => <div style={{ ...S.card, padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>{children}</div>;

export function Pill({ active, onClick, children, size, title }) {
  return <button title={title} onClick={onClick} style={size === 'chip' ? S.chipTab(active) : S.propTab(active)}>{children}</button>;
}

/** Sortable header. Clicking the active column flips direction. */
export function SortBtn({ col, sort, onSort, children, align = 'center', title }) {
  const active = sort.col === col;
  return (
    <button title={title} onClick={() => onSort(col)} style={{
      background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: active ? C.accent : 'inherit', fontSize: 9, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 2,
      justifyContent: align === 'left' ? 'flex-start' : 'center', width: '100%', fontFamily: 'inherit',
    }}>
      {children}<span style={{ opacity: active ? 1 : 0.35 }}>{active && sort.dir === 'asc' ? '▲' : '▼'}</span>
    </button>
  );
}

/**
 * A wide table whose header row stays pinned under the app header while the
 * PAGE scrolls. Plain `position: sticky` on the <th>s can't do it: the table
 * sits in a sideways-scroll box (narrow screens), and a scroll box captures
 * sticky. So the header row is drawn twice — invisibly in the table, where it
 * keeps setting the column widths, and once above it in a sticky strip sized
 * to those widths and scrolled sideways in step with the table. The page keeps
 * its one scrollbar. Sits in a Card with `overflow: 'clip'` (hidden would
 * capture sticky too). App.jsx publishes the header's height as --hdr-h.
 */
export function StickyTable({ head, children }) {
  const pin = useRef(null), wrap = useRef(null), tbl = useRef(null);
  const [dims, setDims] = useState(null); // { cols: [px], width, height } of the real header row
  useLayoutEffect(() => {
    const t = tbl.current;
    const measure = () => {
      const cells = Array.from(t.tHead.rows[0].cells);
      const next = { cols: cells.map((c) => c.getBoundingClientRect().width), width: t.getBoundingClientRect().width, height: t.tHead.getBoundingClientRect().height };
      setDims((d) => (d && d.width === next.width && d.height === next.height && d.cols.every((w, i) => w === next.cols[i]) ? d : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(t); for (const c of t.tHead.rows[0].cells) ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const sync = (from, to) => () => { if (to.current && to.current.scrollLeft !== from.current.scrollLeft) to.current.scrollLeft = from.current.scrollLeft; };
  return (
    <>
      <div ref={pin} className="sticky-head" onScroll={sync(pin, wrap)} style={{
        position: 'sticky', top: 'var(--hdr-h, 0px)', zIndex: 3, overflowX: 'auto', marginBottom: -(dims?.height ?? 0),
        visibility: dims ? 'visible' : 'hidden',
        // the card's own composite (panel over page), so the strip matches it exactly
        background: `linear-gradient(${C.panel}, ${C.panel}), ${C.bg}`,
      }}>
        <table style={{ ...S.tbl, tableLayout: 'fixed', width: dims?.width }}>
          <colgroup>{dims?.cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>{head}</thead>
        </table>
      </div>
      <div ref={wrap} style={S.tblWrap} onScroll={sync(wrap, pin)}>
        <table ref={tbl} style={S.tbl}>
          <thead aria-hidden="true" style={{ visibility: 'hidden' }}>{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The shared comparator: missing values sink in BOTH directions — an absent
 * market line is not a zero one.
 */
export function cmp(a, b, dir) {
  const na = a == null || (typeof a === 'number' && !Number.isFinite(a)), nb = b == null || (typeof b === 'number' && !Number.isFinite(b));
  if (na && nb) return 0; if (na) return 1; if (nb) return -1;
  const r = typeof a === 'string' ? a.localeCompare(b) : a - b;
  return dir === 'asc' ? r : -r;
}

export function TeamLogo({ tri, size = 18 }) {
  const [bad, setBad] = useState(false);
  const url = logoUrl(tri);
  if (!url || bad) return <span style={{ fontSize: 10, fontWeight: 700, color: readable(TEAM_COLOR[tri]), fontFamily: MON }}>{tri}</span>;
  return <img src={url} alt={tri} width={size} height={size} onError={() => setBad(true)} style={{ objectFit: 'contain', flexShrink: 0 }} />;
}

/** Face with a logo badge; falls back to initials on the team color. */
export function Headshot({ pid, name, team, size = 30 }) {
  const [bad, setBad] = useState(false);
  const initials = String(name || '').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {!bad && pid ? (
        <img src={headshotUrl(pid)} alt="" width={size} height={size} onError={() => setBad(true)}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', background: alpha(C.accent, 0.08), border: `1px solid ${C.line}` }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: alpha(readable(TEAM_COLOR[team], 0.1), 0.25), color: C.txt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700 }}>{initials}</div>
      )}
      {team && <div style={{ position: 'absolute', right: -4, bottom: -3, background: C.panelSolid, borderRadius: '50%', padding: 1, display: 'flex' }}><TeamLogo tri={team} size={size * 0.42} /></div>}
    </div>
  );
}

export const PosTag = ({ grp }) => <span style={S.tag(alpha(POS_COLORS[grp] || C.muted, 0.15), POS_COLORS[grp] || C.muted)}>{grp}</span>;

const INJ_COLOR = { OUT: 'bad', SUSP: 'bad', DOUBTFUL: 'bad', QUESTIONABLE: 'warn', DTD: 'warn', PROBABLE: 'good' };
export function InjTag({ inj }) {
  if (!inj) return null;
  const c = C[INJ_COLOR[inj.status] || 'warn'];
  const label = { QUESTIONABLE: 'Q', DOUBTFUL: 'D', PROBABLE: 'P' }[inj.status] || inj.status;
  return <span title={inj.detail} style={S.tag(alpha(c, 0.15), c)}>{label}</span>;
}

// Why a priced row is not a play, in two words; the full gate reason is the tooltip.
const REASON_SHORT = [
  [/below band/, 'small edge', 'The edge is under the gate band — a lean, not a play'],
  [/above band/, 'edge too big', 'The edge is past the band — usually news the model has not seen (role, injury, minutes)'],
  [/GP this season/, 'needs GP', 'Has missed games his team played this season (the gate wants 3, or every one when the team has played fewer) — early-season roles are unreliable'],
  [/one play per player/, 'his other prop', 'Another of his props is the play — his stats share one projection, so one bet per player'],
  [/proj min/, 'low minutes', 'Projected minutes under the gate'],
  [/against the projection/, 'vs proj', 'The model’s own projection favors the other side — the market leans further, but a play must be a bet on the projection'],
  [/no EV/, 'no EV', 'The edge does not survive the best price — negative expected value'],
  [/price/, 'price', 'Best price outside the gate’s range'],
];
export function StatusTag({ m }) {
  if (!m || m.score == null) return <span style={{ color: C.faintest, fontSize: 10 }}>—</span>;
  // every gate play is official; `qualifies` also covers slates published before that rule
  if (m.official || m.qualifies) return <span title="On the official card" style={S.tag(alpha(C.good, 0.18), C.good)}>★ OFFICIAL</span>;
  const r = REASON_SHORT.find(([re]) => re.test(m.reason || ''));
  return <span title={r ? r[2] : m.reason} style={{ color: C.faint, fontSize: 10, whiteSpace: 'nowrap' }}>{r ? r[1] : m.reason}</span>;
}

/** The pick as a colored pill: "O 24.5" / "U 1.5", or "YES" on a one-sided market (double-double). */
export function PickPill({ side, line, stat, size = 11 }) {
  if (!side) return <span style={{ color: C.faintest }}>—</span>;
  const c = side === 'over' ? C.good : C.bad;
  return <span style={{ display: 'inline-block', fontFamily: MON, fontSize: size, fontWeight: 700, color: c, background: alpha(c, 0.12),
    border: `1px solid ${alpha(c, 0.3)}`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>{ONE_SIDED.has(stat) ? 'YES' : `${side === 'over' ? 'O' : 'U'} ${line}`}</span>;
}

/** Small KPI tile: caption, big number, a sub line. */
export function Stat({ label, value, sub, color, title }) {
  return (
    <div title={title} style={{ ...S.inset, padding: '8px 12px', minWidth: 100, flex: '1 1 0' }}>
      <div style={S.sectionLabel}>{label}</div>
      <div style={{ fontFamily: MON, fontSize: 18, fontWeight: 700, color: color || C.txt, margin: '2px 0' }}>{value}</div>
      {sub != null && <div style={{ fontSize: 10, color: C.faint, fontFamily: MON }}>{sub}</div>}
    </div>
  );
}

/** The pick bets against the model's own projection vs the line (lib/ledger.js agreesWithProj). */
export const VsProjTag = () => (
  <span title="Bets against the model's own projection: the model gives this side under 50%, the market gives it less — the edge is a disagreement with the market, not a call that the side hits"
    style={S.tag(alpha(C.warn, 0.15), C.warn)}>vs proj</span>
);

/** Tiny inline sparkline of a series (game log), the line drawn dashed. */
export function Spark({ values, line, side, width = 90, height = 22 }) {
  if (!values?.length) return null;
  const max = Math.max(line ?? 0, ...values, 1);
  const bw = width / values.length;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2));
        const hit = line == null ? null : side === 'under' ? v < line : v > line;
        return <rect key={i} x={i * bw + 1} y={height - h} width={Math.max(1, bw - 2)} height={h} rx={1}
          style={{ fill: hit == null ? 'var(--accent)' : hit ? 'var(--good)' : 'var(--bad)', opacity: 0.75 }} />;
      })}
      {line != null && <line x1={0} x2={width} y1={height - (line / max) * (height - 2)} y2={height - (line / max) * (height - 2)} style={{ stroke: 'var(--txt)', strokeDasharray: '2 2', strokeWidth: 1, opacity: 0.6 }} />}
    </svg>
  );
}

/**
 * Per-game conversion bars: the full bar is the CHANCE he created (potential
 * assists, rebound chances), the solid part is what it converted to (assists,
 * rebounds). Reading one player's row tells you whether a quiet night was a
 * creation problem or a finishing one — the whole reason these two stats are
 * worth showing. `avg` draws the league per-game rate as a dashed reference.
 */
export function ConvBars({ games, width = 232, height = 34, avg = null, color = 'var(--accent)' }) {
  if (!games?.length) return null;
  const max = Math.max(avg ?? 0, ...games.map((g) => g.chance), 1);
  const bw = width / games.length;
  const y = (v) => height - 1 - (v / max) * (height - 2);
  return (
    <svg width={width} height={height} style={{ display: 'block' }} role="img"
      aria-label={`${games.length} games: chances created and converted`}>
      {games.map((g, i) => {
        const x = i * bw + 1, w = Math.max(1, bw - 2);
        return (
          <g key={i}>
            <title>{`${g.date}: ${g.made} of ${g.chance}`}</title>
            <rect x={x} y={y(g.chance)} width={w} height={Math.max(1, height - 1 - y(g.chance))} rx={1}
              style={{ fill: color, opacity: 0.22 }} />
            <rect x={x} y={y(g.made)} width={w} height={Math.max(g.made > 0 ? 1 : 0, height - 1 - y(g.made))} rx={1}
              style={{ fill: color, opacity: 0.85 }} />
          </g>
        );
      })}
      {avg != null && <line x1={0} x2={width} y1={y(avg)} y2={y(avg)}
        style={{ stroke: 'var(--txt)', strokeDasharray: '2 2', strokeWidth: 1, opacity: 0.45 }} />}
    </svg>
  );
}

/** A 0–1 percentile as a thin rail with a marker — "where he sits in the league". */
export function PctlRail({ p, width = 232, color = 'var(--accent)' }) {
  if (p == null) return null;
  return (
    <svg width={width} height={6} style={{ display: 'block' }} role="img" aria-label={`${Math.round(100 * p)}th percentile`}>
      <rect x={0} y={2} width={width} height={2} rx={1} style={{ fill: 'var(--txt)', opacity: 0.12 }} />
      <rect x={0} y={2} width={Math.max(2, p * width)} height={2} rx={1} style={{ fill: color, opacity: 0.5 }} />
      <circle cx={Math.min(width - 2, Math.max(2, p * width))} cy={3} r={2.5} style={{ fill: color }} />
    </svg>
  );
}
