import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_SUSPICIOUS_PAIRS_JSON_URL } from "../addresses";

export type SuspiciousPairEntry = {
  addressA: string;
  addressB: string;
  flaggedAt: string;
  cleared: boolean;
  clearedAt?: string;
  evidence: {
    count: number;
    matchesA: number;
    matchesB: number;
    shareA: number;
    shareB: number;
  };
};

type SuspiciousPairsDoc = {
  flagged: SuspiciousPairEntry[];
  lastUpdatedBlock: string | null;
  lastUpdatedAt: string | null;
  thresholds?: { minCount: number; minShare: number };
};

type State = {
  flagged: SuspiciousPairEntry[];
  thresholds: { minCount: number; minShare: number } | null;
  lastUpdatedAt: Date | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

const POLL_MS = 5 * 60 * 1000;

export function useSuspiciousPairs(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    flagged: [],
    thresholds: null,
    lastUpdatedAt: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchPairs = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const url = import.meta.env.VITE_SUSPICIOUS_PAIRS_JSON_URL || DEFAULT_SUSPICIOUS_PAIRS_JSON_URL;
      const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
      if (res.status === 404) {
        setState({
          flagged: [],
          thresholds: null,
          lastUpdatedAt: null,
          isLoading: false,
          error: null,
          lastFetchedAt: new Date(),
        });
        return;
      }
      if (!res.ok) throw new Error(`suspicious-pairs ${res.status}`);
      const doc = (await res.json()) as SuspiciousPairsDoc;
      setState({
        flagged: Array.isArray(doc.flagged) ? doc.flagged : [],
        thresholds: doc.thresholds ?? null,
        lastUpdatedAt: doc.lastUpdatedAt ? new Date(doc.lastUpdatedAt) : null,
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
    fetchPairs();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchPairs, pollMs);
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
        fetchPairs();
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
  }, [fetchPairs, pollMs]);

  return { ...state, refetch: fetchPairs };
}
