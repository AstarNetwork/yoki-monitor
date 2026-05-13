import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_JKP_AGGREGATE_JSON_URL } from "../addresses";

export type LeaderboardRow = {
  address: string;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  volumeAstrWei: string;
  uniqueOpponents: number;
  winRate: number;
};

type AggregateDoc = {
  lastUpdatedBlock: string;
  lastUpdatedAt: string;
  matchCount: number;
  addressCount: number;
  rows: LeaderboardRow[];
};

type State = {
  rows: LeaderboardRow[];
  matchCount: number;
  asOf: Date | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

const POLL_MS = 5 * 60 * 1000;

export function useJkpLeaderboard(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    rows: [],
    matchCount: 0,
    asOf: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchAggregate = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const url = import.meta.env.VITE_JKP_AGGREGATE_JSON_URL || DEFAULT_JKP_AGGREGATE_JSON_URL;
      const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
      // 404 is the Phase-2-not-yet-running state. Show empty board, not error.
      if (res.status === 404) {
        setState({
          rows: [],
          matchCount: 0,
          asOf: null,
          isLoading: false,
          error: null,
          lastFetchedAt: new Date(),
        });
        return;
      }
      if (!res.ok) throw new Error(`aggregate ${res.status}`);
      const doc = (await res.json()) as AggregateDoc;
      setState({
        rows: Array.isArray(doc.rows) ? doc.rows : [],
        matchCount: doc.matchCount ?? 0,
        asOf: doc.lastUpdatedAt ? new Date(doc.lastUpdatedAt) : null,
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
    fetchAggregate();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchAggregate, pollMs);
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
        fetchAggregate();
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
  }, [fetchAggregate, pollMs]);

  return { ...state, refetch: fetchAggregate };
}
