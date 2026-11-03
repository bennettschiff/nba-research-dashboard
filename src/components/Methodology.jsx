// How the dashboard works, in the order the pipeline runs. Public build: the
// production projection engine and its backtest are private, so this page
// describes the approach at the level a reader needs, not the fitted details.
import { S, C, MON } from '../lib/theme.js';
import { PARAMS, MODEL_VERSION, GATES, LADDER_MIN_P } from '../lib/model.js';
import { Card } from './ui.jsx';

const P = PARAMS;
const steps = [
  ['Minutes', 'A recency-weighted minutes projection for each player, reconciled across the roster so a team sums to 240 minutes, and adjusted for who is out tonight.'],
  ['Rates', 'Per-minute rates for each stat with their own memory, shrunk toward a position prior.'],
  ['Environment', 'Game pace, opponent defense for the specific stat, home court and back-to-backs.'],
  ['Price', `Negative binomial per stat. The market's implied mean comes from the consensus price, de-vigged with Shin's method, and the score is ln(model mean / market mean) toward the side. Win % and EV use a market-anchored mean (trust ${P.TRUST} in the model).`],
  ['Ladder', `Every alternate line priced from the main one, with an estimated book price where none is posted. The recommended rung is the best EV among rungs the model gives at least ${Math.round(100 * LADDER_MIN_P)}%.`],
  ['Game lines', `Team ratings and pace, ${P.HCA}-point home court; spread σ ${P.SIGMA_MARGIN}, total σ ${P.SIGMA_TOTAL}.`],
];

export default function Methodology() {
  return (
    <div className="fade-in">
      <Card title={`Model ${MODEL_VERSION}`} meta="public reference model">
        {steps.map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontFamily: MON, color: C.accent, fontWeight: 700, width: 18 }}>{i + 1}</span>
            <div><div style={{ fontWeight: 600, fontSize: 12 }}>{k}</div><div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>{v}</div></div>
          </div>
        ))}
      </Card>
      <Card title="Gate">
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
          A row qualifies with edge {GATES.band.min}–{GATES.band.max}, price {GATES.price.min} to +{GATES.price.max}, positive EV at the best price, the model's own projection on the pick's side (above 50% and past the line — never a play against the projection; a one-sided Yes like the double-double is exempt, its score already says the model beats the price), ≥{GATES.minGpSeason} games this season (every game his team has played, when it has played fewer) and ≥{GATES.minMinutes} projected minutes.
          One play per player: his props share one minutes-and-usage projection, so only his best-EV qualifying prop is a play.
          Every priced row is graded; every qualifying row is on the <b>official</b> card. Each market also carries a standing, proven or probation, set weekly from its own graded record. The standing is a track record, not a filter.
        </div>
      </Card>
      <Card title="Data">
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
          Box scores, schedule: NBA.com CDN. Injuries: ESPN (Rotowire notes). Priors: <a style={{ color: C.accent }} href="https://www.darko.app" target="_blank" rel="noreferrer">DARKO</a> by Kostya Medvedovsky.
          Tracking (potential assists, catch-and-shoot, rebound chances, hustle): stats.nba.com, pulled nightly — shown, not yet a model input.
          Odds: The Odds API (FanDuel, Hard Rock, DraftKings — consensus no-vig across the three), archived to Drive; never stored in the database.
        </div>
      </Card>
    </div>
  );
}
