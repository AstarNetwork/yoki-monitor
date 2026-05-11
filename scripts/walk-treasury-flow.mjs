#!/usr/bin/env node
// 1.3 — Yoki treasury inflow / outflow event walker.
// Walks ERC-20 Transfer events on ASTR with to=treasury (inflows, silent)
// and from=treasury (outflows, Slack CRITICAL). Maintains a block-number
// checkpoint at data/.checkpoint-treasury.json so each tick only walks
// new history.
//
// Dry-run: set TREASURY_OUTFLOW_DRY_RUN=true to suppress Slack and just
// log to workflow output. Required before treasury custody owner confirms
// expected outflow events.

import { formatUnits, parseAbiItem } from "viem";
import { ASTR_DECIMALS, ASTR_TOKEN, YOKI_TREASURY } from "./lib/addresses.mjs";
import { appendJsonl, readJson, writeJson } from "./lib/jsonl.mjs";
import { publicClient } from "./lib/rpc.mjs";
import { blockscoutAddressUrl, blockscoutTxUrl, postSlack } from "./lib/slack.mjs";

const CHECKPOINT_FILE = "data/.checkpoint-treasury.json";
const INFLOWS_FILE = "data/treasury-inflows.jsonl";
const OUTFLOWS_FILE = "data/treasury-outflows.jsonl";

// Soneium public RPC may cap eth_getLogs at 10k blocks per call. Walk in
// chunks to stay safe across providers.
const CHUNK_SIZE = 5_000n;
// Bootstrap window for the very first run when no checkpoint exists.
// ~3 weeks of Soneium at 2s blocks. Override via TREASURY_INITIAL_BLOCK
// (or the workflow_dispatch input) to backfill from the YokiCores deploy
// block on Soneium (2026-04-29; exact block on Blockscout).
const BOOTSTRAP_LOOKBACK = 1_000_000n;

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const dryRun = process.env.TREASURY_OUTFLOW_DRY_RUN === "true";

async function main() {
  const latest = await publicClient.getBlockNumber();

  let fromBlock;
  const checkpoint = await readJson(CHECKPOINT_FILE);
  if (checkpoint?.blockNumber) {
    fromBlock = BigInt(checkpoint.blockNumber) + 1n;
  } else if (process.env.TREASURY_INITIAL_BLOCK) {
    fromBlock = BigInt(process.env.TREASURY_INITIAL_BLOCK);
  } else {
    fromBlock = latest > BOOTSTRAP_LOOKBACK ? latest - BOOTSTRAP_LOOKBACK : 0n;
    console.log(`[treasury-flow] no checkpoint, bootstrapping from block ${fromBlock}`);
  }

  if (fromBlock > latest) {
    console.log(`[treasury-flow] checkpoint ${fromBlock} ahead of latest ${latest}, nothing to do`);
    return;
  }

  let inflowCount = 0;
  let outflowCount = 0;
  const outflowAlerts = [];

  for (let start = fromBlock; start <= latest; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > latest ? latest : start + CHUNK_SIZE - 1n;

    // Inflows: Transfer(*, treasury, *)
    const inflows = await publicClient.getLogs({
      address: ASTR_TOKEN,
      event: TRANSFER_EVENT,
      args: { to: YOKI_TREASURY },
      fromBlock: start,
      toBlock: end,
    });

    for (const log of inflows) {
      const value = log.args.value ?? 0n;
      const timestamp = new Date().toISOString();
      await appendJsonl(INFLOWS_FILE, {
        timestamp,
        blockNumber: log.blockNumber.toString(),
        txHash: log.transactionHash,
        from: log.args.from,
        valueWei: value.toString(),
        valueAstr: formatUnits(value, ASTR_DECIMALS),
        logIndex: log.logIndex,
      });
      inflowCount += 1;
    }

    // Outflows: Transfer(treasury, *, *) — should be zero in normal operation.
    const outflows = await publicClient.getLogs({
      address: ASTR_TOKEN,
      event: TRANSFER_EVENT,
      args: { from: YOKI_TREASURY },
      fromBlock: start,
      toBlock: end,
    });

    for (const log of outflows) {
      const value = log.args.value ?? 0n;
      const timestamp = new Date().toISOString();
      const record = {
        timestamp,
        blockNumber: log.blockNumber.toString(),
        txHash: log.transactionHash,
        to: log.args.to,
        valueWei: value.toString(),
        valueAstr: formatUnits(value, ASTR_DECIMALS),
        logIndex: log.logIndex,
        dryRun,
      };
      await appendJsonl(OUTFLOWS_FILE, record);
      outflowAlerts.push(record);
      outflowCount += 1;
    }

    // Inflows are usually pure mint Transfer events from msg.sender; if
    // from == treasury that would also appear in outflows (self-send is
    // unusual but possible). No special-case needed: both files capture it.

    console.log(
      `[treasury-flow] blocks ${start}-${end}: inflows=${inflows.length} outflows=${outflows.length}`,
    );
  }

  await writeJson(CHECKPOINT_FILE, {
    blockNumber: latest.toString(),
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[treasury-flow] done: ${inflowCount} inflows, ${outflowCount} outflows, checkpoint=${latest}`,
  );

  // Fire alerts. Anti-flood: if >5 outflows in one tick, batch into a
  // single Slack message ("N outflows detected, see workflow run").
  if (outflowAlerts.length === 0) return;

  if (dryRun) {
    console.warn(`[treasury-flow] DRY RUN: would have alerted on ${outflowAlerts.length} outflow(s)`);
    return;
  }

  if (outflowAlerts.length > 5) {
    await postSlack({
      severity: "CRITICAL",
      title: `${outflowAlerts.length} treasury outflows detected this tick (potential mass-drain)`,
      fields: [
        { label: "Treasury", value: `<${blockscoutAddressUrl(YOKI_TREASURY)}|${YOKI_TREASURY}>` },
        { label: "First outflow tx", value: `<${blockscoutTxUrl(outflowAlerts[0].txHash)}|tx>` },
        { label: "Block range", value: `${fromBlock} – ${latest}` },
      ],
    });
    return;
  }

  for (const out of outflowAlerts) {
    await postSlack({
      severity: "CRITICAL",
      title: `Treasury ASTR outflow: ${out.valueAstr} → ${shortAddress(out.to)}`,
      fields: [
        { label: "From", value: `<${blockscoutAddressUrl(YOKI_TREASURY)}|treasury>` },
        { label: "To", value: `<${blockscoutAddressUrl(out.to)}|${out.to}>` },
        { label: "Amount", value: `${out.valueAstr} ASTR` },
        { label: "Tx", value: `<${blockscoutTxUrl(out.txHash)}|${out.txHash.slice(0, 10)}…>` },
        { label: "Block", value: out.blockNumber },
      ],
    });
  }
}

function shortAddress(address) {
  if (!address || address.length < 12) return address ?? "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

main().catch((err) => {
  console.error("[treasury-flow] error:", err);
  process.exit(1);
});
