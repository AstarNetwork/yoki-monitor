// Pure parsers for the treasury growth chart. Kept in a non-hook module
// so unit tests don't need React Testing Library.

export type BalancePoint = {
  timestamp: number;
  balanceAstrWei: bigint;
};

export type InflowEvent = {
  timestamp: number;
  valueAstrWei: bigint;
};

export type GrowthKpis = {
  totalInflowAstrWei: bigint;
  mintCount: number;
  avgMintAstrWei: bigint | null;
  inflow24hAstrWei: bigint;
  inflow7dAstrWei: bigint;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function parseBalanceJsonl(text: string): BalancePoint[] {
  const out: BalancePoint[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: { timestamp?: string; balanceAstrWei?: string };
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!row.timestamp || !row.balanceAstrWei) continue;
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) continue;
    try {
      out.push({ timestamp: ts, balanceAstrWei: BigInt(row.balanceAstrWei) });
    } catch {
      // BigInt parse failure → skip row
    }
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

export function parseInflowJsonl(text: string): InflowEvent[] {
  const out: InflowEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: { timestamp?: string; valueWei?: string };
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!row.timestamp || !row.valueWei) continue;
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) continue;
    try {
      out.push({ timestamp: ts, valueAstrWei: BigInt(row.valueWei) });
    } catch {
      // skip
    }
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

// Compute KPI tiles from the parsed inflow stream. `nowMs` is injected
// so tests can pin the wall clock; production passes Date.now().
export function computeGrowthKpis(inflows: InflowEvent[], nowMs: number): GrowthKpis {
  let total = 0n;
  let inflow24h = 0n;
  let inflow7d = 0n;
  const cutoff24h = nowMs - DAY_MS;
  const cutoff7d = nowMs - WEEK_MS;

  for (const e of inflows) {
    total += e.valueAstrWei;
    if (e.timestamp >= cutoff24h) inflow24h += e.valueAstrWei;
    if (e.timestamp >= cutoff7d) inflow7d += e.valueAstrWei;
  }

  const mintCount = inflows.length;
  const avgMintAstrWei = mintCount > 0 ? total / BigInt(mintCount) : null;

  return {
    totalInflowAstrWei: total,
    mintCount,
    avgMintAstrWei,
    inflow24hAstrWei: inflow24h,
    inflow7dAstrWei: inflow7d,
  };
}
