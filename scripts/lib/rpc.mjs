import { createPublicClient, http } from "viem";
import { soneium } from "viem/chains";

// Shared viem public client for all cron scripts. RPC URL precedence:
//   1. SONEIUM_RPC_URL env (Alchemy / dRPC paid endpoint, set as a repo
//      secret in production)
//   2. viem's built-in Soneium chain default (public RPC, rate-limited)
//
// The cron cadence is low (15-60 min) so public RPC is sufficient for v0.
const rpcUrl = process.env.SONEIUM_RPC_URL || undefined;

export const publicClient = createPublicClient({
  chain: soneium,
  transport: http(rpcUrl, {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 30_000,
  }),
});
