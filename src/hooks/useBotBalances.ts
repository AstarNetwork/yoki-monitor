import { useCallback, useEffect, useRef, useState } from "react";
import { erc20Abi } from "viem";

import { ASTR_TOKEN, BOT_WALLETS } from "../addresses";
import { publicClient } from "../chain";

export type BotBalance = {
  label: string;
  address: `0x${string}`;
  ethWei: bigint | null;
  astrWei: bigint | null;
  // ASTR balance at game launch (2026-05-11 T-0). Null = launch balance
  // not recorded; PnL is not computable.
  launchAstrWei: bigint | null;
};

type State = {
  balances: BotBalance[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

// Fetches ETH + ASTR balances for every wallet in BOT_WALLETS in parallel.
// 10 reads per refresh; cheap enough for a 60s poll on public RPC.
export function useBotBalances(pollMs = 60_000) {
  const [state, setState] = useState<State>({
    balances: BOT_WALLETS.map((b) => ({
      label: b.label,
      address: b.address,
      ethWei: null,
      astrWei: null,
      launchAstrWei: b.launchAstr,
    })),
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef(false);

  const fetchBalances = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const results = await Promise.all(
        BOT_WALLETS.map(async (b) => {
          const [eth, astr] = await Promise.all([
            publicClient.getBalance({ address: b.address }),
            publicClient.readContract({
              address: ASTR_TOKEN,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [b.address],
            }),
          ]);
          return {
            label: b.label,
            address: b.address,
            ethWei: eth,
            astrWei: astr as bigint,
            launchAstrWei: b.launchAstr,
          };
        }),
      );
      setState({ balances: results, isLoading: false, error: null, lastFetchedAt: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetchBalances();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchBalances, pollMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (document.visibilityState === "visible") start();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchBalances();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchBalances, pollMs]);

  return { ...state, refetch: fetchBalances };
}
