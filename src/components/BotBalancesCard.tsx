import type { CSSProperties } from "react";

import { YOKI_ARCADE_LAUNCH_DATE, blockscoutAddressUrl } from "../addresses";
import { formatAstr, formatAstrDelta, formatEth, shortAddress } from "../format";
import type { BotBalance } from "../hooks/useBotBalances";
import {
  BORDER_GOLD,
  BORDER_GOLD_SUBTLE,
  CYBER,
  FONT_ARCADE,
  FONT_BODY,
  LOSS_RED,
  WIN_GREEN,
  theme,
} from "../theme";

type Props = {
  balances: BotBalance[];
  isLoading: boolean;
  error: string | null;
};

export function BotBalancesCard({ balances, isLoading, error }: Props) {
  // Aggregate PnL across bots that have a recorded launch balance (i.e.
  // the 4 player bots — funding wallet is excluded). Sum the per-row
  // deltas directly to avoid double-counting the baseline.
  const aggregate = balances.reduce<{ delta: bigint; complete: boolean }>(
    (acc, b) => {
      if (b.launchAstrWei === null) return acc;
      if (b.astrWei === null) return { ...acc, complete: false };
      return {
        delta: acc.delta + (b.astrWei - b.launchAstrWei),
        complete: acc.complete,
      };
    },
    { delta: 0n, complete: true },
  );
  const aggregateDelta = aggregate.complete ? aggregate.delta : null;

  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge }}>
      <div style={styles.headerRow}>
        <div style={styles.label}>Matchmaking Bots</div>
        <div style={styles.sublabel}>ETH · ASTR · PnL since {YOKI_ARCADE_LAUNCH_DATE}</div>
      </div>

      <div style={styles.table}>
        <div style={styles.headerCells}>
          <span style={styles.colName}>Wallet</span>
          <span style={styles.colNumber}>ETH</span>
          <span style={styles.colNumber}>ASTR</span>
          <span style={styles.colNumber}>PnL</span>
          <span style={styles.colLink}> </span>
        </div>
        {balances.map((b) => {
          const pnl =
            b.launchAstrWei !== null && b.astrWei !== null ? b.astrWei - b.launchAstrWei : null;
          const pnlColor = pnl === null ? "rgba(255,255,255,0.35)" : pnl > 0n ? WIN_GREEN : pnl < 0n ? LOSS_RED : CYBER;
          const pnlGlow =
            pnl === null
              ? "none"
              : pnl > 0n
                ? "0 0 8px rgba(74,222,128,0.45)"
                : pnl < 0n
                  ? "0 0 8px rgba(248,113,113,0.45)"
                  : "0 0 8px rgba(0,209,255,0.4)";

          return (
            <div key={b.address} style={styles.row}>
              <div style={styles.colName}>
                <div style={styles.botLabel}>{b.label}</div>
                <div style={styles.botAddress}>{shortAddress(b.address)}</div>
              </div>
              <div style={styles.colNumber}>
                <span style={styles.amount}>{b.ethWei !== null ? formatEth(b.ethWei) : isLoading ? "…" : "—"}</span>
              </div>
              <div style={styles.colNumber}>
                <span style={styles.amount}>
                  {b.astrWei !== null ? formatAstr(b.astrWei) : isLoading ? "…" : "—"}
                </span>
              </div>
              <div style={styles.colNumber}>
                <span style={{ ...styles.amount, color: pnlColor, textShadow: pnlGlow }}>
                  {pnl !== null ? formatAstrDelta(pnl) : "—"}
                </span>
              </div>
              <div style={styles.colLink}>
                <a
                  href={blockscoutAddressUrl(b.address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={styles.link}
                >
                  ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {aggregateDelta !== null && (
        <div style={styles.aggregateRow}>
          <span style={styles.aggregateLabel}>Total bot PnL since launch ({YOKI_ARCADE_LAUNCH_DATE})</span>
          <span
            style={{
              ...styles.aggregateValue,
              color: aggregateDelta > 0n ? WIN_GREEN : aggregateDelta < 0n ? LOSS_RED : CYBER,
              textShadow:
                aggregateDelta > 0n
                  ? "0 0 8px rgba(74,222,128,0.45)"
                  : aggregateDelta < 0n
                    ? "0 0 8px rgba(248,113,113,0.45)"
                    : "0 0 8px rgba(0,209,255,0.4)",
            }}
          >
            {formatAstrDelta(aggregateDelta)} ASTR
          </span>
        </div>
      )}

      {error && <div style={styles.errorLine}>RPC error: {error}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  headerRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "12px",
  },
  label: {
    fontFamily: FONT_ARCADE,
    fontSize: "10px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.85)",
    textShadow: "0 0 6px rgba(0,209,255,0.25)",
  },
  sublabel: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: "rgba(255,255,255,0.45)",
  },
  table: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  headerCells: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.9fr 0.9fr 0.9fr 28px",
    gap: "10px",
    alignItems: "center",
    paddingBottom: "6px",
    borderBottom: `1px solid ${BORDER_GOLD_SUBTLE}`,
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.9fr 0.9fr 0.9fr 28px",
    gap: "10px",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  colName: {
    minWidth: 0,
  },
  colNumber: {
    fontFamily: FONT_ARCADE,
    fontSize: "12px",
    color: CYBER,
    textShadow: "0 0 8px rgba(0,209,255,0.4)",
    textAlign: "right",
  },
  colLink: {
    textAlign: "right",
  },
  botLabel: {
    fontFamily: FONT_ARCADE,
    fontSize: "10px",
    letterSpacing: "1px",
    color: "rgba(255,255,255,0.88)",
  },
  botAddress: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: "rgba(255,255,255,0.4)",
    marginTop: "2px",
  },
  amount: {
    display: "inline-block",
  },
  link: {
    display: "inline-block",
    fontFamily: FONT_ARCADE,
    fontSize: "10px",
    color: CYBER,
    padding: "3px 6px",
    borderRadius: "6px",
    border: `1px solid ${BORDER_GOLD}`,
    background: "rgba(0,71,255,0.08)",
    textDecoration: "none",
  },
  aggregateRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
    marginTop: "14px",
    paddingTop: "12px",
    borderTop: `1px solid ${BORDER_GOLD_SUBTLE}`,
  },
  aggregateLabel: {
    fontFamily: FONT_ARCADE,
    fontSize: "9px",
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)",
  },
  aggregateValue: {
    fontFamily: FONT_ARCADE,
    fontSize: "14px",
    letterSpacing: "1px",
  },
  errorLine: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: LOSS_RED,
    marginTop: "10px",
    opacity: 0.8,
  },
};
