// The ONE copy of the tracking-log shape and its derivations.
//
// Potential assists and rebound chances separate what a player CREATED from what
// came of it: potential assists are passes that would have been assists had the
// shot gone in (creation volume, free of his teammates' shooting luck), and
// rebound chances are boards he was in position for (positioning volume, free of
// who else crashed). The ratios — AST / potential AST, REB / rebound chances —
// are the conversion halves, and they regress differently than the volumes do.
//
// DESCRIPTIVE in nba-v6: shown in the player panel, never an input to model.js.
// `scripts/local/pull-nba-tracking-log.mjs` builds the per-game history that has
// to validate it before it can become one.
//
// Imported by the board AND by scripts/daily-predict.mjs — same rule as
// model.js and markets.js: one copy, so the page and the archive agree.

/** Column order of one game row in tracking.json's `g` arrays. */
export const TRACK_IX = { date: 0, min: 1, ast: 2, potAst: 3, reb: 4, rebCh: 5 };

/** A compact game row from the raw per-date passing + rebounding tables. */
export function trackRow(date, pass, reb) {
  const n = (x) => (x == null ? 0 : +x);
  return [date, n(pass?.MIN ?? reb?.MIN), n(pass?.AST), n(pass?.POTENTIAL_AST), n(reb?.REB), n(reb?.REB_CHANCES)];
}

const sum = (g, k) => g.reduce((a, r) => a + (r[TRACK_IX[k]] || 0), 0);

/**
 * Season summary of a game series. Conversions come from the TOTALS, not from a
 * mean of per-game ratios: a 1-chance game would otherwise count as much as a
 * 20-chance one (and a 0-chance game is undefined, not zero).
 */
export function trackSummary(g) {
  if (!g?.length) return null;
  const gp = g.length;
  const potAst = sum(g, 'potAst'), ast = sum(g, 'ast'), rebCh = sum(g, 'rebCh'), reb = sum(g, 'reb');
  return {
    gp,
    min: +(sum(g, 'min') / gp).toFixed(1),
    potAst: +(potAst / gp).toFixed(1),
    ast: +(ast / gp).toFixed(1),
    rebCh: +(rebCh / gp).toFixed(1),
    reb: +(reb / gp).toFixed(1),
    astConv: potAst > 0 ? +(ast / potAst).toFixed(3) : null,
    rebConv: rebCh > 0 ? +(reb / rebCh).toFixed(3) : null,
  };
}

/** Where v falls in sorted-ascending `vals` (0–1). Ties take the midpoint. */
export function pctlOf(vals, v) {
  if (!vals?.length || v == null) return null;
  let lo = 0, hi = 0;
  for (const x of vals) { if (x < v) lo++; else if (x === v) hi++; }
  return +((lo + hi / 2) / vals.length).toFixed(3);
}

/** League per-game means and conversions over players with >= minGp logged games. */
export function leagueTrack(byPid, minGp = 3) {
  const s = Object.values(byPid).map((p) => trackSummary(p.g)).filter((x) => x && x.gp >= minGp);
  if (!s.length) return null;
  const avg = (k) => +(s.reduce((a, x) => a + (x[k] ?? 0), 0) / s.length).toFixed(3);
  return {
    n: s.length,
    potAst: avg('potAst'), rebCh: avg('rebCh'),
    // conversion means are pooled over players, which is what a player's own
    // conversion should be read against
    astConv: +(s.filter((x) => x.astConv != null).reduce((a, x) => a + x.astConv, 0) / Math.max(1, s.filter((x) => x.astConv != null).length)).toFixed(3),
    rebConv: +(s.filter((x) => x.rebConv != null).reduce((a, x) => a + x.rebConv, 0) / Math.max(1, s.filter((x) => x.rebConv != null).length)).toFixed(3),
  };
}

/**
 * Rebounds and assists as his CHANCES say they should run tonight: chances per
 * minute (this season's tracking) × tonight's projected minutes, pace and
 * opponent, × a conversion shrunk toward the league's — volume is the stable
 * half, conversion the noisy one, so a big whose boards have been stolen by the
 * scrum, or a passer whose shooters went cold, reads at what he CREATED.
 *
 * Feeds the board's double-double upside (model.js probDoubleDouble at these
 * means). DESCRIPTIVE, like everything here: never the price or the gate.
 * `conv` pseudo-chances: how many of the league's chances his own conversion is
 * blended with (a big logs ~15 rebound chances a game, a guard ~9 potential
 * assists, so each reads mostly his own after ~5 games).
 */
export const CHANCE_CONV_K = { reb: 60, ast: 40 };
export function chanceMeans(t, minutes, f = {}) {
  if (!t || !(t.gp >= 3) || !(t.min > 0) || !(minutes > 0) || !t.league) return null;
  const conv = (made, ch, lg, k) => (made * t.gp + k * lg) / (ch * t.gp + k);
  const cReb = conv(t.reb, t.rebCh, t.league.rebConv, CHANCE_CONV_K.reb);
  const cAst = conv(t.ast, t.potAst, t.league.astConv, CHANCE_CONV_K.ast);
  const pace = f.pace ?? 1;
  return {
    reb: +((t.rebCh / t.min) * minutes * cReb * pace * (f.def_reb ?? 1)).toFixed(3),
    ast: +((t.potAst / t.min) * minutes * cAst * pace * (f.def_ast ?? 1) * Math.sqrt(f.usage ?? 1)).toFixed(3),
    cReb: +cReb.toFixed(3), cAst: +cAst.toFixed(3),
  };
}

export const TRACK_LABEL = {
  potAst: 'Potential assists', ast: 'Assists', rebCh: 'Rebound chances', reb: 'Rebounds',
  astConv: 'Assists per potential assist', rebConv: 'Rebound chances converted',
};
