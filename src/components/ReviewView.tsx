import { type CSSProperties, useMemo, useState } from "react";

import { blockscoutAddressUrl } from "../addresses";
import { formatUtcTime, shortAddress } from "../format";
import { type FlaggedEntry, useFlaggedAddresses } from "../hooks/useFlaggedAddresses";
import { type SuspiciousPairEntry, useSuspiciousPairs } from "../hooks/useSuspiciousPairs";
import { type ReviewFilter, applyFilter } from "../reviewFilter";
import {
  BORDER_GOLD,
  BORDER_GOLD_SUBTLE,
  CYBER,
  DOJO_AMBER,
  FONT_ARCADE,
  FONT_BODY,
  GOLD,
  LOSS_RED,
  theme,
} from "../theme";

// Operator review surface (only reachable via ?review=<key>). Renders
// the two trigger output files side-by-side so the operator can scan
// active flags in one place. Reuses the cron's audit data — no extra
// derivation here.
//
// Casual-gating only: the bundle ships the key as a plain string, and
// the underlying JSONs are public on raw.githubusercontent.com. See
// README for the security model.
export function ReviewView() {
  const flagged = useFlaggedAddresses();
  const pairs = useSuspiciousPairs();
  const [filter, setFilter] = useState<ReviewFilter>("active");
  const [refreshing, setRefreshing] = useState(false);

  const visibleFlagged = useMemo(() => applyFilter(flagged.flagged, filter), [flagged.flagged, filter]);
  const visiblePairs = useMemo(() => applyFilter(pairs.flagged, filter), [pairs.flagged, filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([flagged.refetch(), pairs.refetch()]);
    setRefreshing(false);
  };

  const activeFlaggedCount = flagged.flagged.filter((f) => !f.cleared).length;
  const activePairCount = pairs.flagged.filter((p) => !p.cleared).length;

  const latestUpdate =
    flagged.lastUpdatedAt && pairs.lastUpdatedAt
      ? flagged.lastUpdatedAt > pairs.lastUpdatedAt
        ? flagged.lastUpdatedAt
        : pairs.lastUpdatedAt
      : (flagged.lastUpdatedAt ?? pairs.lastUpdatedAt);

  return (
    <div style={theme.page}>
      <div style={{ ...theme.shell, maxWidth: "1000px" }}>
        <div style={styles.header}>
          <div>
            <div style={styles.titleRow}>
              <div style={styles.title}>YOKI MONITOR · REVIEW</div>
              <div style={styles.badge}>OPERATOR ONLY</div>
            </div>
            <div style={styles.sub}>
              {activeFlaggedCount} active flag{activeFlaggedCount === 1 ? "" : "s"} · {activePairCount} active pair
              {activePairCount === 1 ? "" : "s"}
              {latestUpdate && ` · last cron tick ${formatUtcTime(latestUpdate)}`}
            </div>
          </div>
          <button type="button" onClick={onRefresh} style={styles.refreshButton} disabled={refreshing}>
            {refreshing ? "REFRESHING…" : "REFRESH ↻"}
          </button>
        </div>

        <div style={styles.filterRow}>
          <FilterPill label="Active" value="active" current={filter} onSelect={setFilter} />
          <FilterPill label="Cleared" value="cleared" current={filter} onSelect={setFilter} />
          <FilterPill label="All" value="all" current={filter} onSelect={setFilter} />
        </div>

        <FlaggedTable entries={visibleFlagged} isLoading={flagged.isLoading} error={flagged.error} filter={filter} />

        <SuspiciousPairsTable
          entries={visiblePairs}
          isLoading={pairs.isLoading}
          error={pairs.error}
          filter={filter}
          thresholds={pairs.thresholds}
        />

        <div style={styles.footer}>
          Data sources: <code>data/flagged.json</code> (2.4) · <code>data/suspicious-pairs.json</code> (2.5). Both files
          are public on the repo — this view is glanceability, not concealment.
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  value,
  current,
  onSelect,
}: {
  label: string;
  value: ReviewFilter;
  current: ReviewFilter;
  onSelect: (v: ReviewFilter) => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      style={{ ...styles.pill, ...(active ? styles.pillActive : null) }}
    >
      {label}
    </button>
  );
}

function FlaggedTable({
  entries,
  isLoading,
  error,
  filter,
}: {
  entries: FlaggedEntry[];
  isLoading: boolean;
  error: string | null;
  filter: ReviewFilter;
}) {
  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge, ...styles.tableCard }}>
      <div style={styles.tableHeader}>
        <div style={styles.tableTitle}>Always-winning flags</div>
        <div style={styles.tableSub}>≥75% win-rate over ≥5 matches</div>
      </div>

      {error && <div style={styles.errorLine}>{error}</div>}

      {!error && entries.length === 0 && (
        <div style={styles.emptyLine}>
          {isLoading
            ? "Loading…"
            : filter === "active"
              ? "No active flags. Trigger has not fired on any current address."
              : filter === "cleared"
                ? "No cleared flags yet."
                : "No flag history yet."}
        </div>
      )}

      {entries.length > 0 && (
        <div style={styles.tableWrap}>
          <div style={{ ...styles.row, ...styles.headerCells, ...flaggedColumns }}>
            <span>Address</span>
            <span style={styles.numCell}>W / L / D</span>
            <span style={styles.numCell}>Matches</span>
            <span style={styles.numCell}>Win %</span>
            <span style={styles.numCell}>Opp</span>
            <span>Flagged</span>
            <span>Status</span>
          </div>
          {entries.map((e) => (
            <div key={e.address} style={{ ...styles.row, ...flaggedColumns }}>
              <a
                href={blockscoutAddressUrl(e.address)}
                target="_blank"
                rel="noreferrer noopener"
                style={styles.addrLink}
              >
                {shortAddress(e.address)}
              </a>
              <span style={styles.numCell}>
                {e.evidence.wins} / {e.evidence.losses} / {e.evidence.draws}
              </span>
              <span style={styles.numCell}>{e.evidence.matches}</span>
              <span style={styles.numCell}>{(e.evidence.winRate * 100).toFixed(0)}%</span>
              <span style={styles.numCell}>{e.evidence.uniqueOpponents}</span>
              <span style={styles.dateCell}>{formatShortDate(e.flaggedAt)}</span>
              <span>
                <StatusBadge cleared={e.cleared} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuspiciousPairsTable({
  entries,
  isLoading,
  error,
  filter,
  thresholds,
}: {
  entries: SuspiciousPairEntry[];
  isLoading: boolean;
  error: string | null;
  filter: ReviewFilter;
  thresholds: { minCount: number; minShare: number } | null;
}) {
  const subline = thresholds
    ? `≥${thresholds.minCount} matches AND ≥${(thresholds.minShare * 100).toFixed(0)}% of either side`
    : "≥10 matches AND ≥50% of either side";

  return (
    <div style={{ ...theme.card, ...theme.cardWithGoldEdge, ...styles.tableCard }}>
      <div style={styles.tableHeader}>
        <div style={styles.tableTitle}>Suspicious pairs</div>
        <div style={styles.tableSub}>{subline}</div>
      </div>

      {error && <div style={styles.errorLine}>{error}</div>}

      {!error && entries.length === 0 && (
        <div style={styles.emptyLine}>
          {isLoading
            ? "Loading…"
            : filter === "active"
              ? "No active pair flags."
              : filter === "cleared"
                ? "No cleared pair flags yet."
                : "No pair flag history yet."}
        </div>
      )}

      {entries.length > 0 && (
        <div style={styles.tableWrap}>
          <div style={{ ...styles.row, ...styles.headerCells, ...pairColumns }}>
            <span>A ↔ B</span>
            <span style={styles.numCell}>Pair</span>
            <span style={styles.numCell}>Share A</span>
            <span style={styles.numCell}>Share B</span>
            <span>Flagged</span>
            <span>Status</span>
          </div>
          {entries.map((e) => (
            <div key={`${e.addressA}_${e.addressB}`} style={{ ...styles.row, ...pairColumns }}>
              <span style={styles.pairCell}>
                <a
                  href={blockscoutAddressUrl(e.addressA)}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={styles.addrLink}
                >
                  {shortAddress(e.addressA)}
                </a>
                <span style={styles.pairSep}> ↔ </span>
                <a
                  href={blockscoutAddressUrl(e.addressB)}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={styles.addrLink}
                >
                  {shortAddress(e.addressB)}
                </a>
              </span>
              <span style={styles.numCell}>{e.evidence.count}</span>
              <span style={styles.numCell}>
                {(e.evidence.shareA * 100).toFixed(0)}% ({e.evidence.matchesA})
              </span>
              <span style={styles.numCell}>
                {(e.evidence.shareB * 100).toFixed(0)}% ({e.evidence.matchesB})
              </span>
              <span style={styles.dateCell}>{formatShortDate(e.flaggedAt)}</span>
              <span>
                <StatusBadge cleared={e.cleared} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ cleared }: { cleared: boolean }) {
  return (
    <span
      style={{
        ...styles.statusBadge,
        color: cleared ? "rgba(255,255,255,0.55)" : LOSS_RED,
        borderColor: cleared ? "rgba(255,255,255,0.2)" : "rgba(248,113,113,0.4)",
        background: cleared ? "rgba(255,255,255,0.03)" : "rgba(248,113,113,0.08)",
      }}
    >
      {cleared ? "CLEARED" : "ACTIVE"}
    </span>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd} ${hh}:${min}`;
}

const flaggedColumns: CSSProperties = {
  gridTemplateColumns: "minmax(110px, 1.1fr) 90px 60px 50px 40px 130px 80px",
};

const pairColumns: CSSProperties = {
  gridTemplateColumns: "minmax(220px, 2fr) 60px 100px 100px 130px 80px",
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
    gap: "10px",
  },
  title: {
    fontFamily: FONT_ARCADE,
    fontSize: "16px",
    letterSpacing: "2px",
    color: "rgba(255,255,255,0.95)",
    textShadow: "0 0 12px rgba(0,209,255,0.35)",
  },
  badge: {
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1px",
    color: DOJO_AMBER,
    padding: "4px 8px",
    border: `1px solid ${DOJO_AMBER}`,
    borderRadius: "6px",
    background: "rgba(232,169,74,0.05)",
  },
  sub: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    marginTop: "6px",
  },
  refreshButton: {
    fontFamily: FONT_ARCADE,
    fontSize: "9px",
    letterSpacing: "1.2px",
    color: "rgba(255,255,255,0.85)",
    padding: "10px 14px",
    background: "rgba(0,209,255,0.08)",
    border: `1px solid ${BORDER_GOLD}`,
    borderRadius: "8px",
    cursor: "pointer",
  },
  filterRow: {
    display: "flex",
    gap: "8px",
  },
  pill: {
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1.2px",
    color: "rgba(255,255,255,0.6)",
    padding: "8px 14px",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${BORDER_GOLD_SUBTLE}`,
    borderRadius: "999px",
    cursor: "pointer",
  },
  pillActive: {
    color: GOLD,
    borderColor: BORDER_GOLD,
    background: "rgba(201,168,76,0.08)",
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
    color: "rgba(255,255,255,0.55)",
    fontVariantNumeric: "tabular-nums",
    fontSize: "11px",
  },
  pairCell: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    minWidth: 0,
  },
  pairSep: {
    color: "rgba(255,255,255,0.4)",
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
  errorLine: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: LOSS_RED,
    opacity: 0.85,
  },
  emptyLine: {
    fontFamily: FONT_BODY,
    fontSize: "12px",
    color: "rgba(255,255,255,0.45)",
    fontStyle: "italic",
    paddingTop: "4px",
  },
  footer: {
    fontFamily: FONT_BODY,
    fontSize: "11px",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    marginTop: "8px",
  },
};
