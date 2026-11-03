// ── names ────────────────────────────────────────────────────────────────────
// Books, ESPN and NBA.com disagree on suffixes and diacritics ("Luka Dončić",
// "Jaren Jackson Jr.", "Nicolas Claxton" vs "Nic Claxton"). Normalize hard, then
// alias the handful of genuine nickname splits.
const NAME_ALIAS = {
  'nic claxton': 'nicolas claxton',
  'herb jones': 'herbert jones',
  'cam johnson': 'cameron johnson',
  'cam thomas': 'cameron thomas',
  'pj washington': 'p j washington',
  'gg jackson': 'gregory jackson',
  'kj martin': 'kenyon martin',
  'moe wagner': 'moritz wagner',
  'bub carrington': 'carlton carrington',
  'jabari smith': 'jabari smith',
  'ron holland': 'ronald holland',
  'alex sarr': 'alexandre sarr',
};
export function normName(n) {
  let s = String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.'’`]/g, '').replace(/-/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  return NAME_ALIAS[s] || s;
}

