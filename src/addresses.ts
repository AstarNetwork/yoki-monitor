// Soneium mainnet addresses for Yoki Arcade contracts + operational
// wallets that the monitor surfaces. Update when keys rotate or contracts
// redeploy.

export const SONEIUM_CHAIN_ID = 1868;

// ERC-20 tokens
export const ASTR_TOKEN = "0x2CAE934a1e84F693fbb78CA5ED3B0A6893259441" as const;
export const ASTR_DECIMALS = 18;

// Yoki Arcade contracts
export const YOKI_CORES = "0x1543EBfdA2D432fA26eA55c8f48b9253D2cCeDeb" as const;
export const YOKI_JKP = "0xdcd1010E33063EA6990b488BdDDa6CC107F307b3" as const;

// Operational wallets
// MINTER hot wallet — signs adminMintBundle on the claim Lambda. Revoke 2026-06-02.
export const MINTER_HOT_WALLET = "0x3dAd4128E91F82Fe7b7B631977764D0Cab024DDD" as const;

// Yoki treasury EOA — receives ASTR from every YokiCores mint
// (astrToken.safeTransferFrom(msg.sender, treasury, mintPrice)).
export const YOKI_TREASURY = "0xfA2B079adf1d9FcBCb452503B23c18EE74fA907f" as const;

// Yoki Safe — 3-of-5 multisig holding DEFAULT_ADMIN_ROLE on YokiCores + YokiJKP.
export const YOKI_SAFE = "0xdA9A0a42D19206D5dA00300ac182d518F34AB126" as const;

// Bot matchmaking wallets — provide fallback opponents at each ASTR tier
// when the human queue is sparse. Displayed on the SPA for operational
// visibility (ETH + ASTR balance per bot). The bot Lambda owns its own
// auto-disable thresholds + alerting; yoki-monitor's role here is
// snapshotting + historical record, not gating.
//
// `launchAstr` is the wei-denominated ASTR balance at game launch
// (2026-05-11 T-0), used to compute PnL = balanceOf(now) - launchAstr.
// `null` means the launch balance wasn't recorded (funding wallet is a
// refill source rather than a player, so its delta isn't meaningful).
const ASTR = 10n ** 18n;
export const BOT_WALLETS = [
  {
    label: "Funding",
    address: "0x7455e5D9a8D4f043A41173F97BEdCCB2eF685861" as `0x${string}`,
    launchAstr: null,
  },
  {
    label: "Bot 1",
    address: "0x6489d6328dff18145719dcc54faca762dbd05ace" as `0x${string}`,
    launchAstr: 5_000n * ASTR,
  },
  {
    label: "Bot 2",
    address: "0xcD018419c2C1bD59659FaB91bd49D8D302C1E7b9" as `0x${string}`,
    launchAstr: 5_000n * ASTR,
  },
  {
    label: "Bot 3",
    address: "0x3665D411fFb3b8F672D1e4B8d8DF4DEb00636b5A" as `0x${string}`,
    launchAstr: 15_000n * ASTR,
  },
  {
    label: "Bot 4",
    address: "0x84CeC056300E5f73575c44e7e8F280bd3c113320" as `0x${string}`,
    launchAstr: 5_000n * ASTR,
  },
] as const;

// Total ASTR float across the 4 player bots at launch.
// Used for the aggregate PnL line under the bot table.
export const BOT_LAUNCH_TOTAL_ASTR: bigint = BOT_WALLETS.reduce(
  (acc, b) => acc + (b.launchAstr ?? 0n),
  0n,
);

// Public launch date — used as the T-0 baseline for bot PnL and as a
// human-readable stamp on the SPA.
export const YOKI_ARCADE_LAUNCH_DATE = "2026-05-11" as const;

// Raw URL for the hourly treasury balance JSONL written by the 1.2 cron.
// Overridable via VITE_TREASURY_BALANCE_JSONL_URL for local dev / private
// forks. Used by the 24h-inflow line on the Treasury card.
export const DEFAULT_TREASURY_BALANCE_JSONL_URL =
  "https://raw.githubusercontent.com/AstarNetwork/yoki-monitor/main/data/treasury-balance.jsonl";

// Blockscout base URL for clickable wallet/tx links.
export const BLOCKSCOUT_BASE = "https://soneium.blockscout.com";
export const BLOCKSCOUT_API_BASE = `${BLOCKSCOUT_BASE}/api/v2`;

export function blockscoutAddressUrl(address: string): string {
  return `${BLOCKSCOUT_BASE}/address/${address}`;
}

export function blockscoutTokenHoldersUrl(token: string): string {
  return `${BLOCKSCOUT_BASE}/token/${token}?tab=holders`;
}

// Wallets to exclude from the JKP active-player count. Same set as
// BOT_WALLETS above, but as a lowercased Set for O(1) membership checks.
// Counting bots as players would inflate engagement numbers.
export const MONITOR_IGNORE_LIST: ReadonlySet<string> = new Set(
  BOT_WALLETS.map((b) => b.address.toLowerCase()),
);
