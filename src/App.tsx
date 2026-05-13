import { type CSSProperties, useMemo, useState } from "react";

import {
  ASTR_TOKEN,
  MINTER_HOT_WALLET,
  YOKI_CORES,
  YOKI_JKP,
  YOKI_TREASURY,
  blockscoutAddressUrl,
  blockscoutTokenHoldersUrl,
} from "./addresses";
import { BalanceCard, type BalanceStatus } from "./components/BalanceCard";
import { BotBalancesCard } from "./components/BotBalancesCard";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { StatCard } from "./components/StatCard";
import { formatAstr, formatAstrDelta, formatEth, formatUtcTime } from "./format";
import { useBotBalances } from "./hooks/useBotBalances";
import { useCoresHolders } from "./hooks/useCoresHolders";
import { useErc20Balance } from "./hooks/useErc20Balance";
import { useEthBalance } from "./hooks/useEthBalance";
import { useJkpActivePlayers } from "./hooks/useJkpActivePlayers";
import { useTreasury24hAgoBalance } from "./hooks/useTreasury24hAgoBalance";
import { FONT_ARCADE, theme } from "./theme";

// MINTER hot-wallet ETH thresholds.
// Warn at 0.01 ETH (~47k claim headroom at observed gas cost), critical
// at 0.005 ETH (~24k claims remaining — top up immediately).
const MINTER_WARN_WEI = 10_000_000_000_000_000n; // 0.01 ETH
const MINTER_CRITICAL_WEI = 5_000_000_000_000_000n; // 0.005 ETH
// 4× the warn threshold ≈ "comfortably healthy" full bar. Anything beyond
// pegs the bar at 100%; the value is what matters above that point.
const MINTER_HEALTHY_FULL_WEI = 40_000_000_000_000_000n; // 0.04 ETH

function minterStatus(balance: bigint | null): BalanceStatus {
  if (balance === null) return "neutral";
  if (balance < MINTER_CRITICAL_WEI) return "critical";
  if (balance < MINTER_WARN_WEI) return "warn";
  return "healthy";
}

function minterFillPct(balance: bigint | null): number {
  if (balance === null) return 0;
  if (balance >= MINTER_HEALTHY_FULL_WEI) return 1;
  return Number(balance) / Number(MINTER_HEALTHY_FULL_WEI);
}

function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

export function App() {
  const minter = useEthBalance(MINTER_HOT_WALLET);
  const treasury = useErc20Balance(ASTR_TOKEN, YOKI_TREASURY);
  const treasury24h = useTreasury24hAgoBalance();
  const bots = useBotBalances();
  const holders = useCoresHolders();
  const activity = useJkpActivePlayers();

  const [manualRefreshing, setManualRefreshing] = useState(false);

  const onRefresh = async () => {
    setManualRefreshing(true);
    await Promise.all([
      minter.refetch(),
      treasury.refetch(),
      treasury24h.refetch(),
      bots.refetch(),
      holders.refetch(),
      activity.refetch(),
    ]);
    setManualRefreshing(false);
  };

  // Pick the most recent timestamp across all four sources as the "last
  // refresh" label. Hooks each have their own cadence (60s / 5min), so
  // the latest tick is the user-visible refresh moment.
  const lastRefresh = useMemo(() => {
    const candidates = [
      minter.lastFetchedAt,
      treasury.lastFetchedAt,
      bots.lastFetchedAt,
      holders.lastFetchedAt,
      activity.lastFetchedAt,
    ].filter((d): d is Date => d !== null);
    if (candidates.length === 0) return null;
    const latest = candidates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
    return formatUtcTime(latest);
  }, [
    minter.lastFetchedAt,
    treasury.lastFetchedAt,
    bots.lastFetchedAt,
    holders.lastFetchedAt,
    activity.lastFetchedAt,
  ]);

  const minterStat = minterStatus(minter.balance);
  const minterFill = minterFillPct(minter.balance);
  const minterDisplay = minter.balance !== null ? formatEth(minter.balance) : "—";
  const treasuryDisplay = treasury.balance !== null ? formatAstr(treasury.balance) : "—";

  // 24h treasury inflow: current live balance minus the row from the
  // hourly JSONL that's closest to (and at most) 24h old. Falls back to
  // hidden when the series is too short or the JSONL fetch fails.
  const treasury24hDelta =
    treasury.balance !== null && treasury24h.balance24hAgoWei !== null
      ? treasury.balance - treasury24h.balance24hAgoWei
      : null;
  const treasury24hDisplay = treasury24hDelta !== null ? `${formatAstrDelta(treasury24hDelta)} ASTR` : undefined;
  const treasury24hStatus: BalanceStatus =
    treasury24hDelta === null
      ? "neutral"
      : treasury24hDelta > 0n
        ? "healthy"
        : treasury24hDelta < 0n
          ? "critical"
          : "neutral";

  return (
    <div style={theme.page}>
      <div style={theme.shell}>
        <Header lastRefresh={lastRefresh} onRefresh={onRefresh} isRefreshing={manualRefreshing} />

        <BalanceCard
          label="MINTER Hot Wallet"
          address={MINTER_HOT_WALLET}
          amountDisplay={minterDisplay}
          amountUnit="ETH"
          status={minterStat}
          fillPct={minterFill}
          primarySub="Warn < 0.01 ETH · Critical < 0.005 ETH"
          secondarySub="Signs adminMintBundle on the claim Lambda. Revoke ceremony 2026-06-02."
          isLoading={minter.isLoading}
          error={minter.error}
        />

        <BalanceCard
          label="Yoki Treasury"
          address={YOKI_TREASURY}
          amountDisplay={treasuryDisplay}
          amountUnit="ASTR"
          status="neutral"
          fillPct={null}
          deltaDisplay={treasury24hDisplay}
          deltaStatus={treasury24hStatus}
          deltaSuffix="last 24h"
          primarySub="Mint revenue from YokiCores. Growth-only — outflow triggers private alert (Phase 1.3)."
          secondarySub="Full growth chart lands in Phase 2."
          isLoading={treasury.isLoading}
          error={treasury.error}
        />

        <BotBalancesCard balances={bots.balances} isLoading={bots.isLoading} error={bots.error} />

        <div style={sectionLabel}>ENGAGEMENT</div>

        <div style={statRow}>
          <StatCard
            label="Cores Holders"
            value={formatCount(holders.holders)}
            unit="wallets"
            sub="Unique addresses holding any YokiCore (ERC-1155)."
            linkHref={blockscoutTokenHoldersUrl(YOKI_CORES)}
            linkLabel="Holders ↗"
            isLoading={holders.isLoading}
            error={holders.error}
          />
          <StatCard
            label="JKP · 24h"
            value={formatCount(activity.daily)}
            unit="players"
            sub="Unique addresses who committed or created a JKP match in the last 24h. Bots excluded."
            linkHref={blockscoutAddressUrl(YOKI_JKP)}
            linkLabel="JKP ↗"
            isLoading={activity.isLoading}
            error={activity.error}
          />
          <StatCard
            label="JKP · 7d"
            value={formatCount(activity.weekly)}
            unit="players"
            sub="Unique addresses who committed or created a JKP match in the last 7 days. Bots excluded."
            linkHref={blockscoutAddressUrl(YOKI_JKP)}
            linkLabel="JKP ↗"
            isLoading={activity.isLoading}
            error={activity.error}
          />
        </div>

        <Footer />
      </div>
    </div>
  );
}

const sectionLabel: CSSProperties = {
  fontFamily: FONT_ARCADE,
  fontSize: "9px",
  letterSpacing: "2px",
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  marginTop: "8px",
  paddingLeft: "4px",
};

const statRow: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: "16px",
};
