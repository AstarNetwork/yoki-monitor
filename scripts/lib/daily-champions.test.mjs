import { describe, expect, it } from "vitest";

import {
  applyBackfill,
  applyYesterday,
  buildTodayEntry,
  computeFrequencyTally,
  shouldRun,
  sliceTop,
} from "./daily-champions.mjs";

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const C = "0xcccc000000000000000000000000000000000003";

describe("shouldRun", () => {
  it("returns true during the campaign window", () => {
    expect(shouldRun(new Date("2026-05-20T12:00:00Z"))).toBe(true);
  });

  it("returns true within the 1-day grace period after campaign end", () => {
    expect(shouldRun(new Date("2026-06-03T15:00:00Z"))).toBe(true);
  });

  it("returns false after the grace period", () => {
    expect(shouldRun(new Date("2026-06-04T00:00:01Z"))).toBe(false);
  });
});

describe("sliceTop", () => {
  it("slices to top-K and lowercases addresses", () => {
    const list = [
      { address: "0xABCD000000000000000000000000000000000001", metricValue: 10 },
      { address: "0xABCD000000000000000000000000000000000002", metricValue: 9 },
      { address: "0xABCD000000000000000000000000000000000003", metricValue: 8 },
      { address: "0xABCD000000000000000000000000000000000004", metricValue: 7 },
      { address: "0xABCD000000000000000000000000000000000005", metricValue: 6 },
      { address: "0xABCD000000000000000000000000000000000006", metricValue: 5 },
    ];
    const result = sliceTop(list, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ address: list[0].address.toLowerCase(), metricValue: 10 });
  });

  it("returns an empty list for non-array input", () => {
    expect(sliceTop(undefined)).toEqual([]);
    expect(sliceTop(null)).toEqual([]);
  });

  it("drops entries without an address", () => {
    const list = [{ address: A, metricValue: 5 }, { metricValue: 4 }, { address: B }];
    expect(sliceTop(list)).toEqual([
      { address: A, metricValue: 5 },
      { address: B, metricValue: null },
    ]);
  });
});

describe("buildTodayEntry", () => {
  it("extracts winners + top-5 + winnerValues from the production API shape", () => {
    const today = {
      day: "2026-05-14",
      streak: [
        { address: A, metricValue: 10 },
        { address: B, metricValue: 6 },
      ],
      matches: [
        { address: B, metricValue: 59 },
        { address: A, metricValue: 40 },
      ],
      firstMatch: { address: C, metricValue: 1 },
    };
    const entry = buildTodayEntry(today);
    expect(entry.day).toBe("2026-05-14");
    expect(entry.winners).toEqual({ streak: A, matches: B, firstMatch: C });
    expect(entry.winnerValues).toEqual({ streak: 10, matches: 59, firstMatch: null });
    expect(entry.top5.streak[0]).toEqual({ address: A, metricValue: 10 });
    expect(entry.top5.firstMatch).toEqual([{ address: C, metricValue: 1 }]);
    expect(entry.finalized).toBe(false);
  });

  it("returns null when today payload has no day", () => {
    expect(buildTodayEntry(null)).toBe(null);
    expect(buildTodayEntry({})).toBe(null);
  });

  it("handles a firstMatch with no winner yet (early in the day)", () => {
    const today = {
      day: "2026-05-14",
      streak: [],
      matches: [],
      firstMatch: null,
    };
    const entry = buildTodayEntry(today);
    expect(entry.winners).toEqual({ streak: null, matches: null, firstMatch: null });
    expect(entry.winnerValues).toEqual({ streak: null, matches: null, firstMatch: null });
    expect(entry.top5.firstMatch).toEqual([]);
  });
});

describe("applyYesterday", () => {
  it("preserves existing top-5 captured during the day, updates winners + finalized", () => {
    const existing = {
      day: "2026-05-13",
      winners: { streak: A, matches: B, firstMatch: null },
      top5: {
        streak: [{ address: A, metricValue: 5 }],
        matches: [{ address: B, metricValue: 18 }],
        firstMatch: [],
      },
      finalized: false,
    };
    const yesterday = {
      day: "2026-05-13",
      streakWinner: A.toUpperCase(),
      streakValue: 5,
      matchesWinner: B.toUpperCase(),
      matchesValue: 18,
      firstMatchWinner: C.toUpperCase(),
      finalizedAt: "2026-05-14T00:07:00Z",
    };
    const result = applyYesterday(existing, yesterday);
    expect(result.winners).toEqual({ streak: A, matches: B, firstMatch: C });
    expect(result.winnerValues).toEqual({ streak: 5, matches: 18, firstMatch: null });
    expect(result.top5.streak).toEqual(existing.top5.streak);
    expect(result.finalized).toBe(true);
    expect(result.finalizedAt).toBe("2026-05-14T00:07:00Z");
  });

  it("creates an empty top-5 entry if cron was added mid-campaign with no prior snapshot", () => {
    const yesterday = {
      day: "2026-05-13",
      streakWinner: A,
      streakValue: 7,
      matchesWinner: B,
      matchesValue: 22,
      firstMatchWinner: C,
      finalizedAt: "2026-05-14T00:07:00Z",
    };
    const result = applyYesterday(null, yesterday);
    expect(result.day).toBe("2026-05-13");
    expect(result.winners).toEqual({ streak: A, matches: B, firstMatch: C });
    expect(result.winnerValues).toEqual({ streak: 7, matches: 22, firstMatch: null });
    expect(result.top5).toEqual({ streak: [], matches: [], firstMatch: [] });
    expect(result.finalized).toBe(true);
  });

  it("returns existing entry untouched when yesterday payload is empty", () => {
    const existing = { day: "2026-05-13", finalized: true };
    expect(applyYesterday(existing, null)).toBe(existing);
    expect(applyYesterday(existing, {})).toBe(existing);
  });
});

describe("computeFrequencyTally", () => {
  it("ignores non-finalized days", () => {
    const days = {
      "2026-05-13": {
        winners: { streak: A, matches: A, firstMatch: A },
        top5: { streak: [{ address: A }], matches: [{ address: A }], firstMatch: [{ address: A }] },
        finalized: false,
      },
    };
    expect(computeFrequencyTally(days)).toEqual([]);
  });

  it("counts top-5 days as 1 per day even when an address appears in all 3 categories", () => {
    const days = {
      "2026-05-13": {
        winners: { streak: A, matches: A, firstMatch: A },
        top5: { streak: [{ address: A }], matches: [{ address: A }], firstMatch: [{ address: A }] },
        finalized: true,
      },
    };
    const tally = computeFrequencyTally(days);
    expect(tally[0].address).toBe(A);
    expect(tally[0].top5Days).toBe(1);
    expect(tally[0].winDays).toBe(3);
    expect(tally[0].perCategory).toEqual({ streak: 1, matches: 1, firstMatch: 1 });
  });

  it("accumulates per-category appearances across multiple days", () => {
    const days = {
      "2026-05-13": {
        winners: { streak: A, matches: null, firstMatch: null },
        top5: { streak: [{ address: A }, { address: B }], matches: [{ address: B }], firstMatch: [] },
        finalized: true,
      },
      "2026-05-14": {
        winners: { streak: B, matches: A, firstMatch: null },
        top5: { streak: [{ address: B }], matches: [{ address: A }, { address: B }], firstMatch: [] },
        finalized: true,
      },
    };
    const tally = computeFrequencyTally(days);
    const byAddr = Object.fromEntries(tally.map((row) => [row.address, row]));
    expect(byAddr[A].top5Days).toBe(2);
    expect(byAddr[A].perCategory).toEqual({ streak: 1, matches: 1, firstMatch: 0 });
    expect(byAddr[A].winDays).toBe(2);
    expect(byAddr[B].top5Days).toBe(2);
    expect(byAddr[B].perCategory).toEqual({ streak: 2, matches: 2, firstMatch: 0 });
    expect(byAddr[B].winDays).toBe(1);
  });

  it("sorts desc by top5Days then asc by address (deterministic)", () => {
    const days = {
      "2026-05-13": {
        winners: { streak: null, matches: null, firstMatch: null },
        top5: { streak: [{ address: B }, { address: A }], matches: [], firstMatch: [] },
        finalized: true,
      },
    };
    const tally = computeFrequencyTally(days);
    expect(tally.map((r) => r.address)).toEqual([A, B]);
  });

  it("breaks top5Days ties by winDays before falling back to address sort", () => {
    const days = {
      "2026-05-13": {
        winners: { streak: A, matches: null, firstMatch: null },
        top5: { streak: [{ address: A }, { address: B }], matches: [], firstMatch: [] },
        finalized: true,
      },
    };
    const tally = computeFrequencyTally(days);
    // Both A and B have top5Days=1; A also has winDays=1 so should sort first.
    expect(tally.map((r) => r.address)).toEqual([A, B]);
  });
});

describe("applyBackfill", () => {
  const valuesBackfill = { "2026-05-13": { streak: 6, matches: 24, firstMatch: null } };
  const firstMatchBackfill = { "2026-05-13": 1778684303 };

  it("fills winnerValues on an entry that has none", () => {
    const days = {
      "2026-05-13": { day: "2026-05-13", winners: {}, top5: {}, finalized: true },
    };
    applyBackfill(days, valuesBackfill, {});
    expect(days["2026-05-13"].winnerValues).toEqual({ streak: 6, matches: 24, firstMatch: null });
  });

  it("fills firstMatchResolvedAt on an entry that has none", () => {
    const days = {
      "2026-05-13": { day: "2026-05-13", winners: {}, top5: {}, finalized: true },
    };
    applyBackfill(days, {}, firstMatchBackfill);
    expect(days["2026-05-13"].firstMatchResolvedAt).toBe(1778684303);
  });

  it("never overwrites a value the cron captured naturally from the API", () => {
    const days = {
      "2026-05-13": {
        day: "2026-05-13",
        winners: {},
        top5: {},
        finalized: true,
        winnerValues: { streak: 99, matches: null, firstMatch: null },
        firstMatchResolvedAt: 1234567890,
      },
    };
    applyBackfill(days, valuesBackfill, firstMatchBackfill);
    expect(days["2026-05-13"].winnerValues.streak).toBe(99); // preserved
    expect(days["2026-05-13"].winnerValues.matches).toBe(24); // backfilled
    expect(days["2026-05-13"].firstMatchResolvedAt).toBe(1234567890); // preserved
  });

  it("ignores days that aren't in the backfill maps", () => {
    const days = {
      "2026-05-14": { day: "2026-05-14", winners: {}, top5: {}, finalized: true },
    };
    applyBackfill(days, valuesBackfill, firstMatchBackfill);
    expect(days["2026-05-14"].winnerValues).toBeUndefined();
    expect(days["2026-05-14"].firstMatchResolvedAt).toBeUndefined();
  });

  it("ignores backfill days that aren't in the doc", () => {
    const days = {};
    applyBackfill(days, valuesBackfill, firstMatchBackfill);
    expect(days).toEqual({});
  });
});
