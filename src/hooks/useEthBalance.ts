import { useCallback, useEffect, useRef, useState } from "react";

import { publicClient } from "../chain";

type State = {
  balance: bigint | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

// Reads the native ETH balance of `address` on Soneium. Refetches every
// `pollMs` while the document is visible; pauses when backgrounded so a
// forgotten tab doesn't burn the public-RPC rate limit.
export function useEthBalance(address: `0x${string}`, pollMs = 60_000) {
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
      const balance = await publicClient.getBalance({ address });
      setState({ balance, isLoading: false, error: null, lastFetchedAt: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    } finally {
      inFlight.current = false;
    }
  }, [address]);

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
