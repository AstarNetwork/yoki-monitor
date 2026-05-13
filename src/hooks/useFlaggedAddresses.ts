import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_FLAGGED_JSON_URL } from "../addresses";

export type FlaggedEntry = {
  address: string;
  flaggedAt: string;
  reason: string;
  cleared: boolean;
  clearedAt?: string;
  evidence: {
    wins: number;
    losses: number;
    draws: number;
    matches: number;
    winRate: number;
    uniqueOpponents: number;
  };
  clearedEvidence?: {
    wins: number;
    losses: number;
    draws: number;
    matches: number;
    winRate: number;
  };
};

type FlaggedDoc = {
  flagged: FlaggedEntry[];
  lastUpdatedBlock: string | null;
  lastUpdatedAt: string | null;
};

type State = {
  flagged: FlaggedEntry[];
  lastUpdatedAt: Date | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

const POLL_MS = 5 * 60 * 1000;

export function useFlaggedAddresses(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    flagged: [],
    lastUpdatedAt: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchFlagged = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const url = import.meta.env.VITE_FLAGGED_JSON_URL || DEFAULT_FLAGGED_JSON_URL;
      const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
      if (res.status === 404) {
        setState({
          flagged: [],
          lastUpdatedAt: null,
          isLoading: false,
          error: null,
          lastFetchedAt: new Date(),
        });
        return;
      }
      if (!res.ok) throw new Error(`flagged ${res.status}`);
      const doc = (await res.json()) as FlaggedDoc;
      setState({
        flagged: Array.isArray(doc.flagged) ? doc.flagged : [],
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
    fetchFlagged();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchFlagged, pollMs);
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
        fetchFlagged();
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
  }, [fetchFlagged, pollMs]);

  return { ...state, refetch: fetchFlagged };
}
