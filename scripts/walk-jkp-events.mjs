#!/usr/bin/env node
// 2.2 — Yoki JKP event walker.
// Walks all YokiJKP match-lifecycle events (MatchCreated/Joined/Revealed/
// Resolved/Draw/Cancelled/Swept) since the last checkpoint. Appends raw
// events to data/jkp-events.jsonl, maintains data/jkp-matches.json as the
// per-matchId state index, and recomputes data/jkp-aggregate.json from
// the index on every tick. The always-winning trigger reads
// jkp-aggregate.json.
//
// Walk-then-rebuild pattern: idempotent across re-runs. If the workflow
// dies mid-walk, next tick re-walks from the same checkpoint and
// re-application of events is a no-op on the match index (terminal
// statuses don't transition).

import { MONITOR_IGNORE_LIST, YOKI_JKP } from "./lib/addresses.mjs";
import { JKP_EVENTS, JKP_EVENT_LIST, aggregateMatches, applyEventToMatches } from "./lib/jkp.mjs";
import { appendJsonl, readJson, writeJson } from "./lib/jsonl.mjs";
import { publicClient } from "./lib/rpc.mjs";

const CHECKPOINT_FILE = "data/.checkpoint-jkp.json";
const EVENTS_JSONL = "data/jkp-events.jsonl";
const MATCHES_FILE = "data/jkp-matches.json";
const AGGREGATE_FILE = "data/jkp-aggregate.json";
const PAIRS_FILE = "data/jkp-pairs.json";

const CHUNK_SIZE = 5_000n;
// ~3 weeks of Soneium at 2s blocks. YokiJKP deployed 2026-04-29 so a
// fresh walk picks up everything since launch. Override via
// JKP_INITIAL_BLOCK on the workflow_dispatch input.
const BOOTSTRAP_LOOKBACK = 1_000_000n;

// Map of topic0 → event name for fast dispatch on logs returned by
// getLogs (which gives us already-decoded args but doesn't tell us
// which event matched when we pass a list).
const EVENT_NAMES_BY_TOPIC = new Map();
for (const [name, abi] of Object.entries(JKP_EVENTS)) {
  // viem's getLogs returns log.eventName when called with `events`; we
  // also keep the topic-hash map as a fallback for older viem
  // versions / paranoia.
  EVENT_NAMES_BY_TOPIC.set(abi.name, name);
}

async function main() {
  const latest = await publicClient.getBlockNumber();

  let fromBlock;
  const checkpoint = await readJson(CHECKPOINT_FILE);
  if (checkpoint?.blockNumber) {
    fromBlock = BigInt(checkpoint.blockNumber) + 1n;
  } else if (process.env.JKP_INITIAL_BLOCK) {
    fromBlock = BigInt(process.env.JKP_INITIAL_BLOCK);
  } else {
    fromBlock = latest > BOOTSTRAP_LOOKBACK ? latest - BOOTSTRAP_LOOKBACK : 0n;
    console.log(`[jkp] no checkpoint, bootstrapping from block ${fromBlock}`);
  }

  if (fromBlock > latest) {
    console.log(`[jkp] checkpoint ${fromBlock} ahead of latest ${latest}, nothing to do`);
    return;
  }

  const matches = (await readJson(MATCHES_FILE))?.matches ?? {};
  let newEventCount = 0;

  for (let start = fromBlock; start <= latest; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > latest ? latest : start + CHUNK_SIZE - 1n;

    const logs = await publicClient.getLogs({
      address: YOKI_JKP,
      events: JKP_EVENT_LIST,
      fromBlock: start,
      toBlock: end,
    });

    // Batch-fetch block timestamps for this chunk's unique blocks. The
    // match index stores resolvedAtTimestamp so walk-daily-champions.mjs
    // can derive firstMatchResolvedAt per day without re-RPC'ing.
    // Concurrency cap of 20 keeps Soneium public RPC happy on bootstrap
    // walks (1M block lookback can include ~thousands of unique blocks).
    const timestamps = await fetchBlockTimestamps(logs.map((l) => l.blockNumber));

    for (const log of logs) {
      const eventName = log.eventName ?? EVENT_NAMES_BY_TOPIC.get(log.topics?.[0]);
      if (!eventName || !JKP_EVENTS[eventName]) {
        console.warn(`[jkp] skipping unrecognized log at ${log.blockNumber}/${log.logIndex}`);
        continue;
      }

      const blockTimestamp = timestamps.get(log.blockNumber.toString()) ?? null;
      const record = {
        timestamp: new Date().toISOString(),
        blockNumber: log.blockNumber.toString(),
        blockTimestamp,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        eventName,
        args: serializeArgs(log.args),
      };
      await appendJsonl(EVENTS_JSONL, record);
      applyEventToMatches(matches, eventName, log, blockTimestamp);
      newEventCount += 1;
    }

    console.log(`[jkp] blocks ${start}-${end}: ${logs.length} events`);
  }

  await writeJson(MATCHES_FILE, {
    lastUpdatedBlock: latest.toString(),
    lastUpdatedAt: new Date().toISOString(),
    matchCount: Object.keys(matches).length,
    matches,
  });

  const aggregate = aggregateMatches(matches, MONITOR_IGNORE_LIST);
  await writeJson(AGGREGATE_FILE, {
    lastUpdatedBlock: latest.toString(),
    lastUpdatedAt: new Date().toISOString(),
    matchCount: aggregate.matchCount,
    addressCount: aggregate.rows.length,
    rows: aggregate.rows.sort((a, b) => b.matches - a.matches),
  });

  // Pairs persisted separately so the frontend leaderboard doesn't
  // download a quadratic-sized payload. Only the suspicious-pairs
  // trigger consumes this file.
  await writeJson(PAIRS_FILE, {
    lastUpdatedBlock: latest.toString(),
    lastUpdatedAt: new Date().toISOString(),
    pairCount: aggregate.pairs.length,
    pairs: aggregate.pairs.sort((a, b) => b.count - a.count),
  });

  await writeJson(CHECKPOINT_FILE, {
    blockNumber: latest.toString(),
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[jkp] done: ${newEventCount} new events, ${Object.keys(matches).length} total matches, ${aggregate.rows.length} address rows, checkpoint=${latest}`,
  );
}

// JSON.stringify chokes on BigInt; convert eagerly. Addresses are kept
// in their checksum casing as returned by viem so the audit log matches
// Blockscout exactly.
function serializeArgs(args) {
  const out = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = typeof v === "bigint" ? v.toString() : v;
  }
  return out;
}

// Fetch Unix-seconds timestamps for every unique blockNumber across the
// given logs. Returns Map<string, number>. Capped at 20-way parallelism.
async function fetchBlockTimestamps(blockNumbers) {
  const unique = [...new Set(blockNumbers.map((b) => b.toString()))];
  const out = new Map();
  const CONCURRENCY = 20;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const slice = unique.slice(i, i + CONCURRENCY);
    const blocks = await Promise.all(
      slice.map((bn) =>
        publicClient.getBlock({ blockNumber: BigInt(bn), includeTransactions: false }).catch((err) => {
          console.warn(`[jkp] getBlock(${bn}) failed: ${err.message}`);
          return null;
        }),
      ),
    );
    for (let j = 0; j < slice.length; j++) {
      const block = blocks[j];
      if (block?.timestamp != null) out.set(slice[j], Number(block.timestamp));
    }
  }
  return out;
}

main().catch((err) => {
  console.error("[jkp] error:", err);
  process.exit(1);
});
