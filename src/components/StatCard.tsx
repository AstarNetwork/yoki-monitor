import type { CSSProperties, ReactNode } from "react";

import { BORDER_GOLD, CYBER, FONT_ARCADE, FONT_BODY, LOSS_RED, theme } from "../theme";

type Props = {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  linkHref?: string;
  linkLabel?: string;
  isLoading?: boolean;
  error?: string | null;
};

export function StatCard({ label, value, unit, sub, linkHref, linkLabel, isLoading, error }: Props) {
  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge, ...styles.card }}>
      <div style={styles.labelRow}>
        <div style={styles.label}>{label}</div>
        {linkHref && (
          <a href={linkHref} target="_blank" rel="noreferrer noopener" style={styles.link}>
            {linkLabel ?? "Open ↗"}
          </a>
        )}
      </div>
      <div style={styles.valueRow}>
        <span style={styles.value}>{isLoading && value === "—" ? "…" : value}</span>
        {unit && <span style={styles.unit}>{unit}</span>}
      </div>
      {sub && <div style={styles.sub}>{sub}</div>}
      {error && <div style={styles.errorLine}>{error}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    flex: "1 1 200px",
    minWidth: "0",
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  label: {
    fontFamily: FONT_ARCADE,
    fontSize: "9px",
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.75)",
    textShadow: "0 0 6px rgba(0,209,255,0.2)",
  },
  link: {
    fontFamily: FONT_ARCADE,
    fontSize: "7px",
    letterSpacing: "1px",
    color: CYBER,
    padding: "4px 7px",
    borderRadius: "6px",
    border: `1px solid ${BORDER_GOLD}`,
    background: "rgba(0,71,255,0.08)",
    whiteSpace: "nowrap",
  },
  valueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
  },
  value: {
    fontFamily: FONT_ARCADE,
    fontSize: "24px",
    letterSpacing: "1px",
    color: CYBER,
    textShadow: "0 0 12px rgba(0,209,255,0.5), 0 0 2px rgba(0,209,255,0.8)",
  },
  unit: {
    fontFamily: FONT_ARCADE,
    fontSize: "9px",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "1px",
  },
  sub: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.45)",
    lineHeight: 1.45,
  },
  errorLine: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: LOSS_RED,
    opacity: 0.8,
  },
};
