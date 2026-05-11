import type { CSSProperties } from "react";

import { CYBER, FONT_ARCADE, FONT_BODY, GOLD } from "../theme";

type Props = {
  lastRefresh: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function Header({ lastRefresh, onRefresh, isRefreshing }: Props) {
  return (
    <div style={styles.header}>
      <div style={styles.titleRow}>
        <div style={styles.title}>YOKI MONITOR</div>
        <div style={styles.phaseTag}>Phase 1 · v0.1</div>
      </div>
      <div style={styles.subtitle}>Operational health snapshot</div>
      <div style={styles.refreshRow}>
        <span style={styles.refreshLabel}>Last refresh: {lastRefresh ?? "—"}</span>
        <button type="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? "REFRESHING…" : "REFRESH ↻"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    paddingBottom: "8px",
  },
  titleRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  title: {
    fontFamily: FONT_ARCADE,
    fontSize: "18px",
    letterSpacing: "2px",
    color: "rgba(255,255,255,0.95)",
    textShadow: "0 0 10px rgba(0,209,255,0.45), 0 0 2px rgba(201,168,76,0.5)",
  },
  phaseTag: {
    fontFamily: FONT_ARCADE,
    fontSize: "9px",
    letterSpacing: "1px",
    padding: "5px 9px",
    borderRadius: "8px",
    background: "rgba(0,71,255,0.12)",
    border: `1px solid ${GOLD}`,
    color: CYBER,
    textShadow: "0 0 6px rgba(0,209,255,0.5)",
  },
  subtitle: {
    fontFamily: FONT_BODY,
    fontSize: "13px",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: "0.2px",
  },
  refreshRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginTop: "4px",
    flexWrap: "wrap",
  },
  refreshLabel: {
    fontFamily: FONT_ARCADE,
    fontSize: "9px",
    letterSpacing: "1px",
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase",
  },
};
