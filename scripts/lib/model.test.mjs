// Tests for the public pricing model (the production projection engine is private).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  probLine, impliedMean, shinDevig, devig, amToProb, probToAm, evAt,
  pricePlayerStat, priceLadder, gateVerdict, isDoubleDouble, nbTail,
} from '../../src/lib/model.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('over, under and push always sum to one', () => {
  for (const line of [12.5, 13]) {
    const p = probLine(14, line, 'pts');
    close(p.over + p.under + p.push, 1);
  }
  assert.equal(probLine(14, 12.5, 'pts').push, 0);
});

test('impliedMean inverts probLine', () => {
  const mu = impliedMean(20.5, 0.5, 'pts');
  const p = probLine(mu, 20.5, 'pts');
  close(p.over / (p.over + p.under), 0.5, 1e-4);
});

test('Shin takes more vig off the longshot than multiplicative does', () => {
  const shin = shinDevig(-300, 240), mult = amToProb(-300) / (amToProb(-300) + amToProb(240));
  assert.ok(shin > mult);
  close(devig(-110, -110), 0.5);
});

test('odds helpers round-trip and EV is zero at a fair price', () => {
  assert.equal(probToAm(0.6), -150);
  close(evAt(100, 0.5), 0);
  assert.ok(nbTail(1, 2, 10) > 0.8);
});

test('pricing picks the side the model is on and scores it in mean space', () => {
  const r = pricePlayerStat(24, 'pts', { line: 21.5, fairOver: 0.5, overAm: -110, underAm: -110 });
  assert.equal(r.side, 'over');
  assert.ok(r.score > 0);
  assert.ok(r.pSide > 0.5);
});

test('the ladder recommends only positive-EV rungs', () => {
  const L = priceLadder(24, 'pts', { line: 21.5, side: 'over', muMarket: 21.5 });
  assert.ok(L.rungs.length >= 4);
  if (L.best) assert.ok(L.best.ev > 0);
});

test('gates reject plays against the projection and thin samples', () => {
  const base = { stat: 'pts', score: 0.1, am: -110, ev: 0.05, side: 'over', p_model: 0.6, proj: 24, line: 21.5, gp_season: 10, team_gp: 10, minutes: 30, position: 'G' };
  assert.equal(gateVerdict(base).qualifies, true);
  assert.equal(gateVerdict({ ...base, proj: 20 }).qualifies, false);
  assert.equal(gateVerdict({ ...base, gp_season: 1 }).qualifies, false);
  assert.equal(isDoubleDouble({ pts: 12, reb: 10 }), 1);
});
