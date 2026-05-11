import { useCallback, useEffect, useRef, useState } from "react";
import { erc20Abi } from "viem";

import { publicClient } from "../chain";

type State = {
  balance: bigint | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

// Reads `balanceOf(holder)` for an ERC-20 `token`. Same poll-while-visible
// cadence as useEthBalance. viem ships a canonical erc20Abi which is
// sufficient for balanceOf reads.
export function useErc20Balance(token: `0x${string}`, holder: `0x${string}`, pollMs = 60_000) {
  const [state, setState] = useState<State>({
    balance: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef(false);

  const fetchBalance = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const balance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [holder],
      });
      setState({ balance, isLoading: false, error: null, lastFetchedAt: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    } finally {
      inFlight.current = false;
    }
  }, [token, holder]);

  useEffect(() => {
    fetchBalance();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchBalance, pollMs);
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
        fetchBalance();
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
  }, [fetchBalance, pollMs]);

  return { ...state, refetch: fetchBalance };
}
