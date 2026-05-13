import { describe, expect, it } from "vitest";

import { evaluatePairs } from "./suspicious-pairs.mjs";

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";

describe("evaluatePairs", () => {
  it("does not flag a pair below the count threshold", () => {
    const result = evaluatePairs([{ addressA: A, addressB: B, count: 9, matchesA: 9, matchesB: 9 }]);
    expect(result).toHaveLength(0);
  });

  it("flags when count >= 10 and share is >= 50% of either participant", () => {
    // A has played 12 matches total, all against B. B has played 30 total
    // (others against many opponents). shareA = 1.0, shareB = 0.4. Triggers
    // on shareA alone.
    const result = evaluatePairs([{ addressA: A, addressB: B, count: 12, matchesA: 12, matchesB: 30 }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ addressA: A, addressB: B, count: 12 });
    expect(result[0].shareA).toBeCloseTo(1.0);
    expect(result[0].shareB).toBeCloseTo(0.4);
  });

  it("does not flag when both participants have a low share even with high count", () => {
    // High-volume players sharing many matches — both have plenty of
    // unique opponents elsewhere. shareA = 10/100 = 10%, shareB = 10/100.
    const result = evaluatePairs([{ addressA: A, addressB: B, count: 10, matchesA: 100, matchesB: 100 }]);
    expect(result).toHaveLength(0);
  });

  it("supports threshold overrides for tuning", () => {
    const result = evaluatePairs([{ addressA: A, addressB: B, count: 5, matchesA: 5, matchesB: 50 }], {
      minCount: 5,
      minShare: 0.5,
    });
    expect(result).toHaveLength(1);
  });

  it("treats zero-match participants as zero share (no NaN)", () => {
    const result = evaluatePairs([{ addressA: A, addressB: B, count: 0, matchesA: 0, matchesB: 0 }]);
    expect(result).toHaveLength(0);
  });
});
