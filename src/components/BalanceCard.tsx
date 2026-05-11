import type { CSSProperties, ReactNode } from "react";

import { blockscoutAddressUrl } from "../addresses";
import { shortAddress } from "../format";
import { BORDER_GOLD, CYBER, DOJO_AMBER, FONT_ARCADE, FONT_BODY, LOSS_RED, WIN_GREEN, theme } from "../theme";

export type BalanceStatus = "healthy" | "warn" | "critical" | "neutral";

type Props = {
  label: string;
  address: `0x${string}`;
  amountDisplay: string;
  amountUnit: string;
  status: BalanceStatus;
  // Optional sub-line under the balance — e.g. "Last 24h inflow: +1,250 ASTR"
  // or threshold copy ("warn < 0.01 ETH · critical < 0.005 ETH").
  primarySub?: ReactNode;
  // Optional descriptive context line at the bottom of the card.
  secondarySub?: ReactNode;
  // 0..1 fill amount for the threshold bar. Null → no bar (treasury card).
  fillPct?: number | null;
  isLoading?: boolean;
  error?: string | null;
};

export function BalanceCard({
  label,
  address,
  amountDisplay,
  amountUnit,
  status,
  primarySub,
  secondarySub,
  fillPct,
  isLoading,
  error,
}: Props) {
  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];

  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge }}>
      <div style={styles.labelRow}>
        <div style={styles.label}>{label}</div>
        <a
          href={blockscoutAddressUrl(address)}
          target="_blank"
          rel="noreferrer noopener"
          style={styles.blockscoutLink}
        >
          Blockscout ↗
        </a>
      </div>
      <div style={styles.address}>{shortAddress(address)}</div>

      <div style={styles.amountRow}>
        <span style={{ ...styles.amount, color: statusColor, textShadow: STATUS_GLOW[status] }}>
          {isLoading && amountDisplay === "—" ? "…" : amountDisplay}
        </span>
        <span style={styles.amountUnit}>{amountUnit}</span>
      </div>

      {fillPct !== null && fillPct !== undefined && (
        <div style={styles.barWrap}>
          <div style={styles.barTrack}>
            <div
              style={{
                ...styles.barFill,
                width: `${Math.max(0, Math.min(1, fillPct)) * 100}%`,
                background: statusColor,
                boxShadow: `0 0 10px ${statusColor}, inset 0 0 4px rgba(255,255,255,0.15)`,
              }}
            />
          </div>
          <div style={{ ...styles.statusPill, color: statusColor, borderColor: statusColor }}>{statusLabel}</div>
        </div>
      )}

      {primarySub && <div style={styles.primarySub}>{primarySub}</div>}
      {secondarySub && <div style={styles.secondarySub}>{secondarySub}</div>}

      {error && <div style={styles.errorLine}>RPC error: {error}</div>}
    </div>
  );
}

const STATUS_COLORS: Record<BalanceStatus, string> = {
  healthy: WIN_GREEN,
  warn: DOJO_AMBER,
  critical: LOSS_RED,
  neutral: CYBER,
};

const STATUS_GLOW: Record<BalanceStatus, string> = {
  healthy: "0 0 12px rgba(74,222,128,0.5), 0 0 2px rgba(74,222,128,0.8)",
  warn: "0 0 12px rgba(232,169,74,0.55), 0 0 2px rgba(201,168,76,0.8)",
  critical: "0 0 12px rgba(248,113,113,0.55), 0 0 2px rgba(248,113,113,0.8)",
  neutral: "0 0 12px rgba(0,209,255,0.5), 0 0 2px rgba(0,209,255,0.8)",
};

const STATUS_LABELS: Record<BalanceStatus, string> = {
  healthy: "HEALTHY",
  warn: "WARN",
  critical: "CRITICAL",
  neutral: "—",
};

const styles: Record<string, CSSProperties> = {
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  label: {
    fontFamily: FONT_ARCADE,
    fontSize: "10px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.85)",
    textShadow: "0 0 6px rgba(0,209,255,0.25)",
  },
  blockscoutLink: {
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1px",
    color: CYBER,
    padding: "5px 9px",
    borderRadius: "8px",
    border: `1px solid ${BORDER_GOLD}`,
    background: "rgba(0,71,255,0.08)",
  },
  address: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    marginTop: "4px",
  },
  amountRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    marginTop: "18px",
  },
  amount: {
    fontFamily: FONT_ARCADE,
    fontSize: "32px",
    letterSpacing: "1px",
  },
  amountUnit: {
    fontFamily: FONT_ARCADE,
    fontSize: "11px",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: "1px",
  },
  barWrap: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginTop: "14px",
  },
  barTrack: {
    flex: 1,
    height: "10px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: "6px",
    transition: "width 0.4s ease, background 0.4s ease",
  },
  statusPill: {
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1px",
    padding: "4px 8px",
    borderRadius: "6px",
    border: "1px solid",
    whiteSpace: "nowrap",
  },
  primarySub: {
    fontFamily: FONT_BODY,
    fontSize: "13px",
    color: "rgba(255,255,255,0.65)",
    marginTop: "14px",
    lineHeight: 1.5,
  },
  secondarySub: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.4)",
    marginTop: "6px",
    lineHeight: 1.5,
  },
  errorLine: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: LOSS_RED,
    marginTop: "10px",
    opacity: 0.8,
  },
};
