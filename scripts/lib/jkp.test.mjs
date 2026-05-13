import { describe, expect, it } from "vitest";

import { aggregateMatches, applyEventToMatches } from "./jkp.mjs";

// Synthetic log helper. The walker calls applyEventToMatches with the
// log object viem produces; the fields we touch are args + blockNumber.
function log({ matchId, blockNumber, ...args }) {
  return {
    args: { matchId: BigInt(matchId), ...args },
    blockNumber: BigInt(blockNumber),
  };
}

const ALICE = "0xaaaa000000000000000000000000000000000001";
const BOB = "0xbbbb000000000000000000000000000000000002";
const CAROL = "0xcccc000000000000000000000000000000000003";
const BOT = "0x6489d6328dff18145719dcc54faca762dbd05ace"; // Bot 1
const ONE_ASTR = 1_000_000_000_000_000_000n;
const TIER1 = 100n * ONE_ASTR;

describe("applyEventToMatches", () => {
  it("creates a match record on MatchCreated and tracks offerAmount", () => {
    const matches = {};
    applyEventToMatches(
      matches,
      "MatchCreated",
      log({ matchId: 1, blockNumber: 100, playerA: ALICE, offerAmount: TIER1 }),
    );
    expect(matches["1"]).toMatchObject({
      matchId: "1",
      playerA: ALICE,
      playerB: null,
      offerAmount: TIER1.toString(),
      status: "created",
      createdBlock: 100,
    });
  });

  it("transitions status through join → reveal → resolved", () => {
    const matches = {};
    applyEventToMatches(
      matches,
      "MatchCreated",
      log({ matchId: 7, blockNumber: 1, playerA: ALICE, offerAmount: TIER1 }),
    );
    applyEventToMatches(matches, "MatchJoined", log({ matchId: 7, blockNumber: 2, playerB: BOB }));
    expect(matches["7"].status).toBe("joined");
    expect(matches["7"].playerB).toBe(BOB);

    applyEventToMatches(matches, "MatchRevealed", log({ matchId: 7, blockNumber: 3, player: ALICE }));
    expect(matches["7"].status).toBe("revealed");

    applyEventToMatches(matches, "MatchResolved", log({ matchId: 7, blockNumber: 4, winner: BOB, payout: 2n * TIER1 }));
    expect(matches["7"]).toMatchObject({
      status: "resolved",
      winner: BOB,
      resolvedBlock: 4,
    });
  });

  it("re-applying a terminal event is idempotent", () => {
    const matches = {};
    applyEventToMatches(
      matches,
      "MatchCreated",
      log({ matchId: 1, blockNumber: 1, playerA: ALICE, offerAmount: TIER1 }),
    );
    applyEventToMatches(matches, "MatchJoined", log({ matchId: 1, blockNumber: 2, playerB: BOB }));
    applyEventToMatches(
      matches,
      "MatchResolved",
      log({ matchId: 1, blockNumber: 3, winner: ALICE, payout: 2n * TIER1 }),
    );
    const snapshot = JSON.stringify(matches);
    applyEventToMatches(
      matches,
      "MatchResolved",
      log({ matchId: 1, blockNumber: 3, winner: ALICE, payout: 2n * TIER1 }),
    );
    expect(JSON.stringify(matches)).toBe(snapshot);
  });
});

describe("aggregateMatches", () => {
  const ignore = new Set([BOT]);

  function resolvedMatch(matchId, a, b, winner, offer = TIER1) {
    return {
      matchId: String(matchId),
      playerA: a,
      playerB: b,
      offerAmount: offer.toString(),
      status: "resolved",
      winner,
      createdBlock: 1,
      resolvedBlock: 2,
    };
  }

  function drawMatch(matchId, a, b, offer = TIER1) {
    return {
      matchId: String(matchId),
      playerA: a,
      playerB: b,
      offerAmount: offer.toString(),
      status: "draw",
      winner: null,
      createdBlock: 1,
      resolvedBlock: 2,
    };
  }

  it("counts wins/losses/draws and accumulates volume", () => {
    const matches = {
      1: resolvedMatch(1, ALICE, BOB, ALICE),
      2: resolvedMatch(2, ALICE, BOB, ALICE),
      3: resolvedMatch(3, ALICE, BOB, BOB),
      4: drawMatch(4, ALICE, BOB),
    };
    const { matchCount, rows } = aggregateMatches(matches, new Set());
    expect(matchCount).toBe(4);
    const alice = rows.find((r) => r.address === ALICE);
    const bob = rows.find((r) => r.address === BOB);
    expect(alice).toMatchObject({ wins: 2, losses: 1, draws: 1, matches: 4 });
    expect(bob).toMatchObject({ wins: 1, losses: 2, draws: 1, matches: 4 });
    // 4 matches × 100 ASTR each = 400 ASTR risked per side.
    expect(alice.volumeAstrWei).toBe((4n * TIER1).toString());
    expect(alice.uniqueOpponents).toBe(1);
    expect(alice.winRate).toBeCloseTo(0.5);
  });

  it("excludes matches where either participant is on the ignore list", () => {
    const matches = {
      1: resolvedMatch(1, ALICE, BOT, ALICE), // bot involved → drop
      2: resolvedMatch(2, ALICE, BOB, ALICE),
    };
    const { matchCount, rows } = aggregateMatches(matches, ignore);
    expect(matchCount).toBe(1);
    expect(rows.find((r) => r.address === BOT)).toBeUndefined();
    expect(rows.find((r) => r.address === ALICE)?.matches).toBe(1);
  });

  it("ignores cancelled and swept matches (no game played)", () => {
    const matches = {
      1: {
        matchId: "1",
        playerA: ALICE,
        playerB: BOB,
        offerAmount: TIER1.toString(),
        status: "cancelled",
        winner: null,
      },
      2: {
        matchId: "2",
        playerA: ALICE,
        playerB: BOB,
        offerAmount: TIER1.toString(),
        status: "swept",
        winner: null,
      },
      3: resolvedMatch(3, ALICE, BOB, ALICE),
    };
    const { matchCount, rows } = aggregateMatches(matches, new Set());
    expect(matchCount).toBe(1);
    expect(rows.find((r) => r.address === ALICE)?.matches).toBe(1);
  });

  it("skips matches missing a playerB (joined-never-resolved edge cases)", () => {
    const matches = {
      1: {
        matchId: "1",
        playerA: ALICE,
        playerB: null,
        offerAmount: TIER1.toString(),
        status: "resolved",
        winner: ALICE,
      },
    };
    const { matchCount } = aggregateMatches(matches, new Set());
    expect(matchCount).toBe(0);
  });

  it("counts unique opponents across distinct addresses", () => {
    const matches = {
      1: resolvedMatch(1, ALICE, BOB, ALICE),
      2: resolvedMatch(2, ALICE, CAROL, ALICE),
      3: resolvedMatch(3, ALICE, BOB, ALICE),
    };
    const { rows } = aggregateMatches(matches, new Set());
    const alice = rows.find((r) => r.address === ALICE);
    expect(alice?.matches).toBe(3);
    expect(alice?.uniqueOpponents).toBe(2);
  });

  it("emits canonical pair rows with each participant's match totals", () => {
    const matches = {
      1: resolvedMatch(1, ALICE, BOB, ALICE),
      // Same pair, B-then-A ordering should collapse to the same key.
      2: resolvedMatch(2, BOB, ALICE, BOB),
      3: resolvedMatch(3, ALICE, CAROL, ALICE),
    };
    const { pairs } = aggregateMatches(matches, new Set());
    expect(pairs).toHaveLength(2);
    const aliceBob = pairs.find(
      (p) => (p.addressA === ALICE && p.addressB === BOB) || (p.addressA === BOB && p.addressB === ALICE),
    );
    expect(aliceBob?.count).toBe(2);
    expect(aliceBob?.matchesA).toBeGreaterThan(0);
    expect(aliceBob?.matchesB).toBeGreaterThan(0);
  });
});
