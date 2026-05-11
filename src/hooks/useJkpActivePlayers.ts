import { useCallback, useEffect, useRef, useState } from "react";

import { MONITOR_IGNORE_LIST, YOKI_JKP } from "../addresses";
import { type BlockscoutLog, walkAddressLogs } from "../blockscout";
import { JKP_PARTICIPATION_TOPICS, topicToAddress } from "../eventTopics";

type State = {
  daily: number | null;
  weekly: number | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
};

// Walks YokiJKP logs on Blockscout newest-first, keeps only MatchCreated +
// MatchJoined (the two events that introduce a player address), stops once
// a log is older than 7 days, then aggregates unique addresses for the 24h
// and 7d windows. Bots are excluded via MONITOR_IGNORE_LIST.
//
// One paginated walk → two numbers. Cached 5 min in-memory; the underlying
// Blockscout response is already CDN-cached so this is cheap.
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const POLL_MS = 5 * 60 * 1000;

// Both MatchCreated and MatchJoined have signature `(uint256 indexed
// matchId, address indexed player…)`. topics[0]=signature,
// topics[1]=matchId, topics[2]=player.
const PLAYER_TOPIC_INDEX = 2;

function logTimestamp(log: BlockscoutLog): number {
  const iso = log.block_timestamp ?? log.timestamp;
  if (iso) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return ms;
  }
  // Without a timestamp we can't place the log in a window. Treat as
  // out-of-range so the walk stops rather than over-counts.
  return Number.NEGATIVE_INFINITY;
}

export function useJkpActivePlayers(pollMs = POLL_MS) {
  const [state, setState] = useState<State>({
    daily: null,
    weekly: null,
    isLoading: true,
    error: null,
    lastFetchedAt: null,
  });

  const inFlight = useRef<AbortController | null>(null);

  const fetchActivity = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const now = Date.now();
      const weekCutoff = now - WEEK_MS;
      const dayCutoff = now - DAY_MS;

      const stopBefore = (log: BlockscoutLog) => logTimestamp(log) < weekCutoff;
      const keep = (log: BlockscoutLog) => {
        const t0 = log.topics[0];
        return t0 ? JKP_PARTICIPATION_TOPICS.has(t0) : false;
      };

      const logs = await walkAddressLogs(YOKI_JKP, stopBefore, keep, 80, controller.signal);

      const weeklySet = new Set<string>();
      const dailySet = new Set<string>();

      for (const log of logs) {
        const topic = log.topics[PLAYER_TOPIC_INDEX];
        if (!topic) continue;
        const addr = topicToAddress(topic);
        if (MONITOR_IGNORE_LIST.has(addr)) continue;
        const ts = logTimestamp(log);
        if (ts >= weekCutoff) weeklySet.add(addr);
        if (ts >= dayCutoff) dailySet.add(addr);
      }

      setState({
        daily: dailySet.size,
        weekly: weeklySet.size,
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
    fetchActivity();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchActivity, pollMs);
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
        fetchActivity();
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
  }, [fetchActivity, pollMs]);

  return { ...state, refetch: fetchActivity };
}
