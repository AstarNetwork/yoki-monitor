#!/usr/bin/env node
// 1.2 — Yoki treasury ASTR balance snapshotter.
// Reads astrToken.balanceOf(treasury) on Soneium and appends a snapshot
// row to data/treasury-balance.jsonl every cron tick (daily) to feed
// the Phase 2 chart. Optional Slack heartbeat (TREASURY_HEARTBEAT=true)
// posts at most once a week so the channel doesn't get flooded.

import { erc20Abi, formatUnits } from "viem";
import { ASTR_DECIMALS, ASTR_TOKEN, YOKI_TREASURY } from "./lib/addresses.mjs";
import { appendJsonl, readJson, writeJson } from "./lib/jsonl.mjs";
import { publicClient } from "./lib/rpc.mjs";
import { blockscoutAddressUrl, postSlack } from "./lib/slack.mjs";

const DATA_FILE = "data/treasury-balance.jsonl";
const HEARTBEAT_STATE_FILE = "data/.heartbeat-treasury.json";

// Weekly Slack heartbeat, gated on elapsed time since the last post rather
// than on a fixed weekday+hour. A day-and-hour gate would be fragile here:
// GitHub drops scheduled runs under load (this repo has seen 3h gaps at
// hourly cadence), and with only one tick a day a single missed slot would
// mean two weeks of silence.
//
// The threshold is 6.5 days, not 7. With a daily tick, requiring a full 7
// days means any tick that fires a minute early is rejected and the post
// slips to day 8, then day 9, drifting later every week. 6.5 days fires
// reliably on day 7 and can never fire on day 6.
const HEARTBEAT_INTERVAL_MS = 6.5 * 24 * 60 * 60 * 1000;

async function main() {
  const block = await publicClient.getBlockNumber();
  const balance = await publicClient.readContract({
    address: ASTR_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [YOKI_TREASURY],
    blockNumber: block,
  });
  const balanceAstr = formatUnits(balance, ASTR_DECIMALS);
  const timestamp = new Date().toISOString();

  await appendJsonl(DATA_FILE, {
    timestamp,
    blockNumber: block.toString(),
    balanceAstrWei: balance.toString(),
    balanceAstr,
  });

  console.log(`[treasury] block=${block} balance=${balanceAstr} ASTR`);

  if (process.env.TREASURY_HEARTBEAT !== "true") return;

  const now = Date.now();
  const state = await readJson(HEARTBEAT_STATE_FILE);
  const lastPostedAt = state?.lastPostedAt ? Date.parse(state.lastPostedAt) : null;

  if (lastPostedAt && now - lastPostedAt < HEARTBEAT_INTERVAL_MS) {
    const daysAgo = ((now - lastPostedAt) / 86_400_000).toFixed(1);
    console.log(`[treasury] heartbeat posted ${daysAgo}d ago, skipping`);
    return;
  }

  await postSlack({
    severity: "INFO",
    title: `Treasury snapshot: ${Math.round(Number(balanceAstr)).toLocaleString("en-US")} ASTR`,
    fields: [
      { label: "Address", value: `<${blockscoutAddressUrl(YOKI_TREASURY)}|${YOKI_TREASURY}>` },
      { label: "Block", value: block.toString() },
    ],
  });

  // Written only after the post resolves, so a Slack failure retries on the
  // next daily tick instead of silently burning the week's slot.
  await writeJson(HEARTBEAT_STATE_FILE, { lastPostedAt: new Date(now).toISOString() });
  console.log("[treasury] weekly heartbeat posted");
}

main().catch((err) => {
  console.error("[treasury] error:", err);
  process.exit(1);
});
