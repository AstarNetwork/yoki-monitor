import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_TREASURY_BALANCE_JSONL_URL, DEFAULT_TREASURY_INFLOWS_JSONL_URL } from "../addresses";
import {
  type BalancePoint,
  type GrowthKpis,
  type InflowEvent,
  computeGrowthKpis,
  parseBalanceJsonl,
  parseInflowJsonl,
} from "../treasuryGrowth";

type State = {
  series: BalancePoint[];
  inflows: InflowEvent[];
  kpis: GrowthKpis | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

const POLL_MS = 10 * 60 * 1000;

export function useTreasuryGrowth(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    series: [],
    inflows: [],
    kpis: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchBoth = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const balanceUrl = import.meta.env.VITE_TREASURY_BALANCE_JSONL_URL || DEFAULT_TREASURY_BALANCE_JSONL_URL;
      const inflowUrl = import.meta.env.VITE_TREASURY_INFLOWS_JSONL_URL || DEFAULT_TREASURY_INFLOWS_JSONL_URL;

      const [balanceRes, inflowRes] = await Promise.all([
        fetch(balanceUrl, { signal: controller.signal, cache: "no-cache" }),
        fetch(inflowUrl, { signal: controller.signal, cache: "no-cache" }),
      ]);

      // 404 on either is the "Phase 1 cron not running" state — render
      // empty chart, no error.
      const balanceText = balanceRes.ok ? await balanceRes.text() : "";
      const inflowText = inflowRes.ok ? await inflowRes.text() : "";

      const series = parseBalanceJsonl(balanceText);
      const inflows = parseInflowJsonl(inflowText);
      const kpis = computeGrowthKpis(inflows, Date.now());

      setState({
        series,
        inflows,
        kpis,
        isLoading: false,
        error: null,
        lastFetchedAt: new Date(),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isLoading: false, error: message, lastFetchedAt: new Date() }));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    fetchBoth();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchBoth, pollMs);
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
        fetchBoth();
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
  }, [fetchBoth, pollMs]);

  return { ...state, refetch: fetchBoth };
}
