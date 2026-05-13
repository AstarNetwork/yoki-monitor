#!/usr/bin/env node
// 1.2 — Yoki treasury ASTR balance snapshotter.
// Reads astrToken.balanceOf(treasury) on Soneium and appends a snapshot
// row to data/treasury-balance.jsonl every cron tick (hourly) to feed
// the Phase 2 chart. Optional Slack heartbeat (TREASURY_HEARTBEAT=true)
// posts only at the UTC hours listed in HEARTBEAT_UTC_HOURS so the
// channel doesn't get flooded.

import { erc20Abi, formatUnits } from "viem";
import { ASTR_DECIMALS, ASTR_TOKEN, YOKI_TREASURY } from "./lib/addresses.mjs";
import { appendJsonl } from "./lib/jsonl.mjs";
import { publicClient } from "./lib/rpc.mjs";
import { blockscoutAddressUrl, postSlack } from "./lib/slack.mjs";

const DATA_FILE = "data/treasury-balance.jsonl";

// Slack heartbeat fires at most twice per day: 09:00 UTC and 18:00 UTC.
// `getUTCHours()` returns 9 for any tick between 09:00 and 09:59, so a
// GitHub cron delay inside that window still posts. Delays that cross
// the hour boundary miss the slot — that's fine, the next slot ~9h
// later will hit.
const HEARTBEAT_UTC_HOURS = new Set([9, 18]);

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

  if (process.env.TREASURY_HEARTBEAT === "true" && HEARTBEAT_UTC_HOURS.has(new Date().getUTCHours())) {
    await postSlack({
      severity: "INFO",
      title: `Treasury snapshot: ${Math.round(Number(balanceAstr)).toLocaleString("en-US")} ASTR`,
      fields: [
        { label: "Address", value: `<${blockscoutAddressUrl(YOKI_TREASURY)}|${YOKI_TREASURY}>` },
        { label: "Block", value: block.toString() },
      ],
    });
  }
}

main().catch((err) => {
  console.error("[treasury] error:", err);
  process.exit(1);
});
