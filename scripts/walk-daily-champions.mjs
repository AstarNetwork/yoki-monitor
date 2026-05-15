#!/usr/bin/env node
// 2.5a — Daily Champions snapshot cron.
// Reads the launch repo's public /api/daily-champions/today endpoint (which
// carries both today's live top-10 and yesterday's finalized winners in a
// single payload) and writes data/daily-champions.json. Re-computes a
// cross-day frequency tally so operators can spot wallets that ranked
// top-5 across many days, cross-referenced against flagged.json and
// suspicious-pairs.json on the SPA.
//
// Spec: YOKI_MONITOR_SPEC.md §4a. Lifecycle:
// - Runs every 30 min during the campaign window (2026-05-13 → 2026-06-02)
//   plus a 1-day grace through 2026-06-03 to capture the final finalization.
// - Outside that window, exits as a no-op so the JSONL stays frozen.

import {
  CAMPAIGN_END,
  CAMPAIGN_START,
  applyBackfill,
  applyYesterday,
  buildTodayEntry,
  computeFrequencyTally,
  shouldRun,
} from "./lib/daily-champions.mjs";
import { readJson, writeJson } from "./lib/jsonl.mjs";

const DC_API_TODAY = process.env.DC_API_TODAY ?? "https://yoki-arcade.astar.network/api/daily-champions/today";
const DATA_FILE = "data/daily-champions.json";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function main() {
  const now = new Date();
  if (!shouldRun(now)) {
    console.log(`[dc] post-campaign (${now.toISOString()} > ${CAMPAIGN_END} + grace), no-op`);
    return;
  }

  let payload;
  try {
    payload = await fetchJson(DC_API_TODAY);
  } catch (err) {
    // API down or 404 (e.g. before flag flip). Don't rewrite the file;
    // preserve last-known-good state.
    console.warn(`[dc] api-error: ${err.message}`);
    process.exitCode = 0;
    return;
  }

  const doc = (await readJson(DATA_FILE)) ?? {
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    lastUpdatedAt: null,
    days: {},
    frequencyTally: [],
  };

  // Today: rewrite each tick (winners + top-5 churn until day finalizes).
  // Skip if the day in the doc is already marked finalized (shouldn't
  // happen — once today rolls over, the API returns the NEW today's data
  // and the old day appears under yesterday — but defensive).
  const todayEntry = buildTodayEntry(payload?.today);
  if (todayEntry && !doc.days[todayEntry.day]?.finalized) {
    doc.days[todayEntry.day] = todayEntry;
  }

  // Yesterday: merge finalized winners into whatever live snapshot we had,
  // preserving its top-5 list.
  const yesterdayDay = payload?.yesterday?.day;
  if (yesterdayDay) {
    const merged = applyYesterday(doc.days[yesterdayDay] ?? null, payload.yesterday);
    if (merged) doc.days[yesterdayDay] = merged;
  }

  applyBackfill(doc.days);
  doc.frequencyTally = computeFrequencyTally(doc.days);
  doc.lastUpdatedAt = now.toISOString();

  await writeJson(DATA_FILE, doc);

  const finalizedCount = Object.values(doc.days).filter((d) => d.finalized).length;
  const inProgressCount = Object.values(doc.days).filter((d) => !d.finalized).length;
  console.log(
    `[dc] snapshot ok: ${finalizedCount} finalized + ${inProgressCount} in-progress days, ${doc.frequencyTally.length} tracked addresses`,
  );
}

main().catch((err) => {
  console.error("[dc] error:", err);
  process.exit(1);
});
