import type { CSSProperties } from "react";

import { blockscoutAddressUrl } from "../addresses";
import { formatAstr, shortAddress } from "../format";
import type { LeaderboardRow } from "../hooks/useJkpLeaderboard";
import { BORDER_GOLD_SUBTLE, CYBER, FONT_ARCADE, FONT_BODY, GOLD, LOSS_RED, theme } from "../theme";

type Props = {
  rows: LeaderboardRow[];
  matchCount: number;
  isLoading: boolean;
  error: string | null;
  top?: number;
};

// Public JKP leaderboard: top N addresses by matches played, with W/L/D
// and win-rate. Bots + admin wallets already filtered out by the cron
// aggregator (MONITOR_IGNORE_LIST applied in scripts/lib/jkp.mjs).
//
// Thresholds (≥75% / ≥5 matches) and flagged-address list are
// deliberately NOT surfaced here — that is the signal-leak tradeoff
// locked at YOKI_MONITOR_SPEC.md §4.7 / DECISIONS.md §54.
export function LeaderboardCard({ rows, matchCount, isLoading, error, top = 10 }: Props) {
  const display = rows.slice(0, top);

  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge, ...styles.card }}>
      <div style={styles.headerRow}>
        <div style={styles.label}>JKP Leaderboard</div>
        <div style={styles.matchCount}>{matchCount.toLocaleString("en-US")} matches</div>
      </div>
      <div style={styles.sub}>
        Address-aggregated wins / losses / draws across resolved Jan-Ken-Pon matches. Bots and admin wallets excluded.
      </div>

      {error && <div style={styles.errorLine}>{error}</div>}

      {!error && display.length === 0 && (
        <div style={styles.emptyLine}>
          {isLoading
            ? "Loading…"
            : "No resolved matches yet. The board populates once the JKP event walker has indexed completed games."}
        </div>
      )}

      {display.length > 0 && (
        <div style={styles.tableWrap}>
          <div style={{ ...styles.row, ...styles.headerCells }}>
            <span style={styles.rank}>#</span>
            <span style={styles.addr}>Address</span>
            <span style={styles.numCell}>W</span>
            <span style={styles.numCell}>L</span>
            <span style={styles.numCell}>D</span>
            <span style={styles.numCell}>Win %</span>
            <span style={styles.volCell}>Volume</span>
          </div>
          {display.map((row, idx) => (
            <div key={row.address} style={styles.row}>
              <span style={styles.rank}>{idx + 1}</span>
              <a
                href={blockscoutAddressUrl(row.address)}
                target="_blank"
                rel="noreferrer noopener"
                style={styles.addrLink}
              >
                {shortAddress(row.address)}
              </a>
              <span style={styles.numCell}>{row.wins}</span>
              <span style={styles.numCell}>{row.losses}</span>
              <span style={styles.numCell}>{row.draws}</span>
              <span style={styles.numCell}>{(row.winRate * 100).toFixed(0)}%</span>
              <span style={styles.volCell}>{formatAstr(BigInt(row.volumeAstrWei))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
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
  matchCount: {
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1px",
    color: GOLD,
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
  emptyLine: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.45)",
    fontStyle: "italic",
    paddingTop: "8px",
  },
  tableWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    marginTop: "4px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "28px minmax(0, 1.4fr) 30px 30px 30px 50px minmax(60px, 1fr)",
    alignItems: "center",
    gap: "8px",
    padding: "8px 4px",
    borderBottom: `1px solid ${BORDER_GOLD_SUBTLE}`,
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.78)",
  },
  headerCells: {
    fontFamily: FONT_ARCADE,
    fontSize: "7px",
    letterSpacing: "1px",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
  },
  rank: {
    color: GOLD,
    fontFamily: FONT_ARCADE,
    fontSize: "10px",
    textAlign: "right",
  },
  addr: {
    color: "inherit",
  },
  addrLink: {
    color: CYBER,
    textDecoration: "none",
    fontVariantNumeric: "tabular-nums",
  },
  numCell: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  volCell: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    color: "rgba(255,255,255,0.6)",
  },
};
