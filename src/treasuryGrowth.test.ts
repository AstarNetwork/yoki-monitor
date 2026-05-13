import { describe, expect, it } from "vitest";

import { computeGrowthKpis, parseBalanceJsonl, parseInflowJsonl } from "./treasuryGrowth";

const NOW = Date.UTC(2026, 4, 13, 14, 0, 0); // 2026-05-13 14:00 UTC

describe("parseBalanceJsonl", () => {
  it("parses well-formed rows in timestamp order", () => {
    const text = [
      JSON.stringify({ timestamp: "2026-05-11T12:00:00Z", balanceAstrWei: "1000000000000000000000" }),
      JSON.stringify({ timestamp: "2026-05-13T08:00:00Z", balanceAstrWei: "1200000000000000000000" }),
      JSON.stringify({ timestamp: "2026-05-12T18:00:00Z", balanceAstrWei: "1150000000000000000000" }),
    ].join("\n");
    const rows = parseBalanceJsonl(text);
    expect(rows).toHaveLength(3);
    expect(rows[0].timestamp).toBeLessThan(rows[1].timestamp);
    expect(rows[2].balanceAstrWei).toBe(1_200_000_000_000_000_000_000n);
  });

  it("skips malformed rows without throwing", () => {
    const text = ["not json", JSON.stringify({ timestamp: "2026-05-11T12:00:00Z", balanceAstrWei: "1000" }), ""].join(
      "\n",
    );
    const rows = parseBalanceJsonl(text);
    expect(rows).toHaveLength(1);
  });
});

describe("parseInflowJsonl", () => {
  it("normalizes the valueWei field name", () => {
    const text = JSON.stringify({ timestamp: "2026-05-11T12:00:00Z", valueWei: "500000000000000000000" });
    const rows = parseInflowJsonl(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].valueAstrWei).toBe(500_000_000_000_000_000_000n);
  });
});

describe("computeGrowthKpis", () => {
  it("returns zero KPIs on empty inflow stream", () => {
    const kpis = computeGrowthKpis([], NOW);
    expect(kpis.mintCount).toBe(0);
    expect(kpis.totalInflowAstrWei).toBe(0n);
    expect(kpis.avgMintAstrWei).toBeNull();
  });

  it("sums total inflow + computes avg mint price", () => {
    const inflows = [
      { timestamp: NOW - 10 * 24 * 60 * 60 * 1000, valueAstrWei: 100n },
      { timestamp: NOW - 5 * 24 * 60 * 60 * 1000, valueAstrWei: 500n },
      { timestamp: NOW - 1 * 24 * 60 * 60 * 1000, valueAstrWei: 2500n },
    ];
    const kpis = computeGrowthKpis(inflows, NOW);
    expect(kpis.totalInflowAstrWei).toBe(3100n);
    expect(kpis.mintCount).toBe(3);
    expect(kpis.avgMintAstrWei).toBe(1033n); // 3100 / 3 = 1033 (floor)
  });

  it("buckets 24h and 7d inflow correctly", () => {
    const inflows = [
      { timestamp: NOW - 30 * 24 * 60 * 60 * 1000, valueAstrWei: 100n }, // outside 7d
      { timestamp: NOW - 3 * 24 * 60 * 60 * 1000, valueAstrWei: 200n }, // inside 7d only
      { timestamp: NOW - 1 * 60 * 60 * 1000, valueAstrWei: 300n }, // inside 24h
    ];
    const kpis = computeGrowthKpis(inflows, NOW);
    expect(kpis.inflow24hAstrWei).toBe(300n);
    expect(kpis.inflow7dAstrWei).toBe(500n);
    expect(kpis.totalInflowAstrWei).toBe(600n);
  });
});
