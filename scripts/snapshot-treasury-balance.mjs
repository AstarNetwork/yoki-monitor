#!/usr/bin/env node
// 1.2 — Yoki treasury ASTR balance snapshotter.
// Reads astrToken.balanceOf(treasury) on Soneium, appends a snapshot row
// to data/treasury-balance.jsonl. No Slack alert — this feeds the Phase 2
// chart. Optional first-week heartbeat (set TREASURY_HEARTBEAT=true).

import { erc20Abi, formatUnits } from "viem";
import { ASTR_DECIMALS, ASTR_TOKEN, YOKI_TREASURY } from "./lib/addresses.mjs";
import { appendJsonl } from "./lib/jsonl.mjs";
import { publicClient } from "./lib/rpc.mjs";
import { blockscoutAddressUrl, postSlack } from "./lib/slack.mjs";

const DATA_FILE = "data/treasury-balance.jsonl";

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

  if (process.env.TREASURY_HEARTBEAT === "true") {
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
