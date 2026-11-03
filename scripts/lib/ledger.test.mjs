// The ledger reading the Results tab and the "vs proj" tag depend on. Rows are
// real 2026-10-20/21 ledger rows (game proj = home margin, or the total).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { record, addRec, recOf, recStr, decodePicks, agreesWithProj, betLabel } from '../../src/lib/ledger.js';

test('record: hit leaves pushes out, ROI keeps them in (the SQL definitions)', () => {
  const r = record({ n: 10, w: 5, l: 4, p: 1, units: '0.55' });
  assert.equal(r.hit, 5 / 9);
  assert.ok(Math.abs(r.roi - 0.055) < 1e-12);
  assert.equal(recStr(r), '5-4-1');
  assert.equal(recStr(record(null)), '—');
  assert.equal(record(null).hit, null);
  assert.deepEqual(addRec(record({ n: 1, w: 1, units: 0.91 }), { n: 2, w: 0, l: 2, p: 0, units: -2 }), { n: 3, w: 1, l: 2, p: 0, units: 0.91 - 2 });
  assert.deepEqual(recOf(['2026-10-20', 'ast', 'all priced', 33, 18, 15, 0, 0.87], 3), record({ n: 33, w: 18, l: 15, p: 0, units: 0.87 }));
});

test('decodePicks maps positional rows onto cols', () => {
  assert.deepEqual(decodePicks({ cols: ['a', 'b'], rows: [[1, 2], [3, null]] }), [{ a: 1, b: 2 }, { a: 3, b: null }]);
  assert.deepEqual(decodePicks({ error: 'x' }), []);
});

test('agreesWithProj judges the model P(side), not mean vs line (counts are skewed)', () => {
  // Giannis steals under 0.5, 2026-10-21: model 44.1%, the market's mean higher still
  assert.equal(agreesWithProj({ prob: 0.441 }), false);
  // blocks under 0.5 on a 0.60 mean: the mean sits over the line, yet P(0) ≈ 0.55 under NB
  const k = 2.5, mu = 0.6;
  const p0 = (k / (k + mu)) ** k;
  assert.ok(p0 > 0.5);
  assert.equal(agreesWithProj({ prob: p0 }), true);
  assert.equal(agreesWithProj({ prob: '0.5' }), true);
  assert.equal(agreesWithProj({ prob: null }), true);
});

test('betLabel', () => {
  assert.equal(betLabel({ stat: 'ml', side: 'away', line: 0, team: 'WAS', opp: 'MIL' }), 'MIL ML');
  assert.equal(betLabel({ stat: 'spread', side: 'home', line: -10.5, team: 'HOU', opp: 'DAL' }), 'HOU -10.5');
  assert.equal(betLabel({ stat: 'spread', side: 'away', line: 2.5, team: 'ORL', opp: 'ATL' }), 'ATL +2.5');
  assert.equal(betLabel({ stat: 'fg3m', side: 'under', line: 2.5 }), 'Under 2.5 3-Pointers');
});
