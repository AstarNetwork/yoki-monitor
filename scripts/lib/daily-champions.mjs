// Pure helpers for the 2.5 Daily Champions snapshot cron. The cron itself
// (scripts/walk-daily-champions.mjs) handles the API fetch + file IO; this
// module just transforms shapes and is testable in isolation.
//
// Production API shape (https://yoki-arcade.astar.network/api/daily-champions/today)
// — verified live 2026-05-14:
//   {
//     today: { day, streak: [{address, metricValue}, ... up to 10],
//                    matches: [...], firstMatch: {address, metricValue} },
//     yesterday: { day, streakWinner, streakValue, matchesWinner, matchesValue,
//                  firstMatchWinner, finalizedAt },
//     myRanks: { ... }
//   }
// Note that `today` carries the live top-10 lists; `yesterday` carries only
// the finalized winner addresses. So if yoki-monitor wants top-5-per-day
// history, it has to snapshot today's top-N on every tick BEFORE the day
// rolls over and the API drops the top list.

export const CAMPAIGN_START = "2026-05-13T14:00:00Z";
export const CAMPAIGN_END = "2026-06-02T23:59:59Z";
export const GRACE_DAYS_AFTER_END = 1;
export const TOP_K = 5;
export const CATEGORIES = ["streak", "matches", "firstMatch"];

// Hardcoded metric values for days that finalized before yoki-monitor's
// cron + the winnerValues schema were both in place. The launch API
// drops the top list once a day rolls over to `yesterday`, and there's
// no public per-date route, so these can't be re-derived from public
// endpoints. Values pulled by the operator via Upstash console:
// `GET dc:day:2026-05-13:winners` → streakValue=6, matchesValue=24.
// firstMatch is binary, no value to backfill.
export const BACKFILL_WINNER_VALUES = {
  "2026-05-13": { streak: 6, matches: 24, firstMatch: null },
};

// Hardcoded first-match resolved-at timestamps (Unix seconds). The
// launch API never exposed this field, but Upstash stores it on
// `dc:day:{date}:firstMatch → {address, matchId, resolvedAtBlock,
// resolvedAtTimestamp}`. Operator pulled these via console queries
// for the three days finalized at the time of this backfill. Days
// 2026-05-16 onward depend on a forward-capture mechanism (TBD —
// will likely store block timestamps in jkp-matches.json so the cron
// can derive resolvedAt without RPC roundtrips per tick).
export const BACKFILL_FIRST_MATCH_RESOLVED_AT = {
  "2026-05-13": 1778684303,
  "2026-05-14": 1778716955,
  "2026-05-15": 1778803489,
};

// Day-1 carve-out: campaign kickoff was shifted to 14:00 UTC instead of
// 00:00 UTC on 2026-05-13, so the firstMatch window for Day 1 starts
// 14h later than every other day. Codified here so the derivation
// helper picks the right window without hardcoding strings elsewhere.
export const DAY_1_DATE = "2026-05-13";
export const DAY_1_KICKOFF_HOUR_UTC = 14;

// Returns Unix seconds for the day's first-match eligibility window.
// Days 2-21: midnight UTC of `day`. Day 1: 14:00 UTC of 2026-05-13.
export function dayStartUnixSeconds(day) {
  const midnight = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
  if (day === DAY_1_DATE) return midnight + DAY_1_KICKOFF_HOUR_UTC * 3600;
  return midnight;
}

// Derive `firstMatchResolvedAt` for each day where it's missing, using
// the JKP match index that walk-jkp-events.mjs maintains. Returns the
// `days` object for chaining. Skips days where the cron already
// captured a value (from API) or applyBackfill already set one.
//
// Algorithm: for each day with winners.firstMatch set but no
// firstMatchResolvedAt yet, find the earliest resolved/draw match in
// jkp-matches.json where playerA === winners.firstMatch and the match's
// resolvedAtTimestamp falls inside the day's UTC window. The DC
// API's firstMatch winner is by definition playerA of the first
// resolved/drawn match of the day, so this match-up should yield the
// same timestamp Upstash would.
export function deriveFirstMatchResolvedAt(days, jkpMatches) {
  if (!jkpMatches) return days;

  for (const entry of Object.values(days)) {
    if (typeof entry.firstMatchResolvedAt === "number") continue;
    const winner = entry.winners?.firstMatch;
    if (!winner) continue;

    const dayStart = dayStartUnixSeconds(entry.day);
    const dayEnd = dayStart + 24 * 3600;
    const winnerLower = winner.toLowerCase();

    let earliest = null;
    for (const match of Object.values(jkpMatches)) {
      if (match.status !== "resolved" && match.status !== "draw") continue;
      if (typeof match.resolvedAtTimestamp !== "number") continue;
      if (match.playerA?.toLowerCase() !== winnerLower) continue;
      if (match.resolvedAtTimestamp < dayStart || match.resolvedAtTimestamp >= dayEnd) continue;
      if (earliest === null || match.resolvedAtTimestamp < earliest) {
        earliest = match.resolvedAtTimestamp;
      }
    }
    if (earliest !== null) entry.firstMatchResolvedAt = earliest;
  }
  return days;
}

// Apply hardcoded backfills onto a `days` object in place. Only fills
// slots that are currently null/undefined — never overwrites a value
// the cron captured naturally from the API.
export function applyBackfill(
  days,
  valuesBackfill = BACKFILL_WINNER_VALUES,
  firstMatchBackfill = BACKFILL_FIRST_MATCH_RESOLVED_AT,
) {
  for (const [day, values] of Object.entries(valuesBackfill)) {
    const entry = days[day];
    if (!entry) continue;
    const existing = entry.winnerValues ?? { streak: null, matches: null, firstMatch: null };
    entry.winnerValues = {
      streak: existing.streak ?? values.streak ?? null,
      matches: existing.matches ?? values.matches ?? null,
      firstMatch: existing.firstMatch ?? values.firstMatch ?? null,
    };
  }
  for (const [day, resolvedAt] of Object.entries(firstMatchBackfill)) {
    const entry = days[day];
    if (!entry) continue;
    if (entry.firstMatchResolvedAt == null) {
      entry.firstMatchResolvedAt = resolvedAt;
    }
  }
  return days;
}

// Returns true if the cron should write today. Outside the campaign window
// (with a 1-day grace after end to capture the final finalization tick) the
// cron exits as a no-op so the JSONL stays frozen for historical use.
export function shouldRun(now, campaignEnd = CAMPAIGN_END, graceDays = GRACE_DAYS_AFTER_END) {
  const endMs = Date.parse(campaignEnd);
  const cutoffMs = endMs + graceDays * 24 * 60 * 60 * 1000;
  return now.getTime() <= cutoffMs;
}

// Slice the API's top-N list to top-K and normalize address case. Drops any
// entry missing an address (defensive against API quirks).
export function sliceTop(list, k = TOP_K) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, k)
    .map((entry) => {
      const address = typeof entry?.address === "string" ? entry.address.toLowerCase() : null;
      if (!address) return null;
      return { address, metricValue: entry.metricValue ?? null };
    })
    .filter(Boolean);
}

// Build today's day entry from the API's `today` payload. The winner per
// category is the first entry of each list (matches doesn't actually
// require sortedness assumptions — the API sorts, we trust).
export function buildTodayEntry(today) {
  if (!today?.day) return null;
  const streakTop = sliceTop(today.streak);
  const matchesTop = sliceTop(today.matches);
  const firstMatchAddress =
    typeof today.firstMatch?.address === "string" ? today.firstMatch.address.toLowerCase() : null;
  const firstMatchEntry = firstMatchAddress
    ? { address: firstMatchAddress, metricValue: today.firstMatch.metricValue ?? null }
    : null;

  return {
    day: today.day,
    winners: {
      streak: streakTop[0]?.address ?? null,
      matches: matchesTop[0]?.address ?? null,
      firstMatch: firstMatchEntry?.address ?? null,
    },
    // Parallel structure mirroring the launch app's modal — surfaces the
    // metric so operators see "11 wins" / "35 matches" alongside the
    // winning address. firstMatch has no meaningful value (the API's
    // metricValue is always 1 for "did the first match").
    winnerValues: {
      streak: streakTop[0]?.metricValue ?? null,
      matches: matchesTop[0]?.metricValue ?? null,
      firstMatch: null,
    },
    top5: {
      streak: streakTop,
      matches: matchesTop,
      firstMatch: firstMatchEntry ? [firstMatchEntry] : [],
    },
    finalized: false,
  };
}

// Apply the finalized winners from `yesterday` to an existing day entry,
// preserving the top-5 list captured live during that day. If no existing
// entry (e.g. cron was added mid-campaign), create one with empty top-5.
export function applyYesterday(existingEntry, yesterday) {
  if (!yesterday?.day) return existingEntry ?? null;

  const winners = {
    streak: typeof yesterday.streakWinner === "string" ? yesterday.streakWinner.toLowerCase() : null,
    matches: typeof yesterday.matchesWinner === "string" ? yesterday.matchesWinner.toLowerCase() : null,
    firstMatch: typeof yesterday.firstMatchWinner === "string" ? yesterday.firstMatchWinner.toLowerCase() : null,
  };
  const winnerValues = {
    streak: typeof yesterday.streakValue === "number" ? yesterday.streakValue : null,
    matches: typeof yesterday.matchesValue === "number" ? yesterday.matchesValue : null,
    firstMatch: null,
  };

  if (existingEntry) {
    return {
      ...existingEntry,
      day: yesterday.day,
      winners,
      winnerValues,
      finalized: true,
      finalizedAt: yesterday.finalizedAt ?? existingEntry.finalizedAt ?? null,
    };
  }
  return {
    day: yesterday.day,
    winners,
    winnerValues,
    top5: { streak: [], matches: [], firstMatch: [] },
    finalized: true,
    finalizedAt: yesterday.finalizedAt ?? null,
  };
}

// Recompute the cross-day frequency table from finalized days only.
// In-progress days aren't counted because their top-5 can still shuffle.
// Sort: desc by top5Days, then asc by address for deterministic output
// across re-runs.
export function computeFrequencyTally(days) {
  const byAddress = new Map();

  for (const day of Object.values(days)) {
    if (!day.finalized) continue;

    // Union of top-5 addresses across the three categories. Set ensures we
    // count "top-5 days" as a single per-day event regardless of how many
    // categories the address appeared in.
    const dayUnion = new Set();
    for (const cat of CATEGORIES) {
      const entries = day.top5?.[cat] ?? [];
      for (const entry of entries) {
        const addr = entry?.address?.toLowerCase();
        if (addr) dayUnion.add(addr);
      }
    }

    for (const addr of dayUnion) {
      const acc = byAddress.get(addr) ?? {
        address: addr,
        top5Days: 0,
        winDays: 0,
        perCategory: { streak: 0, matches: 0, firstMatch: 0 },
      };
      acc.top5Days += 1;
      byAddress.set(addr, acc);
    }

    // perCategory: how many days an address appears in that specific
    // category's top-5.
    for (const cat of CATEGORIES) {
      const entries = day.top5?.[cat] ?? [];
      const seen = new Set();
      for (const entry of entries) {
        const addr = entry?.address?.toLowerCase();
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);
        const acc = byAddress.get(addr);
        if (acc) acc.perCategory[cat] += 1;
      }
    }

    // Win days: count of categories where this address is the daily winner.
    const winners = day.winners ?? {};
    for (const cat of CATEGORIES) {
      const winner = winners[cat];
      if (!winner) continue;
      const acc = byAddress.get(winner.toLowerCase());
      if (acc) acc.winDays += 1;
    }
  }

  return Array.from(byAddress.values()).sort((a, b) => {
    if (b.top5Days !== a.top5Days) return b.top5Days - a.top5Days;
    if (b.winDays !== a.winDays) return b.winDays - a.winDays;
    return a.address.localeCompare(b.address);
  });
}
