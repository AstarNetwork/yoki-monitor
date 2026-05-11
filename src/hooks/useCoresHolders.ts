import { useCallback, useEffect, useRef, useState } from "react";

import { YOKI_CORES } from "../addresses";
import { fetchTokenInfo } from "../blockscout";

type State = {
  holders: number | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

// Reads `holders_count` for YokiCores from Soneium Blockscout. Cheap call —
// Blockscout maintains this count server-side. Refreshes every 5 min while
// the tab is visible (holders churn slowly; tighter cadence has no value).
const POLL_MS = 5 * 60 * 1000;

export function useCoresHolders(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    holders: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchHolders = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const info = await fetchTokenInfo(YOKI_CORES, controller.signal);
      const parsed = info.holders_count ? Number.parseInt(info.holders_count, 10) : null;
      setState({
        holders: Number.isFinite(parsed) ? (parsed as number) : null,
        isLoading: false,
        error: null,
        lastFetchedAt: new Date(),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    fetchHolders();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchHolders, pollMs);
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
        fetchHolders();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      inFlight.current?.abort();
    };
  }, [fetchHolders, pollMs]);

  return { ...state, refetch: fetchHolders };
}
