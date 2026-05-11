#!/usr/bin/env node
// 1.1 — MINTER hot-wallet ETH balance poll.
// Reads eth_getBalance(MINTER) on Soneium, appends a snapshot row to
// data/minter-balance.jsonl, and POSTs Slack on warn/critical threshold
// cross. Same-severity throttle: 60 min between alerts.

import { formatEther } from "viem";
import { MINTER_HOT_WALLET } from "./lib/addresses.mjs";
import { appendJsonl, findLastJsonl } from "./lib/jsonl.mjs";
import { publicClient } from "./lib/rpc.mjs";
import { blockscoutAddressUrl, postSlack } from "./lib/slack.mjs";

const DATA_FILE = "data/minter-balance.jsonl";
const WARN_WEI = 10_000_000_000_000_000n; // 0.01 ETH
const CRIT_WEI = 5_000_000_000_000_000n; // 0.005 ETH
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 60 min same-severity throttle

async function main() {
  const block = await publicClient.getBlockNumber();
  const balance = await publicClient.getBalance({
    address: MINTER_HOT_WALLET,
    blockNumber: block,
  });
  const balanceEth = formatEther(balance);
  const timestamp = new Date().toISOString();

  let severity = null;
  if (balance < CRIT_WEI) severity = "CRITICAL";
  else if (balance < WARN_WEI) severity = "WARN";

  const record = {
    timestamp,
    blockNumber: block.toString(),
    balanceWei: balance.toString(),
    balanceEth,
    severity,
  };

  await appendJsonl(DATA_FILE, record);
  console.log(`[minter] block=${block} balance=${balanceEth} ETH severity=${severity ?? "healthy"}`);

  if (!severity) return;

  const lastAlert = await findLastJsonl(DATA_FILE, (r) => r.severity === severity && r.alerted === true);
  if (lastAlert && Date.now() - Date.parse(lastAlert.timestamp) < ALERT_COOLDOWN_MS) {
    console.log(`[minter] ${severity} already alerted at ${lastAlert.timestamp}, throttled`);
    return;
  }

  await postSlack({
    severity,
    title:
      severity === "CRITICAL"
        ? `MINTER ETH critical: ${balanceEth} ETH (< 0.005)`
        : `MINTER ETH warn: ${balanceEth} ETH (< 0.01)`,
    fields: [
      { label: "Address", value: `<${blockscoutAddressUrl(MINTER_HOT_WALLET)}|${MINTER_HOT_WALLET}>` },
      { label: "Balance", value: `${balanceEth} ETH` },
      { label: "Block", value: block.toString() },
    ],
  });

  // Mark the alert so the throttle logic can find it on the next tick.
  // Append rather than overwrite so the audit log keeps the original snapshot.
  await appendJsonl(DATA_FILE, { ...record, alerted: true, alertedAt: new Date().toISOString() });
}

main().catch((err) => {
  console.error("[minter] error:", err);
  process.exit(1);
});
