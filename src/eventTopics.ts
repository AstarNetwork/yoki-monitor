import { keccak256, toBytes } from "viem";

// Precomputed topic[0] hashes for the YokiJKP events used to identify
// distinct participating players.
//
// MatchCreated is fired when playerA opens a match; MatchJoined is fired
// when playerB joins. Together they cover every address that participated
// without double-counting (later events like MatchRevealed re-emit
// addresses we already saw).
//
// Each indexed parameter occupies one topic slot; topic[1]=matchId,
// topic[2]=player address.

export const TOPIC_MATCH_CREATED = keccak256(toBytes("MatchCreated(uint256,address,uint256)"));
export const TOPIC_MATCH_JOINED = keccak256(toBytes("MatchJoined(uint256,address)"));

// The set of event signatures that mean "someone played" — playerA on
// MatchCreated, playerB on MatchJoined. Other events (MatchRevealed,
// MatchResolved, …) re-emit the same addresses, so including them would
// be redundant.
export const JKP_PARTICIPATION_TOPICS: ReadonlySet<string> = new Set([TOPIC_MATCH_CREATED, TOPIC_MATCH_JOINED]);

// Indexed-address topics arrive as 32-byte hex; the address is the trailing
// 20 bytes (40 hex chars). Returns lowercase 0x-prefixed address suitable
// for use as a Set key.
export function topicToAddress(topic: string): string {
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;
  if (hex.length < 40) return `0x${"0".repeat(40)}`;
  return `0x${hex.slice(-40).toLowerCase()}`;
}
