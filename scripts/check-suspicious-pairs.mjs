#!/usr/bin/env node
// 2.5 — Suspicious-pairs trigger.
// Reads data/jkp-pairs.json (produced by walk-jkp-events.mjs) and flags
// any pair where the two addresses have played each other ≥10 times AND
// those matches are ≥50% of either participant's total volume. Persists
// state in data/suspicious-pairs.json (same shape as flagged.json:
// audit-friendly, kept after clear).
//
// Heuristic locked at YOKI_MONITOR_SPEC.md §7.2. Catches the 2-wallet
// collusion pattern that the Carnival pair-cap and Daily Champions
// diversity-tiebreaker defend against during their campaigns; this trigger
// covers the same pattern in the long-running monitor surface.

import { readJson, writeJson } from "./lib/jsonl.mjs";
import { blockscoutAddressUrl, postSlack } from "./lib/slack.mjs";
import { MIN_PAIR_COUNT, MIN_PAIR_SHARE, evaluatePairs } from "./lib/suspicious-pairs.mjs";

const PAIRS_FILE = "data/jkp-pairs.json";
const FLAGGED_FILE = "data/suspicious-pairs.json";

const dryRun = process.env.SUSPICIOUS_PAIRS_DRY_RUN === "true";

async function main() {
  const pairsDoc = await readJson(PAIRS_FILE);
  if (!pairsDoc?.pairs) {
    console.log("[pairs] no pairs index yet, nothing to scan");
    return;
  }

  const matches = evaluatePairs(pairsDoc.pairs);

  const flaggedDoc = (await readJson(FLAGGED_FILE)) ?? {
    flagged: [],
    lastUpdatedBlock: null,
    lastUpdatedAt: null,
  };
  const byKey = new Map(flaggedDoc.flagged.map((f) => [keyOf(f.addressA, f.addressB), f]));

  const newlyFlagged = [];
  const newlyCleared = [];

  // Build a fresh set of currently-suspicious pair keys for fast cleared
  // detection in the second pass.
  const currentlySuspicious = new Set(matches.map((m) => keyOf(m.addressA, m.addressB)));

  for (const pair of matches) {
    const key = keyOf(pair.addressA, pair.addressB);
    const existing = byKey.get(key);
    if (!existing || existing.cleared) {
      const entry = {
        addressA: pair.addressA,
        addressB: pair.addressB,
        flaggedAt: new Date().toISOString(),
        cleared: false,
        evidence: {
          count: pair.count,
          matchesA: pair.matchesA,
          matchesB: pair.matchesB,
          shareA: round(pair.shareA, 3),
          shareB: round(pair.shareB, 3),
        },
      };
      byKey.set(key, entry);
      newlyFlagged.push(entry);
    }
  }

  // Second pass — clear any currently-flagged-not-cleared pair that no
  // longer meets the heuristic.
  for (const [key, entry] of byKey.entries()) {
    if (entry.cleared) continue;
    if (currentlySuspicious.has(key)) continue;
    entry.cleared = true;
    entry.clearedAt = new Date().toISOString();
    newlyCleared.push(entry);
  }

  flaggedDoc.flagged = Array.from(byKey.values()).sort((a, b) =>
    keyOf(a.addressA, a.addressB).localeCompare(keyOf(b.addressA, b.addressB)),
  );
  flaggedDoc.lastUpdatedBlock = pairsDoc.lastUpdatedBlock ?? null;
  flaggedDoc.lastUpdatedAt = new Date().toISOString();
  flaggedDoc.thresholds = { minCount: MIN_PAIR_COUNT, minShare: MIN_PAIR_SHARE };
  await writeJson(FLAGGED_FILE, flaggedDoc);

  console.log(
    `[pairs] scanned ${pairsDoc.pairs.length} pairs, ${newlyFlagged.length} newly flagged, ${newlyCleared.length} cleared`,
  );

  for (const entry of newlyFlagged) {
    if (dryRun) {
      console.warn(`[pairs] DRY RUN: would have alerted on (${entry.addressA}, ${entry.addressB})`);
      continue;
    }
    const dominantShare = Math.max(entry.evidence.shareA, entry.evidence.shareB);
    await postSlack({
      severity: "CRITICAL",
      title: `Suspicious pair: ${short(entry.addressA)} ↔ ${short(entry.addressB)} (${entry.evidence.count} matches, ${(dominantShare * 100).toFixed(0)}% of one player)`,
      fields: [
        { label: "Address A", value: `<${blockscoutAddressUrl(entry.addressA)}|${entry.addressA}>` },
        { label: "Address B", value: `<${blockscoutAddressUrl(entry.addressB)}|${entry.addressB}>` },
        { label: "Pair matches", value: String(entry.evidence.count) },
        {
          label: "Share of A / B",
          value: `${(entry.evidence.shareA * 100).toFixed(0)}% (${entry.evidence.matchesA}) / ${(entry.evidence.shareB * 100).toFixed(0)}% (${entry.evidence.matchesB})`,
        },
        { label: "Threshold", value: `≥${MIN_PAIR_COUNT} matches AND ≥${MIN_PAIR_SHARE * 100}% of either side` },
      ],
    });
  }

  for (const entry of newlyCleared) {
    if (dryRun) continue;
    await postSlack({
      severity: "INFO",
      title: `Suspicious-pair trigger cleared for ${short(entry.addressA)} ↔ ${short(entry.addressB)}`,
    });
  }
}

function keyOf(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function short(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function round(n, decimals) {
  const k = 10 ** decimals;
  return Math.round(n * k) / k;
}

main().catch((err) => {
  console.error("[pairs] error:", err);
  process.exit(1);
});
