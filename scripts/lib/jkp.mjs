// Shared JKP event ABIs + match-index aggregator. Used by the walker
// (writes the match index) and the always-winning trigger (reads the
// derived aggregate). Keep this in sync with repo/contracts/contracts/
// YokiJKP.sol:158-171.

import { parseAbiItem } from "viem";

// Event signatures verified 2026-05-13 against
// repo/contracts/contracts/YokiJKP.sol. DefaultWin is always emitted
// immediately before MatchResolved (contract lines 682-683) so capturing
// MatchResolved alone is sufficient for winner attribution.
export const JKP_EVENTS = {
  MatchCreated: parseAbiItem(
    "event MatchCreated(uint256 indexed matchId, address indexed playerA, uint256 offerAmount)",
  ),
  MatchJoined: parseAbiItem("event MatchJoined(uint256 indexed matchId, address indexed playerB)"),
  MatchRevealed: parseAbiItem("event MatchRevealed(uint256 indexed matchId, address indexed player)"),
  MatchResolved: parseAbiItem("event MatchResolved(uint256 indexed matchId, address indexed winner, uint256 payout)"),
  MatchDraw: parseAbiItem("event MatchDraw(uint256 indexed matchId, uint256 refundPerPlayer)"),
  MatchCancelled: parseAbiItem("event MatchCancelled(uint256 indexed matchId)"),
  MatchSwept: parseAbiItem(
    "event MatchSwept(uint256 indexed matchId, address indexed sweeper, uint256 astrToTreasury)",
  ),
};

export const JKP_EVENT_LIST = Object.values(JKP_EVENTS);

// Apply a single decoded event to the match index. Mutates `matches`
// in place. Idempotency: a re-walked event lands on the same matchId
// with the same terminal status, so re-application is safe.
//
// `blockTimestamp` (Unix seconds, optional) lets the walker stamp the
// match index with on-chain wall time. Used by walk-daily-champions.mjs
// to derive `firstMatchResolvedAt` per day without RPC roundtrips per
// tick. Pre-existing matches that were walked before this field
// existed simply don't have it set — the derivation gracefully skips
// matches with missing timestamps.
export function applyEventToMatches(matches, eventName, log, blockTimestamp = null) {
  const matchId = log.args.matchId.toString();
  const existing = matches[matchId] ?? {
    matchId,
    playerA: null,
    playerB: null,
    offerAmount: "0",
    status: "created",
    winner: null,
    createdBlock: null,
    resolvedBlock: null,
  };

  switch (eventName) {
    case "MatchCreated":
      existing.playerA = log.args.playerA.toLowerCase();
      existing.offerAmount = log.args.offerAmount.toString();
      existing.status = "created";
      existing.createdBlock = Number(log.blockNumber);
      if (typeof blockTimestamp === "number") existing.createdAtTimestamp = blockTimestamp;
      break;
    case "MatchJoined":
      existing.playerB = log.args.playerB.toLowerCase();
      existing.status = "joined";
      break;
    case "MatchRevealed":
      // Tracked for completeness; aggregator doesn't use reveal state.
      if (existing.status === "joined") existing.status = "revealed";
      break;
    case "MatchResolved":
      existing.winner = log.args.winner.toLowerCase();
      existing.status = "resolved";
      existing.resolvedBlock = Number(log.blockNumber);
      if (typeof blockTimestamp === "number") existing.resolvedAtTimestamp = blockTimestamp;
      break;
    case "MatchDraw":
      existing.status = "draw";
      existing.resolvedBlock = Number(log.blockNumber);
      if (typeof blockTimestamp === "number") existing.resolvedAtTimestamp = blockTimestamp;
      break;
    case "MatchCancelled":
      existing.status = "cancelled";
      existing.resolvedBlock = Number(log.blockNumber);
      if (typeof blockTimestamp === "number") existing.resolvedAtTimestamp = blockTimestamp;
      break;
    case "MatchSwept":
      existing.status = "swept";
      existing.resolvedBlock = Number(log.blockNumber);
      if (typeof blockTimestamp === "number") existing.resolvedAtTimestamp = blockTimestamp;
      break;
  }

  matches[matchId] = existing;
}

// Canonical pair key: lowercased addresses joined with "_" in
// lexicographic order. Same (A,B) and (B,A) hash to the same slot.
export function pairKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// Rebuild the per-address aggregate + pair counts from the match index.
// Pure function: trigger output is fully determined by matches.json.
//
// Aggregate rules (locked at YOKI_MONITOR_SPEC.md §4.2 + §11.2):
//   resolved → winner +1 W, other participant +1 L
//   draw     → both participants +1 D
//   swept    → neither tallied (no game actually played; both no-revealed)
//   cancelled → neither tallied (refund path, no opponent staked)
//
// Volume per address = sum of offerAmount across resolved/draw matches
// the address participated in (= what they actually staked and risked).
//
// Pair tracking: every counted match also increments the (A,B) pair
// counter. The suspicious-pairs trigger (§4.5 / §7.2) reads this to
// detect the 2-wallet collusion pattern.
export function aggregateMatches(matches, ignoreList) {
  const addresses = {};
  const pairs = {};

  const ensure = (addr) => {
    if (!addresses[addr]) {
      addresses[addr] = {
        wins: 0,
        losses: 0,
        draws: 0,
        matches: 0,
        volumeAstrWei: 0n,
        opponents: new Set(),
      };
    }
    return addresses[addr];
  };

  let countedMatches = 0;
  for (const m of Object.values(matches)) {
    if (m.status !== "resolved" && m.status !== "draw") continue;
    if (!m.playerA || !m.playerB) continue;
    if (ignoreList.has(m.playerA) || ignoreList.has(m.playerB)) continue;

    countedMatches += 1;
    const offerAmount = BigInt(m.offerAmount);
    const a = ensure(m.playerA);
    const b = ensure(m.playerB);
    a.matches += 1;
    b.matches += 1;
    a.volumeAstrWei += offerAmount;
    b.volumeAstrWei += offerAmount;
    a.opponents.add(m.playerB);
    b.opponents.add(m.playerA);

    if (m.status === "draw") {
      a.draws += 1;
      b.draws += 1;
    } else if (m.winner === m.playerA) {
      a.wins += 1;
      b.losses += 1;
    } else if (m.winner === m.playerB) {
      b.wins += 1;
      a.losses += 1;
    }

    const key = pairKey(m.playerA, m.playerB);
    if (!pairs[key]) {
      pairs[key] = { addressA: m.playerA, addressB: m.playerB, count: 0 };
    }
    pairs[key].count += 1;
  }

  const rows = Object.entries(addresses).map(([address, agg]) => ({
    address,
    wins: agg.wins,
    losses: agg.losses,
    draws: agg.draws,
    matches: agg.matches,
    volumeAstrWei: agg.volumeAstrWei.toString(),
    uniqueOpponents: agg.opponents.size,
    winRate: agg.matches > 0 ? agg.wins / agg.matches : 0,
  }));

  // Pair rows carry the participants' total-match counts so the trigger
  // can apply the "≥50% of A's or B's matches" rule without re-joining
  // against rows[].
  const pairRows = Object.values(pairs).map((p) => ({
    addressA: p.addressA,
    addressB: p.addressB,
    count: p.count,
    matchesA: addresses[p.addressA].matches,
    matchesB: addresses[p.addressB].matches,
  }));

  return {
    matchCount: countedMatches,
    rows,
    pairs: pairRows,
  };
}
