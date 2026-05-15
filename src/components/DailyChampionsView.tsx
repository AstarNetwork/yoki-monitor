import { type CSSProperties, useMemo } from "react";

import { blockscoutAddressUrl } from "../addresses";
import { shortAddress } from "../format";
import {
  type DailyChampionsCategory,
  type DailyChampionsDayEntry,
  type DailyChampionsTallyRow,
  useDailyChampions,
} from "../hooks/useDailyChampions";
import { useFlaggedAddresses } from "../hooks/useFlaggedAddresses";
import { useSuspiciousPairs } from "../hooks/useSuspiciousPairs";
import {
  BORDER_GOLD,
  BORDER_GOLD_SUBTLE,
  CYBER,
  DOJO_AMBER,
  FONT_ARCADE,
  FONT_BODY,
  LOSS_RED,
  WIN_GREEN,
  theme,
} from "../theme";

type Props = {
  onExit: () => void;
};

const CATEGORIES: DailyChampionsCategory[] = ["streak", "matches", "firstMatch"];

const CATEGORY_LABELS: Record<DailyChampionsCategory, string> = {
  streak: "Best Streak",
  matches: "Most Matches",
  firstMatch: "First Match",
};

// Unit suffix appended after the winner's metricValue in the grid.
// firstMatch is binary ("did the first match"), so no value shown.
const CATEGORY_UNITS: Record<DailyChampionsCategory, string> = {
  streak: "wins",
  matches: "matches",
  firstMatch: "",
};

// Cross-cut tracking surface for the Daily Champions campaign (2026-05-13
// → 2026-06-02). Snapshots the launch app's /api/daily-champions/today
// every 30 min via the 2.5a cron, then overlays:
// - 21-day winners grid (3 cells per day)
// - frequency table sorted by top-5 days across the campaign
// - cross-reference badges against flagged.json + suspicious-pairs.json
//
// Toggle in from the public dashboard; toggle back exits to operational.
export function DailyChampionsView({ onExit }: Props) {
  const dc = useDailyChampions();
  const flagged = useFlaggedAddresses();
  const pairs = useSuspiciousPairs();

  // Build a lookup set of "addresses that appear in either the always-
  // winning flag list or the suspicious-pairs list (active rows only)".
  // Used as the cross-reference column in the frequency table.
  const flaggedSet = useMemo(() => {
    const out = new Set<string>();
    for (const entry of flagged.flagged) {
      if (!entry.cleared) out.add(entry.address.toLowerCase());
    }
    return out;
  }, [flagged.flagged]);

  const suspiciousSet = useMemo(() => {
    const out = new Set<string>();
    for (const entry of pairs.flagged) {
      if (entry.cleared) continue;
      out.add(entry.addressA.toLowerCase());
      out.add(entry.addressB.toLowerCase());
    }
    return out;
  }, [pairs.flagged]);

  const sortedDays = useMemo(() => {
    if (!dc.doc) return [];
    return Object.values(dc.doc.days).sort((a, b) => a.day.localeCompare(b.day));
  }, [dc.doc]);

  return (
    <div style={theme.page}>
      <div style={{ ...theme.shell, maxWidth: "1100px" }}>
        <div style={styles.header}>
          <div>
            <div style={styles.titleRow}>
              <button type="button" onClick={onExit} style={styles.backButton}>
                ← OPERATIONAL
              </button>
              <div style={styles.title}>DAILY CHAMPIONS</div>
            </div>
            <div style={styles.sub}>
              Cross-cut view of the 21-day campaign. Top-5 frequencies cross-referenced against always-winning flags +
              suspicious pairs.
            </div>
          </div>
        </div>

        {dc.isLoading && <div style={styles.emptyLine}>Loading…</div>}
        {dc.error && <div style={styles.errorLine}>daily-champions data: {dc.error}</div>}
        {!dc.isLoading && !dc.error && !dc.doc && (
          <div style={styles.emptyLine}>
            No Daily Champions data yet — the 2.5a cron snapshot has not produced its first file.
          </div>
        )}

        {dc.doc && (
          <>
            <FrequencyTable rows={dc.doc.frequencyTally} flaggedSet={flaggedSet} suspiciousSet={suspiciousSet} />
            <WinnersGrid days={sortedDays} />
          </>
        )}
      </div>
    </div>
  );
}

function FrequencyTable({
  rows,
  flaggedSet,
  suspiciousSet,
}: {
  rows: DailyChampionsTallyRow[];
  flaggedSet: Set<string>;
  suspiciousSet: Set<string>;
}) {
  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge, ...styles.tableCard }}>
      <div style={styles.tableHeader}>
        <div style={styles.tableTitle}>Repeat top-5 frequency</div>
        <div style={styles.tableSub}>Sorted desc by top-5 days; finalized days only.</div>
      </div>

      {rows.length === 0 && (
        <div style={styles.emptyLine}>
          No finalized days with top-5 data yet. Frequency rows populate after the first day rolls over.
        </div>
      )}

      {rows.length > 0 && (
        <div style={styles.tableWrap}>
          <div style={{ ...styles.row, ...styles.headerCells, ...frequencyColumns }}>
            <span>Address</span>
            <span style={styles.numCell}>Top-5 days</span>
            <span style={styles.numCell}>Win days</span>
            <span style={styles.numCell}>Streak</span>
            <span style={styles.numCell}>Matches</span>
            <span style={styles.numCell}>First</span>
            <span>Cross-ref</span>
          </div>
          {rows.map((r) => {
            const addrLower = r.address.toLowerCase();
            const isFlagged = flaggedSet.has(addrLower);
            const isSuspicious = suspiciousSet.has(addrLower);
            return (
              <div key={r.address} style={{ ...styles.row, ...frequencyColumns }}>
                <a
                  href={blockscoutAddressUrl(r.address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={styles.addrLink}
                >
                  {shortAddress(r.address)}
                </a>
                <span style={styles.numCell}>{r.top5Days}</span>
                <span style={styles.numCell}>{r.winDays}</span>
                <span style={styles.numCell}>{r.perCategory.streak}</span>
                <span style={styles.numCell}>{r.perCategory.matches}</span>
                <span style={styles.numCell}>{r.perCategory.firstMatch}</span>
                <span style={styles.crossRefCell}>
                  {isFlagged && <CrossRefBadge label="FLAGGED" color={LOSS_RED} />}
                  {isSuspicious && <CrossRefBadge label="PAIR" color={DOJO_AMBER} />}
                  {!isFlagged && !isSuspicious && <span style={styles.crossRefNone}>—</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WinnersGrid({ days }: { days: DailyChampionsDayEntry[] }) {
  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge, ...styles.tableCard }}>
      <div style={styles.tableHeader}>
        <div style={styles.tableTitle}>Daily winners</div>
        <div style={styles.tableSub}>One row per campaign day; one cell per category.</div>
      </div>

      <div style={styles.tableWrap}>
        <div style={{ ...styles.row, ...styles.headerCells, ...winnersColumns }}>
          <span>Day</span>
          <span>Status</span>
          <span>{CATEGORY_LABELS.streak}</span>
          <span>{CATEGORY_LABELS.matches}</span>
          <span>{CATEGORY_LABELS.firstMatch}</span>
        </div>
        {days.map((d) => (
          <div key={d.day} style={{ ...styles.row, ...winnersColumns }}>
            <span style={styles.dateCell}>{d.day}</span>
            <span>
              <StatusBadge finalized={d.finalized} />
            </span>
            {CATEGORIES.map((cat) => {
              const winner = d.winners?.[cat];
              const value = d.winnerValues?.[cat] ?? null;
              const unit = CATEGORY_UNITS[cat];
              return (
                <span key={cat} style={styles.winnerCell}>
                  {winner ? (
                    <>
                      <a
                        href={blockscoutAddressUrl(winner)}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={styles.addrLink}
                      >
                        {shortAddress(winner)}
                      </a>
                      {value !== null && unit && (
                        <span style={styles.metricValue}>
                          · {value} {unit}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={styles.crossRefNone}>—</span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CrossRefBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        ...styles.statusBadge,
        color,
        borderColor: `${color}66`,
        background: `${color}14`,
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ finalized }: { finalized: boolean }) {
  const color = finalized ? WIN_GREEN : CYBER;
  return (
    <span
      style={{
        ...styles.statusBadge,
        color,
        borderColor: `${color}66`,
        background: `${color}14`,
      }}
    >
      {finalized ? "FINAL" : "LIVE"}
    </span>
  );
}

const frequencyColumns: CSSProperties = {
  gridTemplateColumns: "minmax(140px, 1.3fr) 80px 75px 60px 70px 55px 110px",
};

const winnersColumns: CSSProperties = {
  gridTemplateColumns: "110px 70px minmax(140px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr)",
};

const styles: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  title: {
    fontFamily: FONT_ARCADE,
    fontSize: "16px",
    letterSpacing: "2px",
    color: "rgba(255,255,255,0.95)",
    textShadow: "0 0 12px rgba(0,209,255,0.35)",
  },
  backButton: {
    fontFamily: FONT_ARCADE,
    fontSize: "9px",
    letterSpacing: "1.2px",
    color: "rgba(255,255,255,0.85)",
    padding: "8px 12px",
    background: "rgba(0,209,255,0.08)",
    border: `1px solid ${BORDER_GOLD}`,
    borderRadius: "8px",
    cursor: "pointer",
  },
  sub: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    marginTop: "6px",
  },
  tableCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  tableHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  tableTitle: {
    fontFamily: FONT_ARCADE,
    fontSize: "11px",
    letterSpacing: "1.6px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.85)",
  },
  tableSub: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: "rgba(255,255,255,0.45)",
  },
  tableWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    overflowX: "auto",
  },
  row: {
    display: "grid",
    alignItems: "center",
    gap: "10px",
    padding: "10px 4px",
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
  addrLink: {
    color: CYBER,
    textDecoration: "none",
    fontVariantNumeric: "tabular-nums",
  },
  numCell: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  dateCell: {
    fontVariantNumeric: "tabular-nums",
    color: "rgba(255,255,255,0.6)",
  },
  winnerCell: {
    minWidth: 0,
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    flexWrap: "wrap",
  },
  metricValue: {
    color: "rgba(255,255,255,0.55)",
    fontVariantNumeric: "tabular-nums",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },
  crossRefCell: {
    display: "flex",
    gap: "4px",
    flexWrap: "wrap",
  },
  crossRefNone: {
    color: "rgba(255,255,255,0.3)",
  },
  statusBadge: {
    fontFamily: FONT_ARCADE,
    fontSize: "7px",
    letterSpacing: "1px",
    padding: "4px 7px",
    borderRadius: "999px",
    border: "1px solid",
    display: "inline-block",
  },
  emptyLine: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.45)",
    fontStyle: "italic",
  },
  errorLine: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: LOSS_RED,
    opacity: 0.85,
  },
};
