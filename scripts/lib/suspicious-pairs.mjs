// Suspicious-pairs heuristic. Locked at YOKI_MONITOR_SPEC.md §7.2:
//   pair (A, B) flagged if:
//     - count ≥ 10 matches against each other
//     - AND count / matchesA ≥ 0.5 OR count / matchesB ≥ 0.5
//
// Catches the 2-wallet collusion pattern (A always plays B, both inflate
// their own counts). The Carnival mission's pair-cap of 2 defends
// against this for the campaign window; this trigger catches the pattern
// in the long-running monitor surface too.

export const MIN_PAIR_COUNT = 10;
export const MIN_PAIR_SHARE = 0.5;

export function evaluatePairs(pairs, { minCount = MIN_PAIR_COUNT, minShare = MIN_PAIR_SHARE } = {}) {
  const flagged = [];
  for (const p of pairs) {
    if (p.count < minCount) continue;
    const shareA = p.matchesA > 0 ? p.count / p.matchesA : 0;
    const shareB = p.matchesB > 0 ? p.count / p.matchesB : 0;
    if (shareA < minShare && shareB < minShare) continue;
    flagged.push({
      addressA: p.addressA,
      addressB: p.addressB,
      count: p.count,
      matchesA: p.matchesA,
      matchesB: p.matchesB,
      shareA,
      shareB,
    });
  }
  return flagged;
}
