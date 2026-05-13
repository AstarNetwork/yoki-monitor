import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_TREASURY_BALANCE_JSONL_URL } from "../addresses";

type State = {
  balance24hAgoWei: bigint | null;
  asOf: Date | null;
  isLoading: boolean;
  error: string | null;
};

// Fetches the hourly treasury balance JSONL written by the 1.2 cron and
// finds the row closest to (and at most) 24h ago. The Treasury card
// subtracts this from the live RPC balance to display "last 24h inflow".
//
// Returns null when the series is too short (less than 24h of history) —
// the UI hides the line in that case rather than showing a misleading
// "+12,840 ASTR (24h)" computed against the launch baseline.
const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 10 * 60 * 1000; // 10 min — file changes hourly at most

type JsonlRow = {
  timestamp: string;
  blockNumber?: string;
  balanceAstrWei: string;
  balanceAstr?: string;
};

export function useTreasury24hAgoBalance(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    balance24hAgoWei: null,
    asOf: null,
    isLoading: true,
    error: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchBaseline = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const url = import.meta.env.VITE_TREASURY_BALANCE_JSONL_URL || DEFAULT_TREASURY_BALANCE_JSONL_URL;
      const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
      if (!res.ok) throw new Error(`JSONL ${res.status}`);
      const text = await res.text();

      const now = Date.now();
      const cutoff = now - DAY_MS;
      let best: JsonlRow | null = null;
      let bestTs = Number.NEGATIVE_INFINITY;

      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let row: JsonlRow;
        try {
          row = JSON.parse(trimmed) as JsonlRow;
        } catch {
          continue;
        }
        const ts = Date.parse(row.timestamp);
        if (!Number.isFinite(ts)) continue;
        // Want the latest row with timestamp ≤ 24h ago. Earlier rows are
        // older still; we keep the largest ts that doesn't cross the
        // cutoff.
        if (ts <= cutoff && ts > bestTs) {
          best = row;
          bestTs = ts;
        }
      }

      if (!best) {
        setState({ balance24hAgoWei: null, asOf: null, isLoading: false, error: null });
        return;
      }

      setState({
        balance24hAgoWei: BigInt(best.balanceAstrWei),
        asOf: new Date(best.timestamp),
        isLoading: false,
        error: null,
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
    fetchBaseline();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchBaseline, pollMs);
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
        fetchBaseline();
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
  }, [fetchBaseline, pollMs]);

  return { ...state, refetch: fetchBaseline };
}
