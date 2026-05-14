import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_DAILY_CHAMPIONS_JSON_URL } from "../addresses";

export type DailyChampionsCategory = "streak" | "matches" | "firstMatch";

export type DailyChampionsTopEntry = {
  address: string;
  metricValue: number | null;
};

export type DailyChampionsDayEntry = {
  day: string;
  winners: Record<DailyChampionsCategory, string | null>;
  top5: Record<DailyChampionsCategory, DailyChampionsTopEntry[]>;
  finalized: boolean;
  finalizedAt?: number | string | null;
};

export type DailyChampionsTallyRow = {
  address: string;
  top5Days: number;
  winDays: number;
  perCategory: Record<DailyChampionsCategory, number>;
};

export type DailyChampionsDoc = {
  campaignStart: string;
  campaignEnd: string;
  lastUpdatedAt: string | null;
  days: Record<string, DailyChampionsDayEntry>;
  frequencyTally: DailyChampionsTallyRow[];
};

type State = {
  doc: DailyChampionsDoc | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

const POLL_MS = 5 * 60 * 1000;

export function useDailyChampions(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    doc: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchDoc = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const url = import.meta.env.VITE_DAILY_CHAMPIONS_JSON_URL || DEFAULT_DAILY_CHAMPIONS_JSON_URL;
      const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
      if (res.status === 404) {
        // Cron hasn't run yet or file deleted post-campaign cleanup.
        // Render an empty-state instead of an error.
        setState({ doc: null, isLoading: false, error: null, lastFetchedAt: new Date() });
        return;
      }
      if (!res.ok) throw new Error(`daily-champions ${res.status}`);
      const doc = (await res.json()) as DailyChampionsDoc;
      setState({ doc, isLoading: false, error: null, lastFetchedAt: new Date() });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isLoading: false, error: message, lastFetchedAt: new Date() }));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    fetchDoc();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchDoc, pollMs);
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
        fetchDoc();
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
  }, [fetchDoc, pollMs]);

  return { ...state, refetch: fetchDoc };
}
