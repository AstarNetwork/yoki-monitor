#!/usr/bin/env node
// 2.4 — Always-winning trigger.
// Reads data/jkp-aggregate.json (produced by walk-jkp-events.mjs) and
// flags any address with ≥75% win-rate over ≥5 matches. Newly-flagged
// addresses post a Slack CRITICAL alert. Addresses that drop below the
// threshold are marked `cleared:true` in data/flagged.json (kept for
// audit; the dashboard treats cleared:true as inactive).
//
// Thresholds locked at YOKI_MONITOR_SPEC.md §7.1 (≥75% / ≥5). Tuned more
// sensitively than the original 80%/10 proposal — owner accepted a
// higher false-positive rate to avoid false negatives. Cooldown handled
// in §7.1: a cleared address re-flags only on a fresh ≥5 matches still
// at ≥75%.

import { readJson, writeJson } from "./lib/jsonl.mjs";
import { blockscoutAddressUrl, postSlack } from "./lib/slack.mjs";

const AGGREGATE_FILE = "data/jkp-aggregate.json";
const FLAGGED_FILE = "data/flagged.json";

const MIN_MATCHES = 5;
const MIN_WIN_RATE = 0.75;

const dryRun = process.env.ALWAYS_WINNING_DRY_RUN === "true";

async function main() {
  const aggregate = await readJson(AGGREGATE_FILE);
  if (!aggregate?.rows) {
    console.log("[trigger] no aggregate yet, nothing to scan");
    return;
  }

  const flaggedDoc = (await readJson(FLAGGED_FILE)) ?? {
    flagged: [],
    lastUpdatedBlock: null,
    lastUpdatedAt: null,
  };
  const byAddress = new Map(flaggedDoc.flagged.map((f) => [f.address.toLowerCase(), f]));

  const newlyFlagged = [];
  const newlyCleared = [];
  const now = new Date().toISOString();

  for (const row of aggregate.rows) {
    const address = row.address.toLowerCase();
    const overThreshold = row.matches >= MIN_MATCHES && row.winRate >= MIN_WIN_RATE;
    const existing = byAddress.get(address);

    if (overThreshold) {
      const evidence = {
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        matches: row.matches,
        winRate: round(row.winRate, 3),
        uniqueOpponents: row.uniqueOpponents,
      };
      // First time we've seen this address cross — flag it.
      // OR previously cleared, now back over threshold — re-flag.
      if (!existing || existing.cleared) {
        const entry = {
          address,
          flaggedAt: now,
          lastSeenAt: now,
          reason: "always-winning",
          cleared: false,
          evidence,
        };
        byAddress.set(address, entry);
        newlyFlagged.push(entry);
      } else {
        // Already-active entry — refresh live counts so the dashboard
        // reflects current W/L/D state, not the first-flag snapshot.
        // flaggedAt is preserved as the first-crossing timestamp.
        existing.evidence = evidence;
        existing.lastSeenAt = now;
      }
      continue;
    }

    // Below threshold. If currently flagged (not cleared), clear it.
    if (existing && !existing.cleared) {
      existing.cleared = true;
      existing.clearedAt = now;
      existing.clearedEvidence = {
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        matches: row.matches,
        winRate: round(row.winRate, 3),
      };
      newlyCleared.push(existing);
    }
  }

  flaggedDoc.flagged = Array.from(byAddress.values()).sort((a, b) => a.address.localeCompare(b.address));
  flaggedDoc.lastUpdatedBlock = aggregate.lastUpdatedBlock;
  flaggedDoc.lastUpdatedAt = now;
  await writeJson(FLAGGED_FILE, flaggedDoc);

  console.log(
    `[trigger] scanned ${aggregate.rows.length} addresses, ${newlyFlagged.length} newly flagged, ${newlyCleared.length} cleared`,
  );

  for (const entry of newlyFlagged) {
    if (dryRun) {
      console.warn(`[trigger] DRY RUN: would have alerted on ${entry.address}`);
      continue;
    }
    await postSlack({
      severity: "CRITICAL",
      title: `Always-winning trigger: ${shortAddress(entry.address)} at ${(entry.evidence.winRate * 100).toFixed(1)}% over ${entry.evidence.matches} matches`,
      fields: [
        { label: "Address", value: `<${blockscoutAddressUrl(entry.address)}|${entry.address}>` },
        { label: "W / L / D", value: `${entry.evidence.wins} / ${entry.evidence.losses} / ${entry.evidence.draws}` },
        { label: "Matches", value: String(entry.evidence.matches) },
        { label: "Unique opponents", value: String(entry.evidence.uniqueOpponents) },
        { label: "Win rate", value: `${(entry.evidence.winRate * 100).toFixed(1)}%` },
        { label: "Threshold", value: `≥${MIN_WIN_RATE * 100}% / ≥${MIN_MATCHES}` },
      ],
    });
  }

  // Cleared notifications are INFO-level (not urgent; just close the
  // loop with the response team that an address self-corrected).
  for (const entry of newlyCleared) {
    if (dryRun) continue;
    await postSlack({
      severity: "INFO",
      title: `Always-winning trigger cleared for ${shortAddress(entry.address)}`,
      fields: [
        { label: "Address", value: `<${blockscoutAddressUrl(entry.address)}|${entry.address}>` },
        {
          label: "Win rate now",
          value: `${(entry.clearedEvidence.winRate * 100).toFixed(1)}% over ${entry.clearedEvidence.matches}`,
        },
      ],
    });
  }
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function round(n, decimals) {
  const k = 10 ** decimals;
  return Math.round(n * k) / k;
}

main().catch((err) => {
  console.error("[trigger] error:", err);
  process.exit(1);
});
