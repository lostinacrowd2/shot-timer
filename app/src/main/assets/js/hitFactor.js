/**
 * USPSA scoring: points per hit category, hit factor = total points / time.
 * Minor/Major power factor changes A/C/D point values but not the formula,
 * so we expose both and let the user pick at score time.
 */
const USPSA_SCORING = {
  major: { A: 5, C: 4, D: 2, M: -10, NS: -10, PE: -10 },
  minor: { A: 5, C: 3, D: 1, M: -10, NS: -10, PE: -10 }
};

const SCORE_CATEGORIES = [
  { key: 'A', label: 'A' },
  { key: 'C', label: 'C' },
  { key: 'D', label: 'D' },
  { key: 'M', label: 'MISS' },
  { key: 'NS', label: 'NO-SHOOT' },
  { key: 'PE', label: 'PROC.' }
];

function calcPoints(counts, powerFactor = 'minor') {
  const table = USPSA_SCORING[powerFactor];
  let total = 0;
  for (const key in counts) {
    if (table[key] !== undefined) total += table[key] * counts[key];
  }
  return total;
}

function calcHitFactor(points, timeSeconds) {
  if (!timeSeconds || timeSeconds <= 0) return 0;
  return points / timeSeconds;
}

window.USPSA = { USPSA_SCORING, SCORE_CATEGORIES, calcPoints, calcHitFactor };
