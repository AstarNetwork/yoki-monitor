#!/usr/bin/env node
// 1.7 — Bot matchmaking wallet balance snapshotter.
// Reads ETH + ASTR balances for the funding wallet + four bot wallets in
// parallel, appends one row to data/bot-balances.jsonl per tick. Silent
// (no Slack alert) — the bot Lambda owns auto-disable + balance alerts.

import { erc20Abi, formatEther, formatUnits } from "viem";
import { ASTR_DECIMALS, ASTR_TOKEN, BOT_WALLETS } from "./lib/addresses.mjs";
import { appendJsonl } from "./lib/jsonl.mjs";
import { publicClient } from "./lib/rpc.mjs";

const DATA_FILE = "data/bot-balances.jsonl";

async function readEth(address) {
  const wei = await publicClient.getBalance({ address });
  return { wei: wei.toString(), eth: formatEther(wei) };
}

async function readAstr(address) {
  const wei = await publicClient.readContract({
    address: ASTR_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return { wei: wei.toString(), astr: formatUnits(wei, ASTR_DECIMALS) };
}

async function main() {
  const block = await publicClient.getBlockNumber();
  const timestamp = new Date().toISOString();

  // 10 parallel reads — public RPC handles this comfortably and the
  // hourly cadence keeps the burst rate well within rate limits.
  const balances = {};
  await Promise.all(
    BOT_WALLETS.flatMap((b) => [
      readEth(b.address).then((res) => {
        balances[b.address] = { ...(balances[b.address] ?? {}), label: b.label, eth: res };
      }),
      readAstr(b.address).then((res) => {
        balances[b.address] = { ...(balances[b.address] ?? {}), label: b.label, astr: res };
      }),
    ]),
  );

  await appendJsonl(DATA_FILE, {
    timestamp,
    blockNumber: block.toString(),
    balances,
  });

  const summary = BOT_WALLETS.map((b) => {
    const entry = balances[b.address];
    return `${b.label}=${entry?.eth?.eth ?? "?"} ETH / ${entry?.astr?.astr ?? "?"} ASTR`;
  }).join(" | ");
  console.log(`[bots] block=${block} ${summary}`);
}

main().catch((err) => {
  console.error("[bots] error:", err);
  process.exit(1);
});
