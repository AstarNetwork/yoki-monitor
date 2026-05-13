import type { CSSProperties } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatAstr } from "../format";
import { BORDER_GOLD_SUBTLE, CYBER, FONT_ARCADE, FONT_BODY, GOLD, LOSS_RED, theme } from "../theme";
import type { BalancePoint, GrowthKpis } from "../treasuryGrowth";

type Props = {
  series: BalancePoint[];
  kpis: GrowthKpis | null;
  // Live treasury balance from the same RPC read the Treasury balance
  // card uses. Shown in the header so both cards always agree on
  // "current" — the inflow sum alone can drift from the live balance
  // by the opening-balance amount that pre-dates the inflow walker.
  liveBalanceAstrWei: bigint | null;
  isLoading: boolean;
  error: string | null;
};

// Public treasury growth surface. Reads the hourly balance JSONL from
// the 1.2 cron + the inflow JSONL from 1.3 cron. The chart shows the
// raw balance-over-time curve; the KPI row shows total inflow, mint
// count, avg mint price realized, and last-24h / last-7d inflows.
//
// Treasury is intentionally growth-only — any outflow fires the
// private Slack alert (1.3) and the curve drop is also visible here
// as a public negative signal.
export function TreasuryGrowthCard({ series, kpis, liveBalanceAstrWei, isLoading, error }: Props) {
  const chartData = series.map((p) => ({
    t: p.timestamp,
    astr: Number(p.balanceAstrWei / 1_000_000_000_000_000_000n),
  }));

  const tooLittleData = chartData.length < 2;

  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge, ...styles.card }}>
      <div style={styles.headerRow}>
        <div style={styles.label}>Treasury Growth</div>
        {liveBalanceAstrWei !== null && (
          <div style={styles.totalInflow}>{formatAstr(liveBalanceAstrWei)} ASTR current</div>
        )}
      </div>

      <div style={styles.kpiRow}>
        <Kpi label="Mints" value={kpis ? kpis.mintCount.toLocaleString("en-US") : "—"} />
        <Kpi label="Avg mint" value={kpis?.avgMintAstrWei ? `${formatAstr(kpis.avgMintAstrWei)} ASTR` : "—"} />
        <Kpi label="24h" value={kpis ? `+${formatAstr(kpis.inflow24hAstrWei)} ASTR` : "—"} />
        <Kpi label="7d" value={kpis ? `+${formatAstr(kpis.inflow7dAstrWei)} ASTR` : "—"} />
      </div>

      {error && <div style={styles.errorLine}>{error}</div>}

      {!error && tooLittleData && (
        <div style={styles.emptyLine}>
          {isLoading
            ? "Loading…"
            : "Not enough history yet — the chart appears once the hourly snapshotter has logged at least two points."}
        </div>
      )}

      {!tooLittleData && (
        <div style={styles.chartWrap}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="treasuryGrowthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CYBER} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={CYBER} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ms) => formatTickDate(ms as number)}
                tick={tickStyle}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={tickStyle}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
                tickFormatter={(v) => formatAxisAstr(v as number)}
                width={56}
              />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                labelFormatter={(ms) => formatTooltipDate(ms as number)}
                formatter={(value) => [`${(value as number).toLocaleString("en-US")} ASTR`, "Balance"]}
              />
              <Area
                type="monotone"
                dataKey="astr"
                stroke={CYBER}
                strokeWidth={2}
                fill="url(#treasuryGrowthFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

function formatTickDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function formatTooltipDate(ms: number): string {
  const d = new Date(ms);
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${hh}:${mm} UTC`;
}

function formatAxisAstr(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

// Typed loosely: Recharts' tick prop expects SVGProps<SVGTextElement>,
// not React.CSSProperties, and the two disagree on alignmentBaseline.
const tickStyle = {
  fontFamily: FONT_ARCADE,
  fontSize: 8,
  fill: "rgba(255,255,255,0.45)",
} as const;

const tooltipContentStyle: CSSProperties = {
  background: "rgba(10,14,28,0.92)",
  border: `1px solid ${BORDER_GOLD_SUBTLE}`,
  borderRadius: "8px",
  fontFamily: FONT_BODY,
  fontSize: "12px",
  color: "rgba(255,255,255,0.85)",
};

const tooltipLabelStyle: CSSProperties = {
  fontFamily: FONT_ARCADE,
  fontSize: "9px",
  color: GOLD,
  marginBottom: "4px",
};

const styles: Record<string, CSSProperties> = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  label: {
    fontFamily: FONT_ARCADE,
    fontSize: "11px",
    letterSpacing: "1.6px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.85)",
    textShadow: "0 0 6px rgba(0,209,255,0.25)",
  },
  totalInflow: {
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1px",
    color: GOLD,
  },
  kpiRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
  },
  kpi: {
    flex: "1 1 110px",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px 10px",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${BORDER_GOLD_SUBTLE}`,
    borderRadius: "8px",
  },
  kpiLabel: {
    fontFamily: FONT_ARCADE,
    fontSize: "7px",
    letterSpacing: "1px",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
  },
  kpiValue: {
    fontFamily: FONT_ARCADE,
    fontSize: "11px",
    color: CYBER,
    textShadow: "0 0 8px rgba(0,209,255,0.3)",
  },
  chartWrap: {
    width: "100%",
    height: "220px",
  },
  errorLine: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: LOSS_RED,
    opacity: 0.8,
  },
  emptyLine: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.45)",
    fontStyle: "italic",
  },
};
