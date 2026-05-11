import { createPublicClient, http } from "viem";
import { soneium } from "viem/chains";

// Single public client for all read-only RPC calls. Caller-side hooks reuse
// this instance — viem batches reads and is safe across many concurrent
// callers on a single client.
//
// RPC URL precedence:
//   1. VITE_SONEIUM_RPC_URL build-time env var (Alchemy / dRPC paid tier)
//   2. Soneium's built-in chain config default RPC (public, rate-limited)
const rpcUrl = import.meta.env.VITE_SONEIUM_RPC_URL as string | undefined;

export const publicClient = createPublicClient({
  chain: soneium,
  transport: http(rpcUrl, {
    // Short retry on transient public-RPC throttle; longer pauses are not
    // useful since the page polls on a 60s cadence anyway.
    retryCount: 2,
    retryDelay: 500,
  }),
});
